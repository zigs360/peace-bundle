const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { Op } = require('sequelize');
const crypto = require('crypto');
const logger = require('../utils/logger');

const LEGACY_TRANSACTION_SOURCE_MAP = {
  admin_wallet_deduction: 'withdrawal',
  admin_wallet_deduction_reversal: 'refund',
  wallet_funding: 'funding',
};

const referenceState = globalThis.__peacebundle_reference_state || {
  lastMs: 0,
  counter: 0,
  recent: new Map(),
};
globalThis.__peacebundle_reference_state = referenceState;

class WalletService {
  toFiniteNumber(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async createTransactionRecord(attributes, options = {}) {
    const payload = {
      id: crypto.randomUUID(),
      ...attributes,
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await Transaction.create(payload, {
          ...options,
          fields: Object.keys(payload),
        });
      } catch (error) {
        const isUniqueConstraint =
          error?.name === 'SequelizeUniqueConstraintError' ||
          error?.original?.code === '23505';
        if (!isUniqueConstraint || attempt >= maxAttempts || !payload.reference) {
          throw error;
        }

        const prefix = String(payload.reference).split('-')[0] || 'WLT';
        payload.reference = this.generateReference(prefix);
        logger.warn('[WalletService] Reference collision; regenerated transaction reference', {
          attempt,
          prefix,
        });
      }
    }

    throw new Error('Failed to create transaction record');
  }

