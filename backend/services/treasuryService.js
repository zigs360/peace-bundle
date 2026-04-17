const sequelize = require('../config/database');
const { QueryTypes, Op, Transaction: SequelizeTransaction } = require('sequelize');
const SystemSetting = require('../models/SystemSetting');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const TransactionModel = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');
const User = require('../models/User');
const notificationRealtimeService = require('./notificationRealtimeService');
const logger = require('../utils/logger');
const crypto = require('crypto');

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const genRef = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const parseDateOrEpoch = (value) => {
  if (!value) return new Date(0);
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date(0);
};

class TreasuryService {
  constructor() {
    this._sqliteSyncGate = Promise.resolve();
    this._alertCooldowns = new Map();
  }

  async withSqliteSyncMutex(fn) {
    const previous = this._sqliteSyncGate;
    let release;
    this._sqliteSyncGate = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      if (release) release();
    }
  }

  async acquireSyncLock(transaction) {
    const dialect = sequelize.getDialect ? sequelize.getDialect() : null;
    if (!transaction) return;
    if (dialect !== 'postgres') return;
    await sequelize.query('SELECT pg_advisory_xact_lock(:lock_key)', {
      replacements: { lock_key: 914002711 },
      type: QueryTypes.SELECT,
      transaction,
    });
  }

  async getSettingRowForUpdate(key, transaction) {
    const dialect = sequelize.getDialect ? sequelize.getDialect() : null;
    const row = await SystemSetting.findOne({
      where: { key },
      transaction,
      ...(dialect === 'sqlite' ? {} : { lock: transaction.LOCK.UPDATE }),
    });
    if (row) return row;
    return SystemSetting.create(
      { key, value: '', type: 'string', group: 'treasury', description: 'Last treasury sync timestamp' },
      { transaction },
    );
  }

  async emitTreasuryBalanceUpdate(reason = null) {
    try {
      const connected = notificationRealtimeService.getConnectedUserIds();
      if (!connected.length) return;

      const admins = await User.findAll({
        where: { id: connected, role: 'admin' },
        attributes: ['id'],
      });
      if (!admins.length) return;

      const snapshot = await this.getTreasurySnapshot();
      const lastSyncAt = await SystemSetting.get('treasury_last_sync_at', null);
      const payload = {
        balance: snapshot.balance,
        currency: 'NGN',
        lastSyncAt: lastSyncAt || null,
        updatedAt: new Date().toISOString(),
        reason: reason || null,
        snapshot,
      };

      for (const a of admins) {
        notificationRealtimeService.emitToUser(a.id, 'treasury_balance_updated', payload);
      }
    } catch (e) {
      logger.error('[Treasury] Failed to emit balance update', { error: e.message });
    }
  }

  getRevenueRecognitionAt(txn) {
    const candidates = [txn?.completed_at, txn?.completedAt, txn?.updatedAt, txn?.createdAt];
    for (const value of candidates) {
      const parsed = parseDateOrEpoch(value);
      if (parsed.getTime() > 0) return parsed;
    }
    return new Date(0);
  }

  isWithinWindow(date, since, until) {
    const ts = date instanceof Date ? date.getTime() : parseDateOrEpoch(date).getTime();
    return ts > since.getTime() && ts <= until.getTime();
  }

  async sendTreasuryAlert({
    key,
    title,
    message,
    metadata = {},
    type = 'warning',
    priority = 'high',
    cooldownMs = Number(process.env.TREASURY_ALERT_COOLDOWN_MS || 10 * 60 * 1000),
  }) {
    try {
      const now = Date.now();
      const previous = this._alertCooldowns.get(key) || 0;
      if (now - previous < cooldownMs) return { ok: true, suppressed: true };

      const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
      const adminIds = admins.map((admin) => admin.id);
      if (!adminIds.length) return { ok: true, suppressed: true, reason: 'no_admins' };

      await notificationRealtimeService.sendBulk(adminIds, {
        title,
        message,
        type,
        priority,
        link: '/admin/treasury',
        metadata,
      });
      this._alertCooldowns.set(key, now);
      logger.warn('[Treasury] Alert sent', { key, title, metadata });
      return { ok: true, alerted: true };
    } catch (e) {
      logger.error('[Treasury] Failed to send alert', { key, error: e.message });
      return { ok: false, error: e.message };
    }
  }

  buildTimeWindowWhere(since, until) {
    return {
      [Op.or]: [
        { createdAt: { [Op.gt]: since, [Op.lte]: until } },
        { updatedAt: { [Op.gt]: since, [Op.lte]: until } },
        { completed_at: { [Op.gt]: since, [Op.lte]: until } },
      ],
    };
  }

  async collectRevenueCandidates({ since, until, transaction }) {
    const dialect = sequelize.getDialect ? sequelize.getDialect() : null;
    const candidates = await TransactionModel.findAll({
      where: {
        status: 'completed',
        [Op.and]: [
          {
            [Op.or]: [
              { type: 'credit', source: 'funding' },
              { type: 'debit', source: 'data_purchase' },
            ],
          },
          this.buildTimeWindowWhere(since, until),
        ],
      },
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      transaction,
      ...(dialect === 'sqlite' ? {} : { lock: transaction.LOCK.UPDATE }),
    });

    const dataPlanIds = Array.from(
      new Set(
        candidates
          .filter((txn) => txn.source === 'data_purchase' && txn.dataPlanId)
          .map((txn) => txn.dataPlanId)
      )
    );

    const plans = dataPlanIds.length
      ? await DataPlan.findAll({
          where: { id: dataPlanIds },
          transaction,
          ...(dialect === 'sqlite' ? {} : { lock: transaction.LOCK.SHARE }),
        })
      : [];

    return {
      candidates,
      plansById: new Map(plans.map((plan) => [String(plan.id), plan])),
    };
  }

  evaluateRevenueCandidate(txn, plansById, since, until) {
    const metadata = txn?.metadata && typeof txn.metadata === 'object' ? txn.metadata : {};
    const existingSync = metadata.treasury_sync || null;
    if (existingSync?.syncedAt) {
      return { eligible: false, reason: 'already_synced' };
    }

    const recognizedAt = this.getRevenueRecognitionAt(txn);
    if (!this.isWithinWindow(recognizedAt, since, until)) {
      return { eligible: false, reason: 'outside_window' };
    }

    if (txn.type === 'credit' && txn.source === 'funding') {
      const feeRaw = metadata.fee_amount;
      const grossAmount = Number(metadata.gross_amount);
      const netAmount = Number(txn.amount);
      let feeAmount = Number(feeRaw);

      if (!Number.isFinite(feeAmount) && Number.isFinite(grossAmount) && Number.isFinite(netAmount)) {
        feeAmount = grossAmount - netAmount;
      }

      if (!Number.isFinite(feeAmount)) {
        return {
          eligible: false,
          invalid: true,
          reason: 'invalid_fee_amount',
          recognizedAt,
          details: { fee_amount: feeRaw ?? null, reference: txn.reference },
        };
      }

      if (feeAmount < 0) {
        return {
          eligible: false,
          invalid: true,
          reason: 'negative_fee_amount',
          recognizedAt,
          details: { feeAmount, reference: txn.reference },
        };
      }

      if (feeAmount === 0) return { eligible: false, reason: 'zero_fee_revenue', recognizedAt };

      return {
        eligible: true,
        amount: feeAmount,
        bucket: 'funding_fee',
        recognizedAt,
      };
    }

    if (txn.type === 'debit' && txn.source === 'data_purchase') {
      if (!txn.dataPlanId) {
        return {
          eligible: false,
          invalid: true,
          reason: 'missing_data_plan_id',
          recognizedAt,
          details: { reference: txn.reference },
        };
      }

      const plan = plansById.get(String(txn.dataPlanId));
      if (!plan) {
        return {
          eligible: false,
          invalid: true,
          reason: 'data_plan_not_found',
          recognizedAt,
          details: { reference: txn.reference, dataPlanId: txn.dataPlanId },
        };
      }

      const amountRaw = txn.amount;
      const apiCostRaw = plan.api_cost;
      const amount = Number(amountRaw);
      const apiCost = Number(apiCostRaw);
      if (amountRaw === null || amountRaw === undefined || amountRaw === '' || !Number.isFinite(amount) || amount <= 0) {
        return {
          eligible: false,
          invalid: true,
          reason: 'invalid_transaction_amount',
          recognizedAt,
          details: { reference: txn.reference, amount: amountRaw },
        };
      }
      if (apiCostRaw === null || apiCostRaw === undefined || apiCostRaw === '' || !Number.isFinite(apiCost) || apiCost < 0) {
        return {
          eligible: false,
          invalid: true,
          reason: 'invalid_api_cost',
          recognizedAt,
          details: { reference: txn.reference, apiCost: apiCostRaw, dataPlanId: txn.dataPlanId },
        };
      }

      const profit = amount - apiCost;
      if (profit <= 0) return { eligible: false, reason: 'non_positive_profit', recognizedAt };

      return {
        eligible: true,
        amount: profit,
        bucket: 'data_profit',
        recognizedAt,
      };
    }

    return { eligible: false, reason: 'unsupported_source' };
  }

  async checkBalanceIntegrity(context = {}) {
    try {
      const [bal, last] = await Promise.all([
        TreasuryBalance.findOne(),
        TreasuryLedgerEntry.findOne({ order: [['createdAt', 'DESC']] }),
      ]);
      if (!bal || !last) return;
      const rowBalance = toNumber(bal.balance);
      const lastAfter = toNumber(last.balance_after);
      if (!Number.isFinite(rowBalance) || !Number.isFinite(lastAfter)) return;
      if (Math.abs(rowBalance - lastAfter) > 0.009) {
        logger.error('[AUDIT][Treasury] Balance drift detected', {
          ...context,
          rowBalance,
          lastAfter,
          lastRef: last.reference,
          lastSource: last.source,
        });
        await this.sendTreasuryAlert({
          key: 'treasury-balance-drift',
          title: 'Treasury balance drift detected',
          message: `Treasury balance mismatch detected. Stored balance ₦${rowBalance.toLocaleString()} but latest ledger shows ₦${lastAfter.toLocaleString()}.`,
          metadata: {
            ...context,
            rowBalance,
            lastAfter,
            lastRef: last.reference,
            lastSource: last.source,
          },
          type: 'error',
          priority: 'critical',
        });
      }
    } catch (e) {
      logger.error('[Treasury] Balance integrity check failed', { error: e.message });
    }
  }

  async getBalanceRow(transaction) {
    const t = transaction || null;
    const lock = t ? { transaction: t, lock: t.LOCK.UPDATE } : {};
    let row = await TreasuryBalance.findOne(lock);
    if (!row) {
      row = await TreasuryBalance.create({ balance: 0, currency: 'NGN' }, { transaction: t });
    }
    return row;
  }

  async getBalance() {
    const row = await TreasuryBalance.findOne();
    return row ? toNumber(row.balance) : 0;
  }

  async getRevenueSummary({ transaction = null } = {}) {
    const entries = await TreasuryLedgerEntry.findAll({
      where: {
        source: 'revenue_sync',
        type: 'credit',
        status: 'completed',
      },
      attributes: ['amount', 'metadata'],
      transaction,
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
    });

    const summary = entries.reduce(
      (acc, entry) => {
        const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
        acc.totalRecognizedRevenue += toNumber(entry.amount);
        acc.feeRevenue += toNumber(metadata.feeRevenue);
        acc.dataProfit += toNumber(metadata.dataProfit);
        acc.syncEntries += 1;
        return acc;
      },
      { totalRecognizedRevenue: 0, feeRevenue: 0, dataProfit: 0, syncEntries: 0 }
    );

    return summary;
  }

  async getWithdrawalSummary({ transaction = null } = {}) {
    const entries = await TreasuryLedgerEntry.findAll({
      where: {
        source: {
          [Op.in]: ['settlement_withdrawal', 'settlement_withdrawal_reversal'],
        },
      },
      attributes: ['source', 'status', 'amount', 'metadata'],
      transaction,
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
    });

    return entries.reduce(
      (acc, entry) => {
        const amount = toNumber(entry.amount);
        if (entry.source === 'settlement_withdrawal') {
          if (entry.status === 'completed') {
            acc.totalCompletedWithdrawals += amount;
            acc.completedCount += 1;
          } else if (entry.status === 'pending') {
            acc.totalPendingWithdrawals += amount;
            acc.pendingCount += 1;
          } else if (entry.status === 'failed') {
            acc.totalFailedWithdrawals += amount;
            acc.failedCount += 1;
          }
        } else if (entry.source === 'settlement_withdrawal_reversal' && entry.status === 'completed') {
          acc.totalReversals += amount;
          acc.reversalCount += 1;
        }
        return acc;
      },
      {
        totalCompletedWithdrawals: 0,
        totalPendingWithdrawals: 0,
        totalFailedWithdrawals: 0,
        totalReversals: 0,
        completedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        reversalCount: 0,
      }
    );
  }

  async getTreasurySnapshot({ transaction = null } = {}) {
    const [balance, revenue, withdrawals, lastSyncAt] = await Promise.all([
      this.getBalance(),
      this.getRevenueSummary({ transaction }),
      this.getWithdrawalSummary({ transaction }),
      SystemSetting.get('treasury_last_sync_at', null),
    ]);

    const expectedAvailableBalance =
      toNumber(revenue.totalRecognizedRevenue) -
      toNumber(withdrawals.totalCompletedWithdrawals) -
      toNumber(withdrawals.totalPendingWithdrawals) +
      toNumber(withdrawals.totalReversals);

    const actualAvailableBalance = toNumber(balance);
    const difference = Number((actualAvailableBalance - expectedAvailableBalance).toFixed(2));
    const isConsistent = Math.abs(difference) <= 0.009;

    return {
      balance: actualAvailableBalance,
      currency: 'NGN',
      lastSyncAt: lastSyncAt || null,
      revenue,
      withdrawals,
      reconciliation: {
        expectedAvailableBalance,
        actualAvailableBalance,
        difference,
        isConsistent,
      },
    };
  }

  async syncRevenue({ adminUserId = null } = {}) {
    const dialect = sequelize.getDialect ? sequelize.getDialect() : null;
    const syncNow = new Date();

    let feeRevenue = 0;
    let dataProfit = 0;
    let since = new Date(0);
    let invalidRevenueTransactions = [];

    const txOptions = {};
    if (dialect === 'postgres') txOptions.isolationLevel = SequelizeTransaction.ISOLATION_LEVELS.READ_COMMITTED;
    if (dialect === 'sqlite') txOptions.type = SequelizeTransaction.TYPES.IMMEDIATE;

    const run = async () =>
      sequelize.transaction(txOptions, async (t) => {
        await this.acquireSyncLock(t);
        const lastSyncRow = await this.getSettingRowForUpdate('treasury_last_sync_at', t);
        since = parseDateOrEpoch(lastSyncRow?.value);
        const until = syncNow;

        const { candidates, plansById } = await this.collectRevenueCandidates({ since, until, transaction: t });
        const recognized = [];
        invalidRevenueTransactions = [];

        for (const txn of candidates) {
          const evaluation = this.evaluateRevenueCandidate(txn, plansById, since, until);
          if (evaluation.invalid) {
            invalidRevenueTransactions.push({
              id: txn.id,
              reference: txn.reference,
              source: txn.source,
              reason: evaluation.reason,
              details: evaluation.details || {},
            });
            logger.warn('[Treasury] Revenue transaction validation failed', {
              transactionId: txn.id,
              reference: txn.reference,
              source: txn.source,
              reason: evaluation.reason,
              details: evaluation.details || {},
            });
            continue;
          }
          if (!evaluation.eligible) continue;

          recognized.push({
            txn,
            amount: evaluation.amount,
            bucket: evaluation.bucket,
            recognizedAt: evaluation.recognizedAt,
          });
        }

        feeRevenue = recognized
          .filter((entry) => entry.bucket === 'funding_fee')
          .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
        dataProfit = recognized
          .filter((entry) => entry.bucket === 'data_profit')
          .reduce((sum, entry) => sum + toNumber(entry.amount), 0);

        const totalCredit = feeRevenue + dataProfit;
        let syncReference = null;
        if (totalCredit > 0) {
          const balanceRow = await this.getBalanceRow(t);
          const before = toNumber(balanceRow.balance);
          const after = before + totalCredit;
          syncReference = genRef('TRSY-SYNC');

          await TreasuryLedgerEntry.create(
            {
              type: 'credit',
              status: 'completed',
              amount: totalCredit,
              balance_before: before,
              balance_after: after,
              source: 'revenue_sync',
              reference: syncReference,
              metadata: {
                adminUserId,
                since: since.toISOString(),
                until: until.toISOString(),
                feeRevenue,
                dataProfit,
                transactions: recognized.map((entry) => ({
                  id: entry.txn.id,
                  reference: entry.txn.reference,
                  source: entry.txn.source,
                  bucket: entry.bucket,
                  amount: entry.amount,
                  recognizedAt: entry.recognizedAt.toISOString(),
                })),
              },
            },
            { transaction: t },
          );

          for (const entry of recognized) {
            const currentMetadata = entry.txn.metadata && typeof entry.txn.metadata === 'object' ? entry.txn.metadata : {};
            entry.txn.metadata = {
              ...currentMetadata,
              treasury_sync: {
                syncedAt: syncNow.toISOString(),
                syncReference,
                bucket: entry.bucket,
                amount: entry.amount,
                recognizedAt: entry.recognizedAt.toISOString(),
              },
            };
            await entry.txn.save({ transaction: t });
          }

          balanceRow.balance = after;
          await balanceRow.save({ transaction: t });
          logger.info('[AUDIT][Treasury] Revenue sync ledger applied', {
            adminUserId,
            syncReference,
            before,
            after,
            feeRevenue,
            dataProfit,
            transactionCount: recognized.length,
          });
        }

        lastSyncRow.value = syncNow.toISOString();
        lastSyncRow.type = 'string';
        lastSyncRow.group = lastSyncRow.group || 'treasury';
        await lastSyncRow.save({ transaction: t });
      });

    if (dialect === 'sqlite') {
      try {
        await this.withSqliteSyncMutex(run);
      } catch (error) {
        await this.sendTreasuryAlert({
          key: 'treasury-sync-failed',
          title: 'Treasury sync failed',
          message: `Treasury sync failed with error: ${error.message}`,
          metadata: { adminUserId, error: error.message },
          type: 'error',
          priority: 'critical',
        });
        throw error;
      }
    } else {
      try {
        await run();
      } catch (error) {
        await this.sendTreasuryAlert({
          key: 'treasury-sync-failed',
          title: 'Treasury sync failed',
          message: `Treasury sync failed with error: ${error.message}`,
          metadata: { adminUserId, error: error.message },
          type: 'error',
          priority: 'critical',
        });
        throw error;
      }
    }

    const credited = feeRevenue + dataProfit;
    logger.info('[Treasury] Revenue sync applied', {
      adminUserId,
      since: since.toISOString(),
      until: syncNow.toISOString(),
      feeRevenue,
      dataProfit,
      totalCredit: credited,
      invalidRevenueTransactions: invalidRevenueTransactions.length,
    });
    if (invalidRevenueTransactions.length) {
      await this.sendTreasuryAlert({
        key: 'treasury-revenue-validation',
        title: 'Treasury revenue validation warning',
        message: `${invalidRevenueTransactions.length} revenue transaction(s) were skipped during treasury sync because their revenue metadata was invalid.`,
        metadata: {
          adminUserId,
          count: invalidRevenueTransactions.length,
          references: invalidRevenueTransactions.slice(0, 10).map((entry) => entry.reference),
          items: invalidRevenueTransactions.slice(0, 10),
        },
      });
    }
    await this.checkBalanceIntegrity({ action: 'sync', adminUserId });
    await this.emitTreasuryBalanceUpdate(credited > 0 ? 'sync' : 'sync_noop');
    return { ok: true, credited, feeRevenue, dataProfit, invalidRevenueTransactions: invalidRevenueTransactions.length };
  }

  async withdrawToSettlement({ adminUserId, amount, description = null, idempotencyKey = null }) {
    const withdrawAmount = toNumber(amount);
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    const lockedAccountNumber = '8035446865';
    const lockedAccountName = 'MUHAMMAD MUHAMMAD Tier 3';
    const lockedBankName = 'MONIEPOINT';
    const bankCode = String(process.env.SETTLEMENT_BANK_CODE || process.env.MONIEPOINT_BANK_CODE || '50515').trim();
    const bankName = lockedBankName;
    const accountNumber = lockedAccountNumber;
    const accountName = lockedAccountName;

    if (!bankCode || String(accountNumber).trim().length !== 10) {
      return { ok: false, reason: 'settlement_not_configured' };
    }

    const fee = toNumber(process.env.SETTLEMENT_TRANSFER_FEE_NGN || '50');
    const totalDeduction = withdrawAmount + (fee > 0 ? fee : 0);

    const customerReference = genRef('SETTLE');
    const billstackTransferService = require('./billstackTransferService');

    let debitRef = null;
    let balanceAfterDebit = null;

    try {
      await this.syncRevenue({ adminUserId });
      if (idempotencyKey) {
        const fixedRef = `TRSY-WD-${sha256Hex(idempotencyKey).slice(0, 24).toUpperCase()}`;
        const existing = await TreasuryLedgerEntry.findOne({ where: { reference: fixedRef, source: 'settlement_withdrawal' } });
        if (existing) {
          if (existing.status === 'completed') {
            return { ok: true, reference: existing.reference, providerReference: existing.metadata?.providerReference || null, debited: toNumber(existing.amount) };
          }
          if (existing.status === 'pending') {
            return { ok: false, reason: 'already_processing', reference: existing.reference };
          }
          return { ok: false, reason: 'previous_failed', reference: existing.reference, error: existing.metadata?.error || null };
        }
        debitRef = fixedRef;
      }

      await sequelize.transaction(async (t) => {
        const bal = await this.getBalanceRow(t);
        const before = toNumber(bal.balance);
        if (before < totalDeduction) {
          throw new Error('insufficient_treasury_balance');
        }
        balanceAfterDebit = before - totalDeduction;
        debitRef = debitRef || genRef('TRSY-WD');

        await TreasuryLedgerEntry.create(
          {
            type: 'debit',
            status: 'pending',
            amount: totalDeduction,
            balance_before: before,
            balance_after: balanceAfterDebit,
            source: 'settlement_withdrawal',
            reference: debitRef,
            metadata: {
              adminUserId,
              description,
              bankCode,
              bankName,
              accountNumber,
              accountName,
              withdrawAmount,
              fee,
              customerReference,
              idempotencyKey: idempotencyKey || null,
            },
          },
          { transaction: t }
        );

        bal.balance = balanceAfterDebit;
        await bal.save({ transaction: t });
      });
      await this.emitTreasuryBalanceUpdate('withdraw_debited');

      const sendResult = await billstackTransferService.initiateTransfer({
        bankCode,
        accountNumber,
        amount: withdrawAmount,
        narration: description || 'Peace Bundlle settlement payout',
        reference: customerReference,
      });

      if (!sendResult.success) {
        const code = sendResult.code || null;
        if (code === 'not_configured') throw new Error('billstack_not_configured');
        throw new Error(sendResult.error || 'provider_transfer_failed');
      }

      const providerReference = sendResult.reference || null;

      const debitEntry = await TreasuryLedgerEntry.findOne({ where: { reference: debitRef } });
      if (debitEntry) {
        debitEntry.status = 'completed';
        debitEntry.metadata = { ...(debitEntry.metadata || {}), providerReference };
        await debitEntry.save();
      }
      await this.emitTreasuryBalanceUpdate('withdraw_completed');
      await this.checkBalanceIntegrity({ action: 'withdraw_completed', adminUserId, debitRef });

      logger.info('[AUDIT][Treasury] Settlement withdrawal completed', {
        adminUserId,
        amount: withdrawAmount,
        fee,
        totalDeduction,
        debitRef,
        providerReference,
      });

      return { ok: true, reference: debitRef, providerReference, debited: totalDeduction };
    } catch (e) {
      const errorMsg = e?.message || String(e);
      if (errorMsg === 'insufficient_treasury_balance') {
        return { ok: false, reason: 'insufficient_balance' };
      }
      const mappedReason = errorMsg === 'billstack_not_configured' ? 'billstack_not_configured' : 'provider_failed';

      try {
        if (debitRef) {
          await sequelize.transaction(async (t) => {
            const bal = await this.getBalanceRow(t);
            const before = toNumber(bal.balance);
            const reverseAmount = totalDeduction;
            const after = before + reverseAmount;

            await TreasuryLedgerEntry.create(
              {
                type: 'credit',
                status: 'completed',
                amount: reverseAmount,
                balance_before: before,
                balance_after: after,
                source: 'settlement_withdrawal_reversal',
                reference: genRef('TRSY-REV'),
                metadata: { adminUserId, failed_reference: debitRef, error: errorMsg },
              },
              { transaction: t }
            );

            await TreasuryLedgerEntry.update(
              { status: 'failed' },
              { where: { reference: debitRef }, transaction: t }
            );
            const debitEntry = await TreasuryLedgerEntry.findOne({ where: { reference: debitRef }, transaction: t, lock: t.LOCK.UPDATE });
            if (debitEntry) {
              debitEntry.metadata = { ...(debitEntry.metadata || {}), error: errorMsg };
              await debitEntry.save({ transaction: t });
            }

            bal.balance = after;
            await bal.save({ transaction: t });
          });
        }
      } catch (rollbackErr) {
        logger.error('[Treasury] Failed to rollback settlement withdrawal', { debitRef, error: rollbackErr.message });
      }
      await this.emitTreasuryBalanceUpdate('withdraw_failed_rollback');
      await this.checkBalanceIntegrity({ action: 'withdraw_failed_rollback', adminUserId, debitRef });

      logger.error('[AUDIT][Treasury] Settlement withdrawal failed', { adminUserId, debitRef, error: errorMsg });
      return { ok: false, reason: mappedReason, error: errorMsg };
    }
  }
}

module.exports = new TreasuryService();
