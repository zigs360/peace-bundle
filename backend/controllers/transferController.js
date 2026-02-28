const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const smeplugService = require('../services/smeplugService');
const walletService = require('../services/walletService');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * @desc    Get list of banks
 * @route   GET /api/transfer/banks
 * @access  Private
 */
const getBanks = async (req, res) => {
  try {
    const result = await smeplugService.getBanks();
    if (result.success) {
      return res.json({ success: true, data: result.data.data || result.data });
    } else {
      return res.status(500).json({ success: false, message: result.error || 'Failed to fetch banks' });
    }
  } catch (error) {
    logger.error('Get Banks Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * @desc    Resolve bank account
 * @route   POST /api/transfer/resolve
 * @access  Private
 */
const resolveAccount = async (req, res) => {
  const { bank_code, account_number } = req.body;
  if (!bank_code || !account_number) {
    return res.status(400).json({ success: false, message: 'Bank code and account number are required' });
  }

  try {
    const result = await smeplugService.resolveAccount(bank_code, account_number);
    if (result.success) {
      return res.json({ success: true, data: result.data.data || result.data });
    } else {
      return res.status(400).json({ success: false, message: result.error || 'Account resolution failed' });
    }
  } catch (error) {
    logger.error('Resolve Account Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * @desc    Initiate bank transfer
 * @route   POST /api/transfer/send
 * @access  Private
 */
const initiateTransfer = async (req, res) => {
  const { bank_code, bank_name, account_number, account_name, amount, description } = req.body;
  const userId = req.user.id;

  if (!bank_code || !account_number || !amount) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount' });
  }

  // Optional: Add a transfer fee
  const fee = 50.00; // Fixed 50 Naira fee
  const totalDeduction = transferAmount + fee;

  const t = await sequelize.transaction();

  try {
    const user = await User.findByPk(userId, { include: [Wallet] });
    if (!user || !user.wallet) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'User or wallet not found' });
    }

    if (parseFloat(user.wallet.balance) < totalDeduction) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    // 1. Generate unique customer reference
    const customerReference = `TRF-${uuidv4().substring(0, 8).toUpperCase()}`;

    // 2. Debit Wallet
    const newTransaction = await walletService.debit(
      user,
      totalDeduction,
      'bank_transfer',
      `Transfer ₦${transferAmount} to ${account_name} (${bank_name})`,
      { 
        bank_code, 
        bank_name, 
        account_number, 
        account_name, 
        amount: transferAmount, 
        fee,
        customerReference 
      },
      t
    );

    // 3. Call SMEPlug API
    const smeplugResult = await smeplugService.sendTransfer({
      bank_code,
      account_number,
      amount: transferAmount,
      description: description || `Transfer from Peace Bundlle`,
      customer_reference: customerReference
    });

    if (!smeplugResult.success) {
      logger.error('SMEPlug Transfer Failure:', smeplugResult);
      throw new Error(smeplugResult.error || 'Transfer failed at provider');
    }

    // 4. Update transaction with SMEPlug reference
    newTransaction.smeplug_reference = smeplugResult.data?.reference || smeplugResult.data?.transaction_id;
    newTransaction.smeplug_response = smeplugResult.data;
    await newTransaction.save({ transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: 'Transfer initiated successfully',
      transaction: newTransaction
    });

  } catch (error) {
    if (t) await t.rollback();
    logger.error('Initiate Transfer Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

module.exports = {
  getBanks,
  resolveAccount,
  initiateTransfer
};