  async inferOpeningBalance(user, transaction = null) {
    const latestTransaction = await Transaction.findOne({
      where: {
        userId: user.id,
        balance_after: {
          [Op.ne]: null,
        },
      },
      order: [
        ['completed_at', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      transaction,
    });

    const inferredBalance = this.toFiniteNumber(latestTransaction?.balance_after);
    return inferredBalance ?? 0;
  }

  async ensureWallet(user, transaction = null, { lock = false } = {}) {
    const findOptions = {
      where: { userId: user.id },
      transaction,
    };

    if (lock && transaction) {
      findOptions.lock = true;
    }

    let wallet = await Wallet.findOne(findOptions);
    if (wallet) return wallet;

    const openingBalance = await this.inferOpeningBalance(user, transaction);

    try {
      wallet = await Wallet.create(
        {
          userId: user.id,
          balance: openingBalance,
        },
        { transaction }
      );
      logger.warn('[WalletService] Recreated missing wallet for user', {
        userId: user.id,
        openingBalance,
      });
      return wallet;
    } catch (error) {
      const isUniqueConstraint =
        error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === '23505';
      if (!isUniqueConstraint) {
        throw error;
      }

      wallet = await Wallet.findOne(findOptions);
      if (wallet) return wallet;
      throw error;
    }
  }

  normalizeTransactionSource(source) {
    const raw = String(source || '').trim();
    const normalized = LEGACY_TRANSACTION_SOURCE_MAP[raw] || raw;
    if (raw && normalized !== raw) {
      logger.warn('[WalletService] Normalized legacy transaction source', { from: raw, to: normalized });
    }
    return normalized;
  }

  /**
   * Credit user wallet
   * @param {Object} user
   * @param {number} amount
   * @param {string} source
   * @param {string} [description]
   * @param {Object} [metadata]
   * @param {Object} [t] - Optional transaction
   * @returns {Promise<Transaction>}
   */
  async credit(user, amount, source, description = null, metadata = {}, t = null) {
    const work = async (transaction) => {
      // Fetch wallet directly using userId to ensure we have the latest instance
      const wallet = await this.ensureWallet(user, transaction, { lock: true });

      const balanceBefore = parseFloat(wallet.balance);
      const amountNum = parseFloat(amount);
      if (!Number.isFinite(amountNum)) throw new Error('Invalid amount');

      await wallet.increment('balance', { by: amountNum, transaction: transaction });
      await wallet.reload({ transaction: transaction });
      const newBalance = parseFloat(wallet.balance);
      const txnSource = this.normalizeTransactionSource(source);
      
      // Create transaction record
      const txn = await this.createTransactionRecord({
        walletId: wallet.id,
        userId: user.id, // Explicitly set userId
        type: 'credit',
        amount: amountNum,
        balance_before: balanceBefore,
        balance_after: newBalance,
        source: txnSource,
        reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });

      return txn;
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  async creditFundingWithFraudChecks(user, amount, description = null, metadata = {}, t = null) {
    const cap = parseFloat(process.env.MOCK_BVN_FUNDING_CAP_NGN || '50000');
    const maxEvents = parseInt(process.env.MOCK_BVN_MAX_EVENTS_24H || '3', 10);
    const mockAllowed = String(process.env.MOCK_BVN_ALLOWED || 'false').toLowerCase() === 'true';
    const isMockUser = mockAllowed && user?.metadata?.mock_bvn_status === 'mock';

    const work = async (transaction) => {
      const wallet = await this.ensureWallet(user, transaction, { lock: true });

      const balanceBefore = parseFloat(wallet.balance);
      const amountNum = parseFloat(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }

      const metadataFeeAmount =
        this.toFiniteNumber(metadata?.fee_amount) ??
        this.toFiniteNumber(metadata?.feeAmount) ??
        this.toFiniteNumber(metadata?.fee);
      const metadataGrossAmount =
        this.toFiniteNumber(metadata?.gross_amount) ??
        this.toFiniteNumber(metadata?.grossAmount);
      const metadataNetAmount =
        this.toFiniteNumber(metadata?.net_amount) ??
        this.toFiniteNumber(metadata?.netAmount);

      const netAmount = amountNum;
      const feeAmount =
        metadataFeeAmount !== null
          ? metadataFeeAmount
          : metadataGrossAmount !== null && metadataGrossAmount >= netAmount
            ? metadataGrossAmount - netAmount
            : metadataNetAmount !== null && metadataNetAmount >= 0 && amountNum >= metadataNetAmount
              ? amountNum - metadataNetAmount
              : 0;
      const normalizedFeeAmount = Number.isFinite(feeAmount) && feeAmount > 0 ? feeAmount : 0;
      const grossAmount =
        metadataGrossAmount !== null && metadataGrossAmount >= netAmount
          ? metadataGrossAmount
          : netAmount + normalizedFeeAmount;
      const nextMeta = {
        ...metadata,
        gross_amount: grossAmount,
        fee_amount: normalizedFeeAmount,
        net_amount: netAmount,
        fee_currency: 'NGN',
        fee_policy: normalizedFeeAmount > 0 ? 'provider_fee' : 'none',
      };

      if (isMockUser && Number.isFinite(amountNum) && amountNum > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [count24h, sumAll] = await Promise.all([
          Transaction.count({
            where: { userId: user.id, type: 'credit', source: 'funding', createdAt: { [Op.gte]: since } },
            transaction: transaction
          }),
          Transaction.sum('amount', { where: { userId: user.id, type: 'credit', source: 'funding', status: 'completed' }, transaction: transaction })
        ]);

        const fundedTotal = parseFloat(sumAll || 0);
        const exceedsVelocity = Number.isFinite(count24h) && count24h >= maxEvents;
        const exceedsCap = Number.isFinite(cap) && fundedTotal + amountNum > cap;

        if (exceedsVelocity || exceedsCap) {
          const txn = await this.createTransactionRecord(
            {
              walletId: wallet.id,
              userId: user.id,
              type: 'credit',
              amount: netAmount,
              balance_before: balanceBefore,
              balance_after: balanceBefore,
              source: 'funding',
              reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
              description: description,
              metadata: {
                ...nextMeta,
                review_status: 'pending_review',
                review_reason: exceedsCap ? 'mock_bvn_cap' : 'mock_bvn_velocity',
                mock_bvn: true
              },
              status: 'pending',
              completed_at: null
            },
            { transaction: transaction, returning: false }
          );

          return { status: 'pending_review', transaction: txn };
        }
      }

      const txn = await this.credit(user, netAmount, 'funding', description, nextMeta, transaction);
      return { status: 'completed', transaction: txn };
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Debit user wallet
   * @param {Object} user
   * @param {number} amount
   * @param {string} source
   * @param {string} [description]
   * @param {Object} [metadata]
   * @param {Object} [t] - Optional transaction
   * @returns {Promise<Transaction>}
   */
  async debit(user, amount, source, description = null, metadata = {}, t = null) {
    const work = async (transaction) => {
      const wallet = await this.ensureWallet(user, transaction, { lock: true });

      // Fraud & Compliance Checks
      if (wallet.status !== 'active') {
        throw new Error(`Wallet is ${wallet.status}. Please contact support.`);
      }

      const currentBalance = parseFloat(wallet.balance);
      const debitAmount = parseFloat(amount);

      // Daily Limit Check
      const today = new Date();
      today.setHours(0,0,0,0);
      
      let dailySpent = parseFloat(wallet.daily_spent);
      if (wallet.last_transaction_at && wallet.last_transaction_at < today) {
        dailySpent = 0; // Reset for new day
      }

      if (dailySpent + debitAmount > parseFloat(wallet.daily_limit)) {
        throw new Error('Daily transaction limit exceeded');
      }

      // Check sufficient balance
      if (currentBalance < debitAmount) {
        throw new Error('Insufficient wallet balance');
      }

      const balanceBefore = currentBalance;
      const balanceAfter = currentBalance - debitAmount;
      const txnSource = this.normalizeTransactionSource(source);
      
      await wallet.update({ 
        balance: balanceAfter,
        daily_spent: dailySpent + debitAmount,
        last_transaction_at: new Date()
      }, { transaction: transaction });
      
      // Create transaction record
      const txn = await this.createTransactionRecord({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: debitAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: txnSource,
        reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });

      return txn;
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  async adminAdjust(user, deltaAmount, source, description = null, metadata = {}, t = null) {
    const work = async (transaction) => {
      const wallet = await this.ensureWallet(user, transaction, { lock: true });
      if (wallet.status !== 'active') {
        throw new Error(`Wallet is ${wallet.status}. Please contact support.`);
      }

      const currentBalance = parseFloat(wallet.balance);
      const delta = parseFloat(deltaAmount);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('Invalid amount');

      const nextBalance = currentBalance + delta;
      if (nextBalance < 0) throw new Error('Insufficient wallet balance');

      const balanceBefore = currentBalance;
      const balanceAfter = nextBalance;
      const txnSource = this.normalizeTransactionSource(source);
      await wallet.update(
        {
          balance: balanceAfter,
          last_transaction_at: new Date(),
        },
        { transaction }
      );

      const txnType = delta < 0 ? 'debit' : 'credit';
      const txnAmount = Math.abs(delta);
      const txn = await this.createTransactionRecord(
        {
          walletId: wallet.id,
          userId: user.id,
          type: txnType,
          amount: txnAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          source: txnSource,
          reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
          description,
          metadata,
          status: 'completed',
          completed_at: new Date(),
        },
        { transaction, returning: false }
      );

      return { wallet, txn };
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Transfer between wallets
   * @param {Object} sender
   * @param {Object} recipient
   * @param {number} amount
   * @param {string} [description]
   * @param {Object} [t] - Optional transaction
   * @returns {Promise<Object>}
   */
  async transfer(sender, recipient, amount, description = null, t = null) {
    const work = async (transaction) => {
      // 1. Debit Sender
      const senderWallet = await this.ensureWallet(sender, transaction, { lock: true });
      if (parseFloat(senderWallet.balance) < parseFloat(amount)) throw new Error('Insufficient wallet balance');

      const senderBalanceBefore = parseFloat(senderWallet.balance);
      const senderBalanceAfter = senderBalanceBefore - parseFloat(amount);
      
      await senderWallet.update({ balance: senderBalanceAfter }, { transaction: transaction });

      const debitTxn = await this.createTransactionRecord({
        walletId: senderWallet.id,
        userId: sender.id,
        type: 'debit',
        amount: amount,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        source: 'transfer',
        reference: this.generateReference(),
        description: `Transfer to ${recipient.name || recipient.email}`,
        metadata: { recipient_id: recipient.id },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });

      // 2. Credit Recipient
      const recipientWallet = await this.ensureWallet(recipient, transaction, { lock: true });

      const recipientBalanceBefore = parseFloat(recipientWallet.balance);
      const recipientBalanceAfter = recipientBalanceBefore + parseFloat(amount);

      await recipientWallet.update({ balance: recipientBalanceAfter }, { transaction: transaction });

      const creditTxn = await this.createTransactionRecord({
        walletId: recipientWallet.id,
        userId: recipient.id,
        type: 'credit',
        amount: amount,
        balance_before: recipientBalanceBefore,
        balance_after: recipientBalanceAfter,
        source: 'transfer',
        reference: this.generateReference(),
        description: `Transfer from ${sender.name || sender.email}`,
        metadata: { sender_id: sender.id },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });

      return {
        debit_transaction: debitTxn,
        credit_transaction: creditTxn,
      };
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Check if user has sufficient balance
   * @param {Object} user
   * @param {number} amount
   * @returns {Promise<boolean>}
   */
  async hasSufficientBalance(user, amount) {
    const wallet = await this.ensureWallet(user);
    return wallet && parseFloat(wallet.balance) >= parseFloat(amount);
  }

  /**
   * Get wallet balance
   * @param {Object} user
   * @returns {Promise<number>}
   */
  async getBalance(user) {
    const wallet = await this.ensureWallet(user);
    return wallet ? parseFloat(wallet.balance) : 0.00;
  }

  /**
   * Generate unique transaction reference
   * @returns {string}
   */
  generateReference(prefix = 'WLT') {
    const normalizedPrefix = String(prefix || 'WLT')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'WLT';

    const now = Date.now();
    if (referenceState.lastMs === now) {
      referenceState.counter += 1;
    } else {
      referenceState.lastMs = now;
      referenceState.counter = 0;
    }

    const ts = now.toString(36).toUpperCase();
    const ctr = referenceState.counter.toString(36).toUpperCase();
    const rand = crypto.randomBytes(10).toString('hex').toUpperCase();
    let candidate = `${normalizedPrefix}-${ts}-${ctr}-${rand}`;

    const cutoff = now - 60_000;
    for (const [key, createdAt] of referenceState.recent.entries()) {
      if (createdAt < cutoff) referenceState.recent.delete(key);
    }

    while (referenceState.recent.has(candidate)) {
      candidate = `${normalizedPrefix}-${ts}-${ctr}-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
    }

    referenceState.recent.set(candidate, now);
    return candidate;
  }

  /**
   * Credit commission balance
   * @param {Object} user
   * @param {number} amount
   * @param {string} [description]
   * @param {Object} [t] - Optional transaction
   * @returns {Promise<Transaction>}
   */
  async creditCommission(user, amount, description = null, t = null) {
    const work = async (transaction) => {
      const wallet = await this.ensureWallet(user, transaction, { lock: true });

      const balanceBefore = parseFloat(wallet.commission_balance);
      const newBalance = balanceBefore + parseFloat(amount);
      
      await wallet.update({ commission_balance: newBalance }, { transaction: transaction });
      
      return this.createTransactionRecord({
        walletId: wallet.id,
        userId: user.id,
        type: 'credit',
        amount: amount,
        balance_before: balanceBefore,
        balance_after: newBalance,
        source: 'commission',
        reference: this.generateReference(),
        description: description || 'Affiliate commission earned',
        metadata: { kind: 'commission_earned' },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Transfer commission to main balance
   * @param {Object} user
   * @param {Object} [t] - Optional transaction
   * @returns {Promise<Transaction>}
   */
  async transferCommissionToBalance(user, t = null) {
    const work = async (transaction) => {
      const wallet = await this.ensureWallet(user, transaction, { lock: true });
      
      const commissionAmount = parseFloat(wallet.commission_balance);
      if (commissionAmount <= 0) {
        throw new Error('No commission balance to transfer');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const balanceAfter = balanceBefore + commissionAmount;

      // Update wallet: set commission to 0, add to main balance
      await wallet.update({
        commission_balance: 0,
        balance: balanceAfter
      }, { transaction: transaction });

      // Create transaction
      return this.createTransactionRecord({
        walletId: wallet.id,
        userId: user.id,
        type: 'credit',
        amount: commissionAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: 'commission',
        reference: this.generateReference(),
        description: 'Commission transfer to main wallet',
        metadata: { kind: 'commission_transfer_to_main_balance' },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: transaction, returning: false });
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }
}

module.exports = new WalletService();
