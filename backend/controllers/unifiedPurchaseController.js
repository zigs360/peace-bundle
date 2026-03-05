const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
const transactionLimitService = require('../services/transactionLimitService');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

const networkServices = {
  airtel: { airtime: true, data: true, talkmore: true },
  mtn: { airtime: true, data: true, talkmore: false },
  glo: { airtime: true, data: true, talkmore: false },
  '9mobile': { airtime: true, data: true, talkmore: false }
};

/**
 * @desc    Unified purchase endpoint
 * @route   POST /api/purchase/unified
 * @access  Private
 */
const purchaseUnified = async (req, res) => {
  const { phone, serviceType, amount, network, planId } = req.body;
  const userId = req.user.id;
  let t;

  logger.info(`Unified Purchase Initiation: User ${userId}, Service ${serviceType}, Phone ${phone}, Amount ${amount}, Network ${network}`);

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check Transaction Limits
    const limitCheck = await transactionLimitService.canTransact(user);
    if (!limitCheck.allowed) {
        return res.status(403).json({ 
            success: false,
            message: limitCheck.reason,
            details: limitCheck 
        });
    }

    // Basic validation
    if (!phone || !serviceType || (!amount && !planId) || !network) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    // Normalize phone for backend processing if needed
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('234')) {
      cleanPhone = '0' + cleanPhone.substring(3);
    }
    
    // Verify service capability
    if (!networkServices[network] || !networkServices[network][serviceType]) {
      return res.status(400).json({ success: false, message: `Service ${serviceType} not supported for ${network}` });
    }

    try {
      t = await sequelize.transaction();

      let result;
      let transactionType;
      let description;
      let finalAmount = parseFloat(amount || 0);

      if (serviceType === 'airtime' || serviceType === 'talkmore') {
        transactionType = 'airtime_purchase';
        description = `${network.toUpperCase()} ${serviceType === 'talkmore' ? 'TalkMore' : 'Airtime'} ₦${finalAmount} to ${cleanPhone}`;
        
        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          finalAmount,
          transactionType,
          description,
          { network, phone: cleanPhone, amount: finalAmount, serviceType, planId },
          t
        );

        // Call SMEPlug API for airtime
        const providerResponse = await smeplugService.purchaseVTU(network, cleanPhone, finalAmount);
        
        if (!providerResponse.success) {
          logger.error('Smeplug Airtime Failure:', providerResponse);
          throw new Error(providerResponse.error || 'Failed to process airtime purchase');
        }

        await t.commit();
        
        return res.json({
          success: true,
          message: `${serviceType === 'talkmore' ? 'TalkMore' : 'Airtime'} purchase successful`,
          transaction: newTransaction,
          activationCode: serviceType === 'talkmore' ? `*234*${finalAmount}#` : null
        });

      } else if (serviceType === 'data') {
        transactionType = 'data_purchase';
        
        // Fetch plan to get price and external ID
        const plan = await DataPlan.findByPk(planId);
        if (!plan) {
          throw new Error('Invalid data plan selected');
        }

        const price = parseFloat(await plan.getPriceForUser(user));

        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          price,
          transactionType,
          `${network.toUpperCase()} ${plan.size} Data Purchase to ${cleanPhone}`,
          { network, phone: cleanPhone, planId, amount: price, planName: plan.name },
          t
        );

        // Call SMEPlug API
        const providerResponse = await smeplugService.purchaseData(network, cleanPhone, plan.smeplug_plan_id || plan.id, 'wallet');
        
        if (!providerResponse.success) {
          logger.error('Smeplug Data Failure:', providerResponse);
          throw new Error(providerResponse.error || 'Failed to process data purchase');
        }

        await t.commit();

        return res.json({
          success: true,
          message: 'Data purchase successful',
          transaction: newTransaction
        });
      } else {
        if (t) await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid service type' });
      }

    } catch (error) {
      if (t) {
        try {
          await t.rollback();
        } catch (rbErr) {
          // Ignore rollback errors if already finished
        }
      }
      logger.error('Unified Purchase Inner Error:', { error: error.message, stack: error.stack, userId, phone });
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Processing failed' 
      });
    }

  } catch (error) {
    logger.error('Unified Purchase Outer Error:', { error: error.message, stack: error.stack, userId });
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  purchaseUnified,
  networkServices
};
