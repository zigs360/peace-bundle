const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { Op } = require('sequelize');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WalletService {
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
      const wallet = await Wallet.findOne({ 
        where: { userId: user.id },
        transaction: transaction,
        lock: true // Pessimistic lock to prevent race conditions
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const amountNum = parseFloat(amount);
      if (!Number.isFinite(amountNum)) throw new Error('Invalid amount');

      await wallet.increment('balance', { by: amountNum, transaction: transaction });
      await wallet.reload({ transaction: transaction });
      const newBalance = parseFloat(wallet.balance);
      
      // Create transaction record
      const txn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id, // Explicitly set userId
        type: 'credit',
        amount: amountNum,
        balance_before: balanceBefore,
        balance_after: newBalance,
        source: source,
        reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed'
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
      const wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: transaction,
        lock: true
      });

      if (!wallet) throw new Error('Wallet not found');

      const balanceBefore = parseFloat(wallet.balance);
      const amountNum = parseFloat(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }

      const feeAmount = 0;
      const netAmount = amountNum;
      const nextMeta = {
        ...metadata,
        gross_amount: amountNum,
        fee_amount: feeAmount,
        net_amount: netAmount,
        fee_currency: 'NGN',
        fee_policy: 'none',
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
          const txn = await Transaction.create(
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
              status: 'pending'
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
      const wallet = await Wallet.findOne({ 
        where: { userId: user.id },
        transaction: transaction,
        lock: true 
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

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
      
      await wallet.update({ 
        balance: balanceAfter,
        daily_spent: dailySpent + debitAmount,
        last_transaction_at: new Date()
      }, { transaction: transaction });
      
      // Create transaction record
      const txn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: debitAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: source,
        reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed' 
      }, { transaction: transaction, returning: false });

      return txn;
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  async adminAdjust(user, deltaAmount, source, description = null, metadata = {}, t = null) {
    const work = async (transaction) => {
      const wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction,
        lock: true,
      });

      if (!wallet) throw new Error('Wallet not found');
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
      await wallet.update(
        {
          balance: balanceAfter,
          last_transaction_at: new Date(),
        },
        { transaction }
      );

      const txnType = delta < 0 ? 'debit' : 'credit';
      const txnAmount = Math.abs(delta);
      const txn = await Transaction.create(
        {
          walletId: wallet.id,
          userId: user.id,
          type: txnType,
          amount: txnAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          source,
          reference: metadata?.reference ? String(metadata.reference) : this.generateReference(),
          description,
          metadata,
          status: 'completed',
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
      const senderWallet = await Wallet.findOne({ 
        where: { userId: sender.id },
        transaction: transaction,
        lock: true 
      });

      if (!senderWallet) throw new Error('Sender wallet not found');
      if (parseFloat(senderWallet.balance) < parseFloat(amount)) throw new Error('Insufficient wallet balance');

      const senderBalanceBefore = parseFloat(senderWallet.balance);
      const senderBalanceAfter = senderBalanceBefore - parseFloat(amount);
      
      await senderWallet.update({ balance: senderBalanceAfter }, { transaction: transaction });

      const debitTxn = await Transaction.create({
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
        status: 'completed'
      }, { transaction: transaction, returning: false });

      // 2. Credit Recipient
      const recipientWallet = await Wallet.findOne({ 
        where: { userId: recipient.id },
        transaction: transaction,
        lock: true 
      });

      if (!recipientWallet) throw new Error('Recipient wallet not found');

      const recipientBalanceBefore = parseFloat(recipientWallet.balance);
      const recipientBalanceAfter = recipientBalanceBefore + parseFloat(amount);

      await recipientWallet.update({ balance: recipientBalanceAfter }, { transaction: transaction });

      const creditTxn = await Transaction.create({
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
        status: 'completed'
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
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    return wallet && parseFloat(wallet.balance) >= parseFloat(amount);
  }

  /**
   * Get wallet balance
   * @param {Object} user
   * @returns {Promise<number>}
   */
  async getBalance(user) {
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    return wallet ? parseFloat(wallet.balance) : 0.00;
  }

  /**
   * Generate unique transaction reference
   * @returns {string}
   */
  generateReference() {
    return 'WLT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
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
      const wallet = await Wallet.findOne({ 
        where: { userId: user.id },
        transaction: transaction,
        lock: true 
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallet.commission_balance);
      const newBalance = balanceBefore + parseFloat(amount);
      
      await wallet.update({ commission_balance: newBalance }, { transaction: transaction });
      
      return Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'credit',
        amount: amount,
        balance_before: balanceBefore,
        balance_after: newBalance,
        source: 'commission',
        reference: this.generateReference(),
        description: description || 'Affiliate commission earned',
        status: 'completed'
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
      const wallet = await Wallet.findOne({ 
        where: { userId: user.id },
        transaction: transaction,
        lock: true 
      });

      if (!wallet) throw new Error('Wallet not found');
      
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
      return Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'credit',
        amount: commissionAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: 'commission',
        reference: this.generateReference(),
        description: 'Commission transfer to main wallet',
        status: 'completed'
      }, { transaction: transaction, returning: false });
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }
}

module.exports = new WalletService();
