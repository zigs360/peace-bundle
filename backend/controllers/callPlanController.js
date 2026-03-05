const CallPlan = require('../models/CallPlan');
const VoiceBundle = require('../models/VoiceBundle');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get voice bundles (TalkMore, etc.)
 * @route   GET /api/callplans/voice-bundles
 * @access  Public
 */
const getVoiceBundles = async (req, res) => {
  try {
    const { network, status } = req.query;
    const where = {};

    if (network) where.network = network.toLowerCase();
    if (status !== undefined) where.is_active = status === 'active';

    const bundles = await VoiceBundle.findAll({
      where,
      order: [['amount', 'ASC']],
    });

    res.json({
      success: true,
      data: bundles,
    });
  } catch (error) {
    logger.error(`[CallPlan] Voice bundle fetch error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve voice bundles' 
    });
  }
};

/**
 * @desc    Create a new call plan
 * @route   POST /api/callplans
 * @access  Private (Admin)
 */
const createCallPlan = async (req, res) => {
  try {
    const { name, provider, price, minutes, validityDays, status, type } = req.body;

    if (!name || !provider || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, provider, and price are required' 
      });
    }

    const callPlan = await CallPlan.create({
      name,
      provider: provider.toLowerCase(),
      price,
      minutes,
      validityDays,
      status: status || 'active',
      type: type || 'prepaid',
    });

    logger.info(`[CallPlan] Created new plan: ${name} for ${provider}`);

    res.status(201).json({
      success: true,
      message: 'Call plan created successfully',
      data: callPlan,
    });
  } catch (error) {
    logger.error(`[CallPlan] Creation error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create call plan' 
    });
  }
};

/**
 * @desc    Get all call plans
 * @route   GET /api/callplans
 * @access  Public
 */
const getCallPlans = async (req, res) => {
  try {
    const { provider, status, type } = req.query;
    const where = {};

    if (provider) where.provider = provider.toLowerCase();
    if (status) where.status = status;
    if (type) where.type = type;

    const callPlans = await CallPlan.findAll({
      where,
      order: [['price', 'ASC']],
    });

    res.json({
      success: true,
      data: callPlans,
    });
  } catch (error) {
    logger.error(`[CallPlan] Fetch error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve call plans' 
    });
  }
};

/**
 * @desc    Get single call plan by ID
 * @route   GET /api/callplans/:id
 * @access  Public
 */
const getCallPlanById = async (req, res) => {
  try {
    const callPlan = await CallPlan.findByPk(req.params.id);

    if (!callPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Call plan not found' 
      });
    }

    res.json({
      success: true,
      data: callPlan,
    });
  } catch (error) {
    logger.error(`[CallPlan] Fetch by ID error (${req.params.id}): ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve call plan details' 
    });
  }
};

/**
 * @desc    Update a call plan
 * @route   PUT /api/callplans/:id
 * @access  Private (Admin)
 */
const updateCallPlan = async (req, res) => {
  try {
    const { name, provider, price, minutes, validityDays, status, type } = req.body;

    const callPlan = await CallPlan.findByPk(req.params.id);

    if (!callPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Call plan not found' 
      });
    }

    callPlan.name = name || callPlan.name;
    callPlan.provider = provider ? provider.toLowerCase() : callPlan.provider;
    callPlan.price = price || callPlan.price;
    callPlan.minutes = minutes || callPlan.minutes;
    callPlan.validityDays = validityDays || callPlan.validityDays;
    callPlan.status = status || callPlan.status;
    callPlan.type = type || callPlan.type;

    await callPlan.save();
    logger.info(`[CallPlan] Updated plan ID: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Call plan updated successfully',
      data: callPlan,
    });
  } catch (error) {
    logger.error(`[CallPlan] Update error for ID ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update call plan' 
    });
  }
};

/**
 * @desc    Delete a call plan
 * @route   DELETE /api/callplans/:id
 * @access  Private (Admin)
 */
const deleteCallPlan = async (req, res) => {
  try {
    const callPlan = await CallPlan.findByPk(req.params.id);

    if (!callPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Call plan not found' 
      });
    }

    await callPlan.destroy();
    logger.info(`[CallPlan] Deleted plan ID: ${req.params.id}`);

    res.json({ 
      success: true, 
      message: 'Call plan deleted successfully' 
    });
  } catch (error) {
    logger.error(`[CallPlan] Delete error for ID ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete call plan' 
    });
  }
};

/**
 * @desc    Purchase a call plan
 * @route   POST /api/callplans/:id/purchase
 * @access  Private
 */
const purchaseCallPlan = async (req, res) => {
  try {
    const { recipientPhoneNumber } = req.body;
    const userId = req.user.id;
    const callPlanId = req.params.id;

    if (!recipientPhoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Recipient phone number is required' 
      });
    }

    const callPlan = await CallPlan.findByPk(callPlanId);
    if (!callPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Selected call plan no longer exists' 
      });
    }

    const user = await User.findByPk(userId, { 
      include: [{ model: Wallet, as: 'wallet' }] 
    });

    if (!user || !user.wallet) {
      return res.status(404).json({ 
        success: false, 
        message: 'User wallet account not found' 
      });
    }

    const price = parseFloat(callPlan.price);
    const balance = parseFloat(user.wallet.balance);

    if (balance < price) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient balance. Required: ₦${price}, Available: ₦${balance}` 
      });
    }

    // Deduct from wallet
    user.wallet.balance = balance - price;
    await user.wallet.save();

    // Record transaction
    const transaction = await Transaction.create({
      userId,
      type: 'call_plan_purchase',
      amount: price,
      status: 'completed',
      description: `Purchase of ${callPlan.name} for ${recipientPhoneNumber}`,
      metadata: {
        callPlanId: callPlan.id,
        callPlanName: callPlan.name,
        recipientPhoneNumber,
        provider: callPlan.provider,
        minutes: callPlan.minutes,
        validityDays: callPlan.validityDays,
      },
    });

    logger.info(`[CallPlan] Purchase successful: User ${userId} bought ${callPlan.name} for ${recipientPhoneNumber}. Transaction: ${transaction.id}`);

    res.json({
      success: true,
      message: 'Call plan purchased successfully. Activation is being processed.',
      data: {
        transactionId: transaction.id,
        newBalance: user.wallet.balance
      }
    });
  } catch (error) {
    logger.error(`[CallPlan] Purchase error for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your purchase' 
    });
  }
};

module.exports = {
  getVoiceBundles,
  createCallPlan,
  getCallPlans,
  getCallPlanById,
  updateCallPlan,
  deleteCallPlan,
  purchaseCallPlan,
};
