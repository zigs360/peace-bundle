const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const DataPlan = require('../models/DataPlan');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
const simManagementService = require('../services/simManagementService');
const dataPurchaseService = require('../services/dataPurchaseService');
const pricingService = require('../services/pricingService');
const transactionLimitService = require('../services/transactionLimitService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const { sanitizeTransactionForClient } = require('../utils/clientPayloadSanitizers');

const networkServices = {
  airtel: { airtime: true, data: true },
  mtn: { airtime: true, data: true },
  glo: { airtime: true, data: true },
  '9mobile': { airtime: true, data: true }
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
    
    // Normalize network to lowercase
    const cleanNetwork = network.toLowerCase();
    
    // Verify service capability
    if (!networkServices[cleanNetwork] || !networkServices[cleanNetwork][serviceType]) {
      return res.status(400).json({ success: false, message: `Service ${serviceType} not supported for ${network}` });
    }

    try {
      t = await sequelize.transaction();

      let transactionType;
      let description;
      let finalAmount = parseFloat(amount || 0);

      if (serviceType === 'airtime') {
        transactionType = 'airtime_purchase';
        description = `${network.toUpperCase()} Airtime ₦${finalAmount} to ${cleanPhone}`;

        const quote = await pricingService.quoteAirtime({ user, provider: cleanNetwork, faceValue: finalAmount, transaction: t });
        const chargedAmount = parseFloat(String(quote.charged_amount));
        
        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          chargedAmount,
          transactionType,
          description,
          { network: cleanNetwork, phone: cleanPhone, amount: finalAmount, chargedAmount, serviceType, planId, pricing: quote },
          t
        );

        const transactionFingerprint = transactionIntegrityService.buildFingerprint({
          userId: user.id,
          source: 'airtime_purchase',
          recipientPhone: cleanPhone,
          amount: chargedAmount,
          network: cleanNetwork,
          faceValue: finalAmount,
        });
        await transactionIntegrityService.annotateDebitTransaction(
          newTransaction,
          {
            recipient_phone: cleanPhone,
            provider: cleanNetwork,
            client_reference: newTransaction.reference,
            transaction_fingerprint: transactionFingerprint,
          },
          t,
        );

        await newTransaction.update(
          {
            status: 'processing',
            recipient_phone: cleanPhone,
            provider: cleanNetwork,
            metadata: {
              ...(newTransaction.metadata || {}),
              vend_amount: finalAmount,
              charged_amount: chargedAmount,
              service_type: serviceType,
              pricing: quote
            }
          },
          { transaction: t }
        );

        const preferredSim = await simManagementService.getOptimalSim(cleanNetwork, finalAmount);
        const route = transactionIntegrityService.selectAirtimeRoute({ network: cleanNetwork, preferredSim });
        await transactionIntegrityService.lockRoute(newTransaction, route, t);
        if (route.simId) {
          newTransaction.simId = route.simId;
          await newTransaction.save({ transaction: t });
        }

        let providerResult;
        try {
          providerResult = await dataPurchaseService.dispenseAirtimeWithFallback(
            newTransaction,
            { network: cleanNetwork, amount: finalAmount, phoneNumber: cleanPhone },
            { endpoint: 'POST /api/purchase/unified', userId, serviceType },
            t
          );
        } catch (providerError) {
          await t.commit();
          return res.status(502).json({
            success: false,
            message: providerError.message || 'Failed to process airtime purchase',
            transaction: newTransaction
          });
        }

        if (providerResult?.failed || ['failed', 'refunded'].includes(String(newTransaction.status || '').toLowerCase())) {
          await t.commit();
          return res.status(502).json({
            success: false,
            message: newTransaction.failure_reason || 'Failed to process airtime purchase',
            transaction: newTransaction
          });
        }

        await t.commit();
        
        return res.json({
          success: true,
          message: providerResult?.pending
            ? 'Airtime purchase queued for verification'
            : 'Airtime purchase successful',
          transaction: newTransaction,
          activationCode: null
        });

      } else if (serviceType === 'data') {
        transactionType = 'data_purchase';
        
        // Fetch plan to get price and external ID
        const plan = await DataPlan.findByPk(planId);
        if (!plan) {
          throw new Error('Invalid data plan selected');
        }

        const quote = await pricingService.quoteDataPlan({ user, plan, transaction: t });
        const price = parseFloat(String(quote.charged_amount));

        // Debit Wallet
        const newTransaction = await walletService.debit(
          user,
          price,
          transactionType,
          `${network.toUpperCase()} ${plan.size} Data Purchase to ${cleanPhone}`,
          { network: cleanNetwork, phone: cleanPhone, planId, amount: price, planName: plan.name, pricing: quote },
          t
        );

        const transactionFingerprint = transactionIntegrityService.buildFingerprint({
          userId: user.id,
          source: 'data_purchase',
          recipientPhone: cleanPhone,
          amount: price,
          network: cleanNetwork,
          planId: plan.id,
        });
        await transactionIntegrityService.annotateDebitTransaction(
          newTransaction,
          {
            recipient_phone: cleanPhone,
            provider: cleanNetwork,
            data_plan_id: plan.id,
            client_reference: newTransaction.reference,
            transaction_fingerprint: transactionFingerprint,
          },
          t,
        );

        const optimalSim = plan.available_sim === false ? null : await simManagementService.getOptimalSimForData(plan);
        const route = transactionIntegrityService.selectDataRoute({ plan, preferredSim: optimalSim });
        await transactionIntegrityService.lockRoute(newTransaction, route, t);
        newTransaction.status = 'processing';
        newTransaction.recipient_phone = cleanPhone;
        newTransaction.provider = cleanNetwork;
        newTransaction.dataPlanId = plan.id;
        if (route.simId) newTransaction.simId = route.simId;
        await newTransaction.save({ transaction: t });

        await dataPurchaseService.dispenseData(newTransaction, optimalSim, t);

        if (['failed', 'refunded'].includes(String(newTransaction.status || '').toLowerCase())) {
          await t.commit();
          return res.status(502).json({
            success: false,
            message: newTransaction.failure_reason || 'Failed to process data purchase',
            transaction: sanitizeTransactionForClient(newTransaction, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' })
          });
        }

        await t.commit();

        return res.json({
          success: true,
          message: 'Data purchase successful',
          transaction: sanitizeTransactionForClient(newTransaction, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' })
        });
      } else {
        if (t) await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid service type' });
      }

    } catch (error) {
      if (t && !t.finished) {
        try {
          await t.rollback();
        } catch (rbErr) {
          logger.error('Rollback Error:', rbErr.message);
        }
      }

      if (res.headersSent || res.writableEnded || res.locals.requestTimedOut) {
        return;
      }
      
      const errorMessage = error.message || 'Internal Server Error';
      const isClientError = errorMessage.includes('selected') || 
                           errorMessage.includes('limit') || 
                           errorMessage.includes('balance') ||
                           errorMessage.includes('failed') ||
                           errorMessage.includes('provider') ||
                           errorMessage.includes('supported') ||
                           errorMessage.includes('Insufficient');
      
      logger.error('Unified Purchase Error:', { 
        message: errorMessage, 
        userId, 
        phone,
        serviceType 
      });

      // Map API errors to 400 if they are validation or balance related
      const statusCode = isClientError ? 400 : 500;

      return res.status(statusCode).json({ 
        success: false, 
        message: errorMessage 
      });
    }

  } catch (error) {
    logger.error('Unified Purchase Outer Error:', { error: error.message, stack: error.stack, userId });
    if (res.headersSent || res.writableEnded || res.locals.requestTimedOut) {
      return;
    }
    res.status(500).json({ 
      success: false, 
      message: 'Critical Server Error: ' + error.message 
    });
  }
};

module.exports = {
  purchaseUnified,
  networkServices
};
