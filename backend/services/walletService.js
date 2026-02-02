const { sequelize } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const crypto = require('crypto');

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
      const newBalance = balanceBefore + parseFloat(amount);
      
      await wallet.update({ balance: newBalance }, { transaction: transaction });
      
      // Create transaction record
      const txn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id, // Explicitly set userId
        type: 'credit',
        amount: amount,
        balance_before: balanceBefore,
        balance_after: newBalance,
        source: source,
        reference: this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed'
      }, { transaction: transaction });

      return txn;
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

      const currentBalance = parseFloat(wallet.balance);
      const debitAmount = parseFloat(amount);

      // Check sufficient balance
      if (currentBalance < debitAmount) {
        throw new Error('Insufficient wallet balance');
      }

      const balanceBefore = currentBalance;
      const balanceAfter = currentBalance - debitAmount;
      
      await wallet.update({ balance: balanceAfter }, { transaction: transaction });
      
      // Create transaction record
      const txn = await Transaction.create({
        walletId: wallet.id,
        userId: user.id,
        type: 'debit',
        amount: debitAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: source,
        reference: this.generateReference(),
        description: description,
        metadata: metadata,
        status: 'completed' 
      }, { transaction: transaction });

      return txn;
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
      }, { transaction: transaction });

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
      }, { transaction: transaction });

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
      }, { transaction: transaction });
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
      }, { transaction: transaction });
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }
}

module.exports = new WalletService();
