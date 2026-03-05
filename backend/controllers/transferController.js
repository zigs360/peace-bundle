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
      return res.json({ 
        success: true, 
        data: result.data.data || result.data 
      });
    } else {
      logger.error(`[Transfer] Bank list fetch error: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        message: result.error || 'Failed to retrieve banks list' 
      });
    }
  } catch (error) {
    logger.error(`[Transfer] Banks fetch exception: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'An internal error occurred while fetching banks' 
    });
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
    return res.status(400).json({ 
      success: false, 
      message: 'Both bank code and account number are required' 
    });
  }

  try {
    const result = await smeplugService.resolveAccount(bank_code, account_number);
    if (result.success) {
      return res.json({ 
        success: true, 
        data: result.data.data || result.data 
      });
    } else {
      logger.warn(`[Transfer] Account resolution failed: ${result.error} for account ${account_number}`);
      return res.status(400).json({ 
        success: false, 
        message: result.error || 'Bank account verification failed. Please check the details.' 
      });
    }
  } catch (error) {
    logger.error(`[Transfer] Resolve account exception: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during account resolution' 
    });
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
    return res.status(400).json({ 
      success: false, 
      message: 'Bank code, account number, and amount are required' 
    });
  }

  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide a valid transfer amount greater than zero' 
    });
  }

  const fee = 50.00; // Fixed 50 Naira fee
  const totalDeduction = transferAmount + fee;

  const t = await sequelize.transaction();

  try {
    const user = await User.findByPk(userId, { 
      include: [{ model: Wallet, as: 'wallet' }] 
    });

    if (!user || !user.wallet) {
      await t.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'User wallet account not found' 
      });
    }

    const currentBalance = parseFloat(user.wallet.balance);
    if (currentBalance < totalDeduction) {
      await t.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient balance. Required: ₦${totalDeduction} (including ₦${fee} fee), Available: ₦${currentBalance}` 
      });
    }

    // 1. Generate unique customer reference
    const customerReference = `TRF-${uuidv4().substring(0, 8).toUpperCase()}`;

    // 2. Debit Wallet (using walletService)
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
      logger.error(`[Transfer] SMEPlug API failure: ${smeplugResult.error}`);
      throw new Error(smeplugResult.error || 'Transfer failed at provider');
    }

    // 4. Update transaction with SMEPlug reference
    const reference = smeplugResult.data?.reference || smeplugResult.data?.transaction_id || smeplugResult.data?.data?.reference;
    newTransaction.smeplug_reference = reference;
    newTransaction.smeplug_response = JSON.stringify(smeplugResult.data);
    await newTransaction.save({ transaction: t });

    await t.commit();
    
    logger.info(`[Transfer] Successful transfer: ₦${transferAmount} from user ${userId} to ${account_number}. Ref: ${reference}`);

    res.json({
      success: true,
      message: 'Transfer initiated successfully. Your funds are on the way.',
      data: {
        transactionId: newTransaction.id,
        reference: reference,
        newBalance: user.wallet.balance
      }
    });

  } catch (error) {
    if (t && !t.finished) await t.rollback();
    logger.error(`[Transfer] Initiate transfer exception for user ${userId}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'An error occurred while processing your transfer request' 
    });
  }
};

module.exports = {
  getBanks,
  resolveAccount,
  initiateTransfer
};
