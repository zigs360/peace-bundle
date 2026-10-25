const { Op } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { User, Wallet, Transaction, WebhookEvent, DepositReconciliationAudit, SystemSetting } = require('../models');
const virtualAccountService = require('./virtualAccountService');
const notificationRealtimeService = require('./notificationRealtimeService');

class DepositReconciliationEngine {
  constructor() {
    this.supportedProviders = ['payvessel', 'billstack', 'palmpay', '9psb', 'monnify', 'paystack'];
  }

  /**
   * Normalize phone number to standard formats for matching
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;
    const clean = String(phone).replace(/\D/g, '');
    if (!clean) return null;
    if (clean.startsWith('234') && clean.length === 13) {
      return `0${clean.slice(3)}`;
    }
    if (clean.length === 10 && !clean.startsWith('0')) {
      return `0${clean}`;
    }
    return clean;
  }

  /**
   * Multi-strategy user resolution
   */
  async resolveUser({
    userId = null,
    accountNumber = null,
    email = null,
    phone = null,
    merchantReference = null,
    reference = null,
    metadata = {}
  } = {}) {
    // Strategy 1: Direct userId
    if (userId) {
      try {
        const user = await User.findByPk(userId);
        if (user) return { user, strategy: 'direct_user_id' };
      } catch (err) {
        logger.warn(`[DepositReconciliationEngine] Strategy 1 failed for userId ${userId}:`, err.message);
      }
    }

    // Strategy 2: Merchant Reference (PB-<userId>)
    const refToTest = merchantReference || reference;
    if (refToTest && String(refToTest).startsWith('PB-')) {
      const candidateId = String(refToTest).slice(3).trim();
      if (/^[0-9a-fA-F-]{36}$/.test(candidateId)) {
        try {
          const user = await User.findByPk(candidateId);
          if (user) return { user, strategy: 'merchant_reference_id' };
        } catch (err) {
          logger.warn(`[DepositReconciliationEngine] Strategy 2 failed for ref ${refToTest}:`, err.message);
        }
      }
    }

    // Strategy 3: NUBAN / Virtual Account Number Matching (primary & dual accounts)
    if (accountNumber) {
      const cleanAcc = String(accountNumber).trim();
      try {
        const user = await virtualAccountService.findUserByAccountNumber(cleanAcc);
        if (user) return { user, strategy: 'virtual_account_number' };
      } catch (err) {
        logger.warn(`[DepositReconciliationEngine] Strategy 3 failed for acc ${cleanAcc}:`, err.message);
      }
    }

    // Strategy 4: Customer Email matching (case-insensitive)
    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      try {
        const user = await User.findOne({
          where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), cleanEmail)
        });
        if (user) return { user, strategy: 'customer_email' };
      } catch (err) {
        logger.warn(`[DepositReconciliationEngine] Strategy 4 failed for email ${cleanEmail}:`, err.message);
      }
    }

    // Strategy 5: Customer Phone matching
    if (phone) {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      if (normalizedPhone && normalizedPhone.length >= 10) {
        try {
          const user = await User.findOne({
            where: {
              phone: {
                [Op.or]: [
                  normalizedPhone,
                  `+234${normalizedPhone.slice(-10)}`,
                  `234${normalizedPhone.slice(-10)}`,
                  normalizedPhone.slice(-10)
                ]
              }
            }
          });
          if (user) return { user, strategy: 'customer_phone' };
        } catch (err) {
          logger.warn(`[DepositReconciliationEngine] Strategy 5 failed for phone ${phone}:`, err.message);
        }
      }
    }

    return { user: null, strategy: 'none' };
  }

  /**
   * Check if a deposit has already been credited in the ledger or audit logs
   */
  async isAlreadyCredited({ reference, billstackReference, interBankReference, transactionRef, transaction = null }) {
    if (!reference) return false;

    // 1. Direct check in Transaction table
    const directTx = await Transaction.findOne({
      where: { reference },
      transaction
    });
    if (directTx) return true;

    // 2. Metadata reference check in Transaction table
    const dialect = sequelize.getDialect?.() || 'postgres';
    if (dialect === 'postgres') {
      const conditions = [];
      if (billstackReference) {
        conditions.push(sequelize.literal(`metadata->>'billstack_reference' = '${String(billstackReference).replace(/'/g, "''")}'`));
      }
      if (interBankReference) {
        conditions.push(sequelize.literal(`metadata->>'inter_bank_reference' = '${String(interBankReference).replace(/'/g, "''")}'`));
      }
      if (transactionRef) {
        conditions.push(sequelize.literal(`metadata->>'transaction_ref' = '${String(transactionRef).replace(/'/g, "''")}'`));
      }

      if (conditions.length > 0) {
        const existingTx = await Transaction.findOne({
          where: {
            type: 'credit',
            source: 'funding',
            [Op.or]: conditions
          },
          transaction
        });
        if (existingTx) return true;
      }
    }

    // 3. Check settled status in DepositReconciliationAudit
    const existingAudit = await DepositReconciliationAudit.findOne({
      where: {
        transactionReference: reference,
        status: 'settled'
      },
      transaction
    });
    if (existingAudit) return true;

    return false;
  }

  /**
   * Extract standardized deposit fields from heterogeneous event payloads
   */
  extractDepositRecord(source) {
    const payload = source.payload || source;
    const data = payload?.data || payload;
    const order = payload?.order || data?.order || {};
    const customer = payload?.customer || data?.customer || payload?.eventData?.customerDTO || data?.payer || {};

    const reference = 
      source.reference ||
      data?.reference ||
      data?.transaction_ref ||
      data?.merchant_reference ||
      order?.reference ||
      payload?.reference ||
      payload?.eventData?.transactionReference ||
      null;

    const rawAmount =
      source.amount ??
      order?.amount ??
      order?.settlement_amount ??
      data?.amount ??
      data?.amount_paid ??
      payload?.amount ??
      payload?.eventData?.amountPaid ??
      0;
    const amount = parseFloat(rawAmount);

    const fee = parseFloat(
      order?.fee ??
      data?.fee ??
      payload?.fee ??
      0
    );

    const accountNumber =
      source.accountNumber ||
      source.account_number ||
      order?.settlement_account ||
      order?.settlementAccount ||
      order?.account_number ||
      order?.accountNumber ||
      data?.account_number ||
      data?.accountNumber ||
      data?.virtual_account_number ||
      data?.destination_account_number ||
      data?.settlement_account ||
      data?.cr_account_no ||
      data?.account?.number ||
      payload?.account_number ||
      payload?.virtual_account_number ||
      payload?.eventData?.destinationAccountInformation?.accountNumber ||
      null;

    const email = customer?.email || data?.email || payload?.email || null;
    const phone = customer?.phone || data?.phone || payload?.phone || null;
    const provider = String(source.provider || data?.provider || payload?.provider || 'unknown').toLowerCase();
    const billstackReference = data?.billstack_reference || data?.wiaxy_ref || payload?.billstack_reference || null;
    const interBankReference = data?.wiaxy_ref || null;
    const transactionRef = data?.transaction_ref || null;

    return {
      reference,
      amount,
      fee,
      netAmount: amount,
      accountNumber,
      email,
      phone,
      provider,
      billstackReference,
      interBankReference,
      transactionRef,
      rawPayload: payload
    };
  }

  /**
   * Reconcile a single deposit entry (either an existing WebhookEvent or external payment record)
   */
  async reconcileSingleDeposit(entry, {
    dryRun = false,
    reconciliationType = 'historical_batch',
    operator = 'system'
  } = {}) {
    const record = this.extractDepositRecord(entry);
    const { reference, amount, fee, accountNumber, email, phone, provider, billstackReference, interBankReference, transactionRef, rawPayload } = record;

    if (!reference || !Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        status: 'invalid_record',
        reason: 'missing_reference_or_positive_amount',
        reference
      };
    }

    // 1. Resolve user
    const { user, strategy } = await this.resolveUser({
      userId: entry.userId || rawPayload?.userId,
      accountNumber,
      email,
      phone,
      reference,
      metadata: rawPayload
    });

    if (!user) {
      logger.warn(`[DepositReconciliationEngine] User could not be resolved for deposit ref: ${reference}, provider: ${provider}`);
      return {
        ok: false,
        status: 'unresolved_user',
        reason: 'user_not_found',
        reference,
        amount,
        accountNumber,
        provider
      };
    }

    // 2. Check if already credited
    const alreadyCredited = await this.isAlreadyCredited({
      reference,
      billstackReference,
      interBankReference,
      transactionRef
    });

    if (alreadyCredited) {
      if (!dryRun && entry.id && entry.status !== 'processed') {
        try {
          await WebhookEvent.update({ status: 'processed', userId: user.id, processed_at: new Date() }, { where: { id: entry.id } });
        } catch (_) {}
      }
      return {
        ok: true,
        duplicate: true,
        status: 'already_credited',
        reference,
        userId: user.id,
        amount
      };
    }

    // 3. Dry-Run Mode Preview
    const currentWallet = await Wallet.findOne({ where: { userId: user.id } });
    const currentBalance = currentWallet ? parseFloat(currentWallet.balance || 0) : 0;
    const projectedBalanceAfter = currentBalance + amount;

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        status: 'dry_run_matched',
        reference,
        userId: user.id,
        userEmail: user.email,
        amount,
        fee,
        resolutionStrategy: strategy,
        provider,
        accountNumber,
        walletBalanceBefore: currentBalance,
        walletBalanceAfter: projectedBalanceAfter
      };
    }

    // 4. Live Mode ACID Transaction with Row-Level Lock
    const t = await sequelize.transaction();
    try {
      // Row-level lock on Wallet (SELECT ... FOR UPDATE)
      let wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!wallet) {
        wallet = await Wallet.create(
          { id: crypto.randomUUID(), userId: user.id, balance: 0 },
          { transaction: t }
        );
      }

      // Re-verify duplicate within lock
      const lockedAlreadyCredited = await this.isAlreadyCredited({
        reference,
        billstackReference,
        interBankReference,
        transactionRef,
        transaction: t
      });

      if (lockedAlreadyCredited) {
        await t.rollback();
        if (entry.id && entry.status !== 'processed') {
          await WebhookEvent.update({ status: 'processed', userId: user.id, processed_at: new Date() }, { where: { id: entry.id } });
        }
        return {
          ok: true,
          duplicate: true,
          status: 'already_credited',
          reference,
          userId: user.id,
          amount
        };
      }

      const balanceBefore = parseFloat(wallet.balance || 0);

      // Increment balance
      await wallet.increment('balance', { by: amount, transaction: t });
      await wallet.reload({ transaction: t });
      const balanceAfter = parseFloat(wallet.balance || 0);

      // Create ledger Transaction
      const transactionRecord = await Transaction.create({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        userId: user.id,
        type: 'credit',
        amount: amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: 'funding',
        reference: reference,
        description: `Reconciled Bank Transfer: ${reference}`,
        metadata: {
          ...rawPayload,
          reconciled_by: 'deposit_reconciliation_engine',
          reconciliation_type: reconciliationType,
          reconciled_at: new Date().toISOString(),
          gross_amount: amount + (fee > 0 ? fee : 0),
          fee_amount: fee,
          net_amount: amount,
          gateway: provider || 'bank_transfer',
          operator
        },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: t });

      // Create immutable DepositReconciliationAudit record
      const auditRecord = await DepositReconciliationAudit.create({
        id: crypto.randomUUID(),
        transactionReference: reference,
        userId: user.id,
        walletId: wallet.id,
        transactionId: transactionRecord.id,
        amount: amount,
        gatewayProvider: provider || 'bank_transfer',
        accountNumber: accountNumber || null,
        reconciliationType: reconciliationType,
        status: 'settled',
        isReconciled: true,
        walletBalanceBefore: balanceBefore,
        walletBalanceAfter: balanceAfter,
        metadata: {
          operator,
          resolutionStrategy: strategy,
          fee,
          originalEventId: entry.id || null
        },
        timestampCredited: new Date()
      }, { transaction: t });

      // Mark WebhookEvent as processed if applicable
      if (entry.id) {
        await WebhookEvent.update(
          { status: 'processed', userId: user.id, processed_at: new Date() },
          { where: { id: entry.id }, transaction: t }
        );
      }

      await t.commit();

      logger.info(`[DepositReconciliationEngine] Settled deposit ref: ${reference} for user ${user.id} (${user.email}) - ₦${amount}. New balance: ₦${balanceAfter}`);

      // Dispatch User Notifications Post-Commit
      this.dispatchUserNotifications(user, {
        reference,
        amount,
        balance: balanceAfter,
        gateway: provider || 'bank_transfer'
      });

      return {
        ok: true,
        status: 'settled',
        reference,
        userId: user.id,
        userEmail: user.email,
        amount,
        balanceBefore,
        balanceAfter,
        transactionId: transactionRecord.id,
        auditId: auditRecord.id
      };
    } catch (err) {
      if (t && !t.finished) await t.rollback();
      logger.error(`[DepositReconciliationEngine] Transaction failed for ref: ${reference}:`, err.message);
      throw err;
    }
  }

  /**
   * Dispatch Socket.IO and in-app notifications to the credited user
   */
  dispatchUserNotifications(user, { reference, amount, balance, gateway }) {
    try {
      notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
        reference,
        amount,
        gateway,
        balance
      });
    } catch (socketErr) {
      logger.warn(`[DepositReconciliationEngine] Socket emit error for user ${user.id}:`, socketErr.message);
    }

    try {
      void notificationRealtimeService.sendToUser(user.id, {
        title: 'Wallet Funded (Reconciled)',
        message: `Your wallet has been credited with ₦${Number(amount).toLocaleString()} via Bank Transfer (${gateway.toUpperCase()}). Ref: ${reference}`,
        type: 'success',
        priority: 'high',
        link: '/dashboard',
        metadata: {
          kind: 'wallet_funding_reconciled',
          reference,
          amount: Number(amount),
          gateway,
          balance
        }
      });
    } catch (notifErr) {
      logger.warn(`[DepositReconciliationEngine] In-app notification error for user ${user.id}:`, notifErr.message);
    }
  }

  /**
   * Batch reconciliation over uncredited WebhookEvent records
   */
  async reconcileUncreditedWebhookEvents({
    limit = 100,
    hours = 72,
    provider = 'all',
    dryRun = false,
    operator = 'system'
  } = {}) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const where = {
      status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] },
      createdAt: { [Op.gte]: since }
    };

    if (provider && provider !== 'all') {
      where.provider = String(provider).toLowerCase();
    }

    const candidateEvents = await WebhookEvent.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 500)
    });

    let scanned = candidateEvents.length;
    let matchedCount = 0;
    let settledCount = 0;
    let duplicateCount = 0;
    let unresolvedCount = 0;
    let totalRecoveredAmount = 0;
    const items = [];

    for (const event of candidateEvents) {
      try {
        const res = await this.reconcileSingleDeposit(event, {
          dryRun,
          reconciliationType: dryRun ? 'historical_dry_run' : 'historical_batch',
          operator
        });

        if (res.ok && res.status === 'settled') {
          settledCount++;
          totalRecoveredAmount += (res.amount || 0);
          items.push(res);
        } else if (res.ok && res.dryRun) {
          matchedCount++;
          totalRecoveredAmount += (res.amount || 0);
          items.push(res);
        } else if (res.ok && res.duplicate) {
          duplicateCount++;
          items.push(res);
        } else {
          unresolvedCount++;
          items.push(res);
        }
      } catch (eventErr) {
        unresolvedCount++;
        items.push({
          ok: false,
          reference: event.reference,
          status: 'error',
          error: eventErr.message
        });
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      dryRun,
      provider,
      scanned,
      matchedCount,
      settledCount,
      duplicateCount,
      unresolvedCount,
      totalRecoveredAmount,
      items
    };

    if (!dryRun) {
      await this.persistReconciliationSummary(summary);
    }

    return summary;
  }

  /**
   * Batch reconciliation over externally provided array of transactions (e.g. gateway CSV/JSON dump)
   */
  async reconcileExternalBatch({
    records = [],
    dryRun = false,
    provider = 'gateway_dump',
    operator = 'admin',
    reconciliationType = 'file_import'
  } = {}) {
    if (!Array.isArray(records)) {
      throw new Error('Records must be an array of transaction objects');
    }

    let scanned = records.length;
    let matchedCount = 0;
    let settledCount = 0;
    let duplicateCount = 0;
    let unresolvedCount = 0;
    let totalRecoveredAmount = 0;
    const items = [];

    for (const record of records) {
      try {
        const entry = {
          provider: record.provider || provider,
          ...record
        };

        const res = await this.reconcileSingleDeposit(entry, {
          dryRun,
          reconciliationType,
          operator
        });

        if (res.ok && res.status === 'settled') {
          settledCount++;
          totalRecoveredAmount += (res.amount || 0);
          items.push(res);
        } else if (res.ok && res.dryRun) {
          matchedCount++;
          totalRecoveredAmount += (res.amount || 0);
          items.push(res);
        } else if (res.ok && res.duplicate) {
          duplicateCount++;
          items.push(res);
        } else {
          unresolvedCount++;
          items.push(res);
        }
      } catch (err) {
        unresolvedCount++;
        items.push({
          ok: false,
          reference: record.reference,
          status: 'error',
          error: err.message
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      dryRun,
      provider,
      scanned,
      matchedCount,
      settledCount,
      duplicateCount,
      unresolvedCount,
      totalRecoveredAmount,
      items
    };
  }

  /**
   * User-specific deposit reconciliation on demand
   */
  async reconcileUserDeposits(userId, { dryRun = false, hours = 168, operator = 'user' } = {}) {
    if (!userId) throw new Error('User ID is required');
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    const accountNumbers = new Set();
    if (user.virtual_account_number) accountNumbers.add(String(user.virtual_account_number).trim());

    const meta = user.metadata || {};
    const dualAccounts = meta?.dual_virtual_accounts?.accounts || {};
    for (const key of Object.keys(dualAccounts)) {
      const rec = dualAccounts[key];
      const acc = rec?.accountNumber || rec?.account_number || rec?.accountNo || rec?.number;
      if (acc) accountNumbers.add(String(acc).trim());
    }

    const singleKeys = [
      meta?.virtual_account?.account_number,
      meta?.virtual_account?.accountNumber,
      meta?.billstack?.account_number,
      meta?.billstack?.accountNumber,
      meta?.payvessel?.account_number,
      meta?.payvessel?.accountNumber,
      meta?.old_safehaven_account?.accountNumber,
      meta?.old_safehaven_account?.number,
      meta?.safehaven?.account_number,
      meta?.safehaven?.accountNumber,
    ];
    for (const s of singleKeys) {
      if (s) accountNumbers.add(String(s).trim());
    }

    const cleanEmail = user.email ? String(user.email).trim().toLowerCase() : null;
    const cleanPhone = user.phone ? String(user.phone).trim() : null;
    const merchantRef = `PB-${user.id}`;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const candidateEvents = await WebhookEvent.findAll({
      where: {
        createdAt: { [Op.gte]: since },
        status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] }
      },
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const userCandidates = [];
    const accList = Array.from(accountNumbers);

    for (const ev of candidateEvents) {
      const payloadStr = JSON.stringify(ev.payload || {});
      const matchesUserId = ev.userId === user.id;
      const matchesRef = ev.reference && (ev.reference === merchantRef || ev.reference.includes(user.id));
      const matchesAcc = accList.some(acc => payloadStr.includes(acc));
      const matchesEmail = cleanEmail && payloadStr.toLowerCase().includes(cleanEmail);
      const matchesPhone = cleanPhone && payloadStr.includes(cleanPhone);
      const matchesMerchant = payloadStr.includes(merchantRef);

      if (matchesUserId || matchesRef || matchesAcc || matchesEmail || matchesPhone || matchesMerchant) {
        userCandidates.push(ev);
      }
    }

    let newlyCreditedCount = 0;
    let totalCreditedAmount = 0;
    const newlyCredited = [];

    for (const ev of userCandidates) {
      const res = await this.reconcileSingleDeposit(ev, {
        dryRun,
        reconciliationType: 'user_on_demand_sync',
        operator
      });

      if (res.ok && (res.status === 'settled' || res.status === 'dry_run_matched')) {
        newlyCreditedCount++;
        totalCreditedAmount += (res.amount || 0);
        newlyCredited.push({
          reference: res.reference,
          amount: res.amount,
          status: res.status
        });
      }
    }

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const currentBalance = wallet ? parseFloat(wallet.balance) : 0;

    return {
      success: true,
      userId: user.id,
      dryRun,
      scannedCandidateCount: userCandidates.length,
      newlyCreditedCount,
      newlyCredited,
      totalCreditedAmount,
      currentBalance: dryRun ? currentBalance + totalCreditedAmount : currentBalance
    };
  }

  /**
   * Persist summary telemetry into SystemSetting
   */
  async persistReconciliationSummary(summary) {
    try {
      await SystemSetting.set('deposit_last_reconciliation_summary', JSON.stringify(summary), 'json', 'reconciliation');
      await SystemSetting.set('deposit_last_reconciliation_run_at', summary.timestamp, 'string', 'reconciliation');
    } catch (err) {
      logger.warn('[DepositReconciliationEngine] Could not persist summary to SystemSetting:', err.message);
    }
  }

  /**
   * Query paginated audit history
   */
  async getAuditHistory({ page = 1, limit = 25, status, provider, userId, reference, startDate, endDate } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const where = {};
    if (status && status !== 'all') where.status = status;
    if (provider && provider !== 'all') where.gatewayProvider = provider;
    if (userId) where.userId = userId;
    if (reference) where.transactionReference = { [Op.iLike]: `%${reference}%` };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await DepositReconciliationAudit.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
      ]
    });

    return {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum),
      audits: rows
    };
  }

  /**
   * Telemetry summary statistics
   */
  async getSummaryStats() {
    const [totalAudits, settledAudits, dryRunAudits, volumeResult] = await Promise.all([
      DepositReconciliationAudit.count(),
      DepositReconciliationAudit.count({ where: { status: 'settled' } }),
      DepositReconciliationAudit.count({ where: { status: 'dry_run_matched' } }),
      DepositReconciliationAudit.findAll({
        attributes: [
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_volume']
        ],
        where: { status: 'settled' },
        raw: true
      })
    ]);

    const totalRecoveredVolume = parseFloat(volumeResult[0]?.total_volume || 0);

    let lastReport = null;
    try {
      const setting = await SystemSetting.get('deposit_last_reconciliation_summary');
      if (setting) lastReport = typeof setting === 'string' ? JSON.parse(setting) : setting;
    } catch (_) {}

    return {
      totalAudits,
      settledAudits,
      dryRunAudits,
      totalRecoveredVolume,
      lastReport
    };
  }
}

module.exports = new DepositReconciliationEngine();
