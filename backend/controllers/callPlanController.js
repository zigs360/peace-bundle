const CallPlan = require('../models/CallPlan');
const VoiceBundle = require('../models/VoiceBundle');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const VoiceBundlePurchaseAudit = require('../models/VoiceBundlePurchaseAudit');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const walletService = require('../services/walletService');
const pricingService = require('../services/pricingService');
const ussdParserService = require('../services/ussdParserService');
const callSubTelecomService = require('../services/callSubTelecomService');
const callSubLifecycleService = require('../services/callSubLifecycleService');
const callSubMigrationService = require('../services/callSubMigrationService');
const { getCallSubProvider, listCallSubProviders } = require('../services/callSubCatalog');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const { sendEmail, sendSMS } = require('../services/notificationService');
const sequelize = require('../config/database');
const jwt = require('jsonwebtoken');

/**
 * @desc    Get voice bundles (TalkMore, etc.)
 * @route   GET /api/callplans/voice-bundles
 * @access  Public
 */
const getVoiceBundles = async (req, res) => {
  try {
    const { network, status } = req.query;
    if (!network || String(network).toLowerCase() === 'airtel') {
      const bundles = callSubLifecycleService.getPublicBundles('airtel').map((bundle) => ({
        id: bundle.code,
        network: 'airtel',
        plan_name: bundle.name,
        amount: bundle.price,
        validity: `${bundle.validityDays} days`,
        api_plan_id: bundle.code,
        minutes: bundle.minutes,
        is_active: status !== 'inactive',
      }));
      return res.json(bundles);
    }

    const where = { network: network.toLowerCase() };
    if (status !== undefined) where.is_active = status === 'active';
    const bundles = await VoiceBundle.findAll({ where, order: [['amount', 'ASC']] });
    res.json(bundles);
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

    if (String(type || 'prepaid') === 'voice' && Number(minutes || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Legacy validity bundles are retired. Voice plans must include minute credits.',
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

    let user = null;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) user = await User.findByPk(decoded.id);
      } catch (e) {
        void e;
      }
    }

    const payload = await Promise.all(
      callPlans.map(async (p) => {
        const json = p.toJSON();
        try {
          const quote = await pricingService.quoteSubscriptionPlan({ user, plan: p });
          json.effective_price = parseFloat(String(quote.charged_amount));
        } catch (e) {
          void e;
          json.effective_price = parseFloat(String(p.price));
        }
        return json;
      }),
    );

    res.json(payload);
  } catch (error) {
    logger.error(`[CallPlan] Fetch error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve call plans' 
    });
  }
};

const resolvePricedPlans = async (plans, req) => {
  let user = null;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.id) user = await User.findByPk(decoded.id);
    } catch (e) {
      void e;
    }
  }

  return Promise.all(
    plans.map(async (plan) => {
      const json = plan.toJSON();
      try {
        const quote = await pricingService.quoteSubscriptionPlan({ user, plan });
        json.effective_price = parseFloat(String(quote.charged_amount));
      } catch (e) {
        void e;
        json.effective_price = parseFloat(String(plan.price));
      }
      return json;
    }),
  );
};

const resolveCallSubProvider = (providerKey) => {
  const provider = getCallSubProvider(providerKey);
  if (!provider) {
    const error = new Error('Unsupported call sub provider');
    error.statusCode = 404;
    throw error;
  }
  return provider;
};

const getCallSubProviders = async (req, res) => {
  void req;
  try {
    res.json({ success: true, data: listCallSubProviders() });
  } catch (error) {
    logger.error(`[CallPlan] Call sub providers fetch error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to retrieve call sub providers' });
  }
};

const getCallSubBundles = async (req, res) => {
  try {
    const provider = resolveCallSubProvider(req.params.provider);
    const where = {
      provider: provider.key,
      status: 'active',
      type: 'voice',
      api_plan_id: { [Op.like]: `${provider.apiPlanPrefix}%` },
    };
    const plans = await CallPlan.findAll({ where, order: [['price', 'ASC']] });
    const payload = await resolvePricedPlans(plans, req);
    res.json({ success: true, data: payload });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error(`[CallPlan] Call sub bundles fetch error: ${error.message}`);
    res.status(statusCode).json({ success: false, message: statusCode === 404 ? error.message : 'Failed to retrieve call sub bundles' });
  }
};

