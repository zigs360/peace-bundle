const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
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

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Basic validation
    if (!phone || !serviceType || (!amount && !planId) || !network) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    // Verify service capability
    if (!networkServices[network] || !networkServices[network][serviceType]) {
      return res.status(400).json({ success: false, message: `Service ${serviceType} not supported for ${network}` });
    }

    const t = await sequelize.transaction();

    try {
      let result;
      let transactionType;
      let description;
      let finalAmount = parseFloat(amount || 0);

      if (serviceType === 'airtime' || serviceType === 'talkmore') {
        transactionType = 'airtime_purchase';
        description = `${network.toUpperCase()} ${serviceType === 'talkmore' ? 'TalkMore' : 'Airtime'} ₦${finalAmount} to ${phone}`;
        
        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          finalAmount,
          transactionType,
          description,
          { network, phone, amount: finalAmount, serviceType },
          t
        );

        // Call SMEPlug API for airtime (TalkMore is just airtime purchase + USSD)
        // Note: For TalkMore, we just buy the airtime, and the user dials USSD on their phone.
        const providerResponse = await smeplugService.purchaseAirtime(network, phone, finalAmount);
        
        if (!providerResponse.success) {
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

        // Determine price (could use getPriceForUser if implemented)
        const price = parseFloat(plan.admin_price);

        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          price,
          transactionType,
          `${network.toUpperCase()} ${plan.size} Data Purchase to ${phone}`,
          { network, phone, planId, amount: price, planName: plan.name },
          t
        );

        // Call SMEPlug API
        const providerResponse = await smeplugService.purchaseData(network, phone, plan.smeplug_plan_id || plan.id);
        
        if (!providerResponse.success) {
          throw new Error(providerResponse.error || 'Failed to process data purchase');
        }

        await t.commit();

        return res.json({
          success: true,
          message: 'Data purchase successful',
          transaction: newTransaction
        });
      } else {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid service type' });
      }

    } catch (error) {
      if (t) await t.rollback();
      logger.error('Unified Purchase Error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Processing failed' });
    }

  } catch (error) {
    logger.error('Unified Purchase Outer Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  purchaseUnified,
  networkServices
};
