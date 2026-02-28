const CallPlan = require('../models/CallPlan');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Create a new call plan
 * @route   POST /api/callplans
 * @access  Private (Admin)
 */
const createCallPlan = async (req, res) => {
  try {
    const { name, provider, price, minutes, validityDays, status, type } = req.body;

    const callPlan = await CallPlan.create({
      name,
      provider,
      price,
      minutes,
      validityDays,
      status,
      type,
    });

    res.status(201).json({
      success: true,
      message: 'Call plan created successfully',
      data: callPlan,
    });
  } catch (error) {
    logger.error('Error creating call plan:', error);
    res.status(500).json({ success: false, message: error.message });
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

    if (provider) where.provider = provider;
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
    logger.error('Error fetching call plans:', error);
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Call plan not found' });
    }

    res.json({
      success: true,
      data: callPlan,
    });
  } catch (error) {
    logger.error('Error fetching call plan by ID:', error);
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Call plan not found' });
    }

    callPlan.name = name || callPlan.name;
    callPlan.provider = provider || callPlan.provider;
    callPlan.price = price || callPlan.price;
    callPlan.minutes = minutes || callPlan.minutes;
    callPlan.validityDays = validityDays || callPlan.validityDays;
    callPlan.status = status || callPlan.status;
    callPlan.type = type || callPlan.type;

    await callPlan.save();

    res.json({
      success: true,
      message: 'Call plan updated successfully',
      data: callPlan,
    });
  } catch (error) {
    logger.error('Error updating call plan:', error);
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Call plan not found' });
    }

    await callPlan.destroy();

    res.json({ success: true, message: 'Call plan deleted successfully' });
  } catch (error) {
    logger.error('Error deleting call plan:', error);
    res.status(500).json({ success: false, message: error.message });
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

    const callPlan = await CallPlan.findByPk(callPlanId);
    if (!callPlan) {
      return res.status(404).json({ success: false, message: 'Call plan not found' });
    }

    const user = await User.findByPk(userId, { include: [Wallet] });
    if (!user || !user.wallet) {
      return res.status(404).json({ success: false, message: 'User or wallet not found' });
    }

    // Check if user has sufficient balance
    if (parseFloat(user.wallet.balance) < parseFloat(callPlan.price)) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    // Deduct from wallet
    user.wallet.balance = parseFloat(user.wallet.balance) - parseFloat(callPlan.price);
    await user.wallet.save();

    // Record transaction
    await Transaction.create({
      userId,
      type: 'call_plan_purchase',
      amount: callPlan.price,
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

    // TODO: Integrate with Smeplug or other service to actually activate the call plan
    logger.info(`Call plan ${callPlan.name} purchased for ${recipientPhoneNumber} by user ${userId}. Smeplug integration pending.`);

    res.json({
      success: true,
      message: 'Call plan purchased successfully. Activation is being processed.',
    });
  } catch (error) {
    logger.error('Error purchasing call plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createCallPlan,
  getCallPlans,
  getCallPlanById,
  updateCallPlan,
  deleteCallPlan,
  purchaseCallPlan,
};