const purchaseCallSubBundle = async (req, res) => {
  const userId = req.user.id;
  const callPlanId = req.params.id;
  const { recipientPhoneNumber } = req.body || {};

  try {
    const provider = resolveCallSubProvider(req.params.provider);
    if (!recipientPhoneNumber || !ussdParserService.validatePhoneNumber(recipientPhoneNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid recipient phone number' });
    }

    const phone = ussdParserService.formatPhoneNumber(recipientPhoneNumber);
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const callPlan = await CallPlan.findByPk(callPlanId);
    if (!callPlan || callPlan.provider !== provider.key) {
      return res.status(404).json({ success: false, message: 'Selected bundle no longer exists' });
    }
    if (Number(callPlan.minutes || 0) <= 0) {
      return res.status(400).json({ success: false, message: 'Legacy validity bundles can no longer be purchased' });
    }
    if (!callPlan.api_plan_id || !String(callPlan.api_plan_id).startsWith(provider.apiPlanPrefix)) {
      return res.status(400).json({ success: false, message: 'This bundle is not available for activation' });
    }

    const quote = await pricingService.quoteSubscriptionPlan({ user, plan: callPlan });
    const chargedAmount = parseFloat(String(quote.charged_amount));
    if (!Number.isFinite(chargedAmount) || chargedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bundle price' });
    }
    const expiresAt = callSubLifecycleService.computeExpiryFromBundle(callPlan.toJSON(), new Date());

    const reference = `${provider.apiPlanPrefix}${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const { txn, purchase } = await sequelize.transaction(async (t) => {
      const txnRow = await walletService.debit(
        user,
        chargedAmount,
        'airtime_purchase',
        `${provider.label} call sub purchase: ${callPlan.name} for ${phone}`,
        {
          reference,
          kind: provider.purchaseKind,
          callPlanId: callPlan.id,
          callPlanName: callPlan.name,
          api_plan_id: callPlan.api_plan_id,
          recipient_phone: phone,
          provider: provider.key,
          minutes: callPlan.minutes,
          validityDays: callPlan.validityDays,
          pricing: quote,
        },
        t,
      );

      await Transaction.update(
        { provider: provider.key, recipient_phone: phone, metadata: { ...(txnRow.metadata || {}), provider: provider.key, recipient_phone: phone } },
        { where: { id: txnRow.id }, transaction: t },
      );

      const purchaseRow = await VoiceBundlePurchase.create(
        {
          reference,
          userId: user.id,
          callPlanId: callPlan.id,
          transactionId: txnRow.id,
          provider: provider.key,
          recipientPhoneNumber: phone,
          amountCharged: chargedAmount,
          minutes: callPlan.minutes,
          validityDays: callPlan.validityDays,
          expiresAt,
          apiPlanId: callPlan.api_plan_id,
          status: 'processing',
          bundleCategory: 'minute',
          metadata: { pricing: quote, bundleCategory: 'minute' },
        },
        { transaction: t },
      );

      await VoiceBundlePurchaseAudit.create(
        { purchaseId: purchaseRow.id, userId: user.id, eventType: 'created', metadata: { transactionId: txnRow.id } },
        { transaction: t },
      );

      return { txn: txnRow, purchase: purchaseRow };
    });

    const activation = await callSubTelecomService.activate({
      provider: provider.key,
      apiPlanId: String(callPlan.api_plan_id),
      phoneNumber: phone,
      reference,
    });

    if (!activation.success) {
      const errorMsg = activation.error || 'Activation failed';
      await sequelize.transaction(async (t) => {
        await VoiceBundlePurchase.update(
          { status: 'failed', failureReason: errorMsg, metadata: { ...(purchase.metadata || {}), activation: activation || null } },
          { where: { id: purchase.id }, transaction: t },
        );
        await VoiceBundlePurchaseAudit.create(
          { purchaseId: purchase.id, userId: user.id, eventType: 'failed', metadata: { error: errorMsg } },
          { transaction: t },
        );
        await walletService.adminAdjust(
          user,
          chargedAmount,
          'refund',
          `Refund for failed ${provider.label} call sub activation (${reference})`,
          { reference: `RF-${reference}`, original_reference: reference, kind: provider.refundKind },
          t,
        );
        await VoiceBundlePurchase.update({ status: 'refunded' }, { where: { id: purchase.id }, transaction: t });
        await VoiceBundlePurchaseAudit.create(
          { purchaseId: purchase.id, userId: user.id, eventType: 'refunded', metadata: { refund_reference: `RF-${reference}` } },
          { transaction: t },
        );
      });

      return res.status(502).json({ success: false, message: errorMsg });
    }

    await sequelize.transaction(async (t) => {
      await VoiceBundlePurchase.update(
        {
          status: 'completed',
          providerReference: activation.providerReference || null,
          metadata: { ...(purchase.metadata || {}), activation: activation || null },
        },
        { where: { id: purchase.id }, transaction: t },
      );
      await VoiceBundlePurchaseAudit.create(
        { purchaseId: purchase.id, userId: user.id, eventType: 'completed', metadata: { providerReference: activation.providerReference || null } },
        { transaction: t },
      );
      await Transaction.update(
        { smeplug_reference: activation.providerReference || null, status: 'completed', smeplug_response: activation || null },
        { where: { id: txn.id }, transaction: t },
      );
    });

    try {
      notificationRealtimeService.emitToUser(user.id, 'voice_bundle_activated', {
        reference,
        phone,
        plan: callPlan.name,
        amount: chargedAmount,
        providerReference: activation.providerReference || null,
      });
    } catch (e) {
      void e;
    }

    try {
      await sendEmail(
        user.email,
        `${provider.emailLabel} call sub activated`,
        `Hello ${user.name || 'User'}, your ${provider.emailLabel} call sub bundle (${callPlan.name}) has been activated for ${phone}. Ref: ${reference}.`,
      );
      await sendSMS(user.phone, `PeaceBundlle: ${provider.smsLabel} call sub activated for ${phone}. Ref: ${reference}.`);
    } catch (e) {
      void e;
    }

    res.json({
      success: true,
      message: 'Bundle purchase successful',
      data: {
        reference,
        transactionId: txn.id,
        providerReference: activation.providerReference || null,
      },
    });
  } catch (error) {
    const msg = error.message || 'Purchase failed';
    if (msg.toLowerCase().includes('insufficient wallet balance')) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }
    const statusCode = error.statusCode || 500;
    logger.error(`[CallPlan] Call sub purchase error for user ${userId}: ${msg}`);
    if (statusCode === 404) {
      return res.status(404).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: 'An error occurred while processing your purchase' });
  }
};

const getMyCallSubHistory = async (req, res) => {
  try {
    const provider = resolveCallSubProvider(req.params.provider);
    const userId = req.user.id;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (Math.max(1, Number(req.query.page) || 1) - 1) * limit;
    const { count, rows } = await VoiceBundlePurchase.findAndCountAll({
      where: { userId, provider: provider.key },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      count,
      rows: rows.map((row) => {
        const json = row.toJSON();
        return {
          ...json,
          bundleCategory: json.bundleCategory || callSubLifecycleService.inferBundleCategory(json),
          expiresAt: json.expiresAt || callSubLifecycleService.getNaturalExpiryForPurchase(json),
        };
      }),
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error(`[CallPlan] Call sub history error: ${error.message}`);
    res.status(statusCode).json({ success: false, message: statusCode === 404 ? error.message : 'Failed to retrieve purchase history' });
  }
};

const adminCallSubAnalytics = async (req, res) => {
  try {
    const provider = resolveCallSubProvider(req.params.provider);
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = { provider: provider.key, createdAt: { [Op.gte]: since } };
    const rows = await VoiceBundlePurchase.findAll({ where });

    const totals = rows.reduce(
      (acc, r) => {
        const amt = r.bundleCategory === 'migrated_credit' ? 0 : parseFloat(String(r.amountCharged || 0));
        acc.count += 1;
        if (r.status === 'completed') acc.completed += 1;
        if (r.status === 'failed') acc.failed += 1;
        if (r.status === 'refunded') acc.refunded += 1;
        if (r.bundleCategory === 'legacy_validity' || callSubLifecycleService.isLegacyValidityPurchase(r)) acc.legacyValidity += 1;
        if (r.bundleCategory === 'migrated_credit') acc.migratedCredits += 1;
        acc.amount += Number.isFinite(amt) ? amt : 0;
        const key = String(r.apiPlanId || r.callPlanId);
        const item = acc.byBundle.get(key) || { key, name: r.apiPlanId || '', count: 0, amount: 0, completed: 0 };
        item.count += 1;
        item.amount += Number.isFinite(amt) ? amt : 0;
        if (r.status === 'completed') item.completed += 1;
        acc.byBundle.set(key, item);
        return acc;
      },
      { count: 0, completed: 0, failed: 0, refunded: 0, amount: 0, legacyValidity: 0, migratedCredits: 0, byBundle: new Map() },
    );

    res.json({
      success: true,
      provider: provider.key,
      since: since.toISOString(),
      totals: {
        count: totals.count,
        completed: totals.completed,
        failed: totals.failed,
        refunded: totals.refunded,
        amount: totals.amount,
        legacyValidity: totals.legacyValidity,
        migratedCredits: totals.migratedCredits,
      },
      bundles: Array.from(totals.byBundle.values()).sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error(`[CallPlan] Call sub analytics error: ${error.message}`);
    res.status(statusCode).json({ success: false, message: statusCode === 404 ? error.message : 'Failed to retrieve analytics' });
  }
};

const adminCallSubMonitoring = async (req, res) => {
  try {
    const provider = resolveCallSubProvider(req.params.provider);
    const snapshot = await callSubMigrationService.buildMonitoringSnapshot(provider.key);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error(`[CallPlan] Call sub monitoring error: ${error.message}`);
    res.status(statusCode).json({ success: false, message: statusCode === 404 ? error.message : 'Failed to retrieve monitoring snapshot' });
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

    if (String(type || callPlan.type) === 'voice' && Number(minutes ?? callPlan.minutes) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Legacy validity bundles are retired. Voice plans must include minute credits.',
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

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const quote = await pricingService.quoteSubscriptionPlan({ user, plan: callPlan });
    const chargedAmount = parseFloat(String(quote.charged_amount));

    const transaction = await sequelize.transaction(async (t) => {
      return walletService.debit(
        user,
        chargedAmount,
        'call_plan_purchase',
        `Purchase of ${callPlan.name} for ${recipientPhoneNumber}`,
        {
          callPlanId: callPlan.id,
          callPlanName: callPlan.name,
          recipientPhoneNumber,
          provider: callPlan.provider,
          minutes: callPlan.minutes,
          validityDays: callPlan.validityDays,
          pricing: quote,
        },
        t
      );
    });

    logger.info(`[CallPlan] Purchase successful: User ${userId} bought ${callPlan.name} for ${recipientPhoneNumber}. Transaction: ${transaction.id}`);

    res.json({
      success: true,
      message: 'Call plan purchased successfully. Activation is being processed.',
      data: {
        transactionId: transaction.id,
        newBalance: await walletService.getBalance(user)
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
  getCallSubProviders,
  getCallSubBundles,
  getCallPlanById,
  updateCallPlan,
  deleteCallPlan,
  purchaseCallPlan,
  purchaseCallSubBundle,
  getMyCallSubHistory,
  adminCallSubAnalytics,
  adminCallSubMonitoring,
};
