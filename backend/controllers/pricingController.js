const Joi = require('joi');
const PricingTier = require('../models/PricingTier');
const PricingRule = require('../models/PricingRule');
const PricingAuditLog = require('../models/PricingAuditLog');
const pricingService = require('../services/pricingService');
const notificationRealtimeService = require('../services/notificationRealtimeService');

const getClientInfo = (req) => {
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.ip;
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : null;
  return { ip, userAgent };
};

const emitPricingUpdate = () => {
  pricingService.invalidateCache();
  notificationRealtimeService.emitToAll('pricing_update', { updatedAt: new Date().toISOString() });
};

const listTiers = async (req, res) => {
  const count = await PricingTier.count();
  if (count === 0) {
    await pricingService.getOrCreateTierByName('default');
  }
  const tiers = await PricingTier.findAll({ order: [['priority', 'ASC'], ['name', 'ASC']] });
  res.json({ success: true, data: tiers });
};

const createTier = async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    description: Joi.string().trim().allow('', null).max(200).optional(),
    priority: Joi.number().integer().min(0).max(10000).optional(),
    is_active: Joi.boolean().optional(),
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, message: error.message });

  const before = null;
  const created = await PricingTier.create({
    name: value.name.toLowerCase(),
    description: value.description || null,
    priority: value.priority ?? 100,
    is_active: value.is_active ?? true,
  });

  const { ip, userAgent } = getClientInfo(req);
  await PricingAuditLog.create({
    adminId: req.user?.id || null,
    action: 'create',
    entity_type: 'pricing_tier',
    entity_id: created.id,
    before,
    after: created.toJSON(),
    ip,
    user_agent: userAgent,
  });

  emitPricingUpdate();
  res.status(201).json({ success: true, data: created });
};

const updateTier = async (req, res) => {
  const schema = Joi.object({
    description: Joi.string().trim().allow('', null).max(200).optional(),
    priority: Joi.number().integer().min(0).max(10000).optional(),
    is_active: Joi.boolean().optional(),
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, message: error.message });

  const tier = await PricingTier.findByPk(req.params.id);
  if (!tier) return res.status(404).json({ success: false, message: 'Pricing tier not found' });

  const before = tier.toJSON();
  await tier.update({
    description: value.description !== undefined ? (value.description || null) : tier.description,
    priority: value.priority !== undefined ? value.priority : tier.priority,
    is_active: value.is_active !== undefined ? value.is_active : tier.is_active,
  });

  const { ip, userAgent } = getClientInfo(req);
  await PricingAuditLog.create({
    adminId: req.user?.id || null,
    action: 'update',
    entity_type: 'pricing_tier',
    entity_id: tier.id,
    before,
    after: tier.toJSON(),
    ip,
    user_agent: userAgent,
  });

  emitPricingUpdate();
  res.json({ success: true, data: tier });
};

const listRules = async (req, res) => {
  const { tierId, product_type } = req.query;
  const where = {};
  if (tierId) where.tierId = tierId;
  if (product_type) where.product_type = product_type;
  const rules = await PricingRule.findAll({ where, order: [['createdAt', 'DESC']] });
  res.json({ success: true, data: rules });
};

const createRule = async (req, res) => {
  const schema = Joi.object({
    tierId: Joi.string().uuid().required(),
    product_type: Joi.string().valid('airtime', 'data', 'subscription').required(),
    provider: Joi.string().valid('mtn', 'airtel', 'glo', '9mobile').allow(null, '').optional(),
    dataPlanId: Joi.alternatives().try(Joi.number().integer().min(1), Joi.string().pattern(/^\d+$/)).allow(null, '').optional(),
    subscriptionPlanId: Joi.string().uuid().allow(null, '').optional(),
    fixed_price: Joi.number().min(0).allow(null).optional(),
    base_price: Joi.number().min(0).allow(null).optional(),
    markup_percent: Joi.number().min(-100).max(1000).allow(null).optional(),
    discount_percent: Joi.number().min(0).max(100).allow(null).optional(),
    min_price: Joi.number().min(0).allow(null).optional(),
    max_price: Joi.number().min(0).allow(null).optional(),
    starts_at: Joi.date().allow(null).optional(),
    ends_at: Joi.date().allow(null).optional(),
    is_active: Joi.boolean().optional(),
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, message: error.message });

  if (value.starts_at && value.ends_at && new Date(value.starts_at) > new Date(value.ends_at)) {
    return res.status(400).json({ success: false, message: 'starts_at cannot be after ends_at' });
  }

  if (value.product_type === 'airtime') {
    if (value.dataPlanId || value.subscriptionPlanId) {
      return res.status(400).json({ success: false, message: 'airtime rules cannot target plans' });
    }
  }
  if (value.product_type === 'data' && value.subscriptionPlanId) {
    return res.status(400).json({ success: false, message: 'data rules cannot target subscriptionPlanId' });
  }
  if (value.product_type === 'subscription' && value.dataPlanId) {
    return res.status(400).json({ success: false, message: 'subscription rules cannot target dataPlanId' });
  }

  const created = await PricingRule.create({
    ...value,
    provider: value.provider ? String(value.provider).toLowerCase() : null,
    dataPlanId: value.dataPlanId ? Number.parseInt(String(value.dataPlanId), 10) : null,
    subscriptionPlanId: value.subscriptionPlanId || null,
    createdBy: req.user?.id || null,
    updatedBy: req.user?.id || null,
    is_active: value.is_active ?? true,
  });

  const { ip, userAgent } = getClientInfo(req);
  await PricingAuditLog.create({
    adminId: req.user?.id || null,
    action: 'create',
    entity_type: 'pricing_rule',
    entity_id: created.id,
    before: null,
    after: created.toJSON(),
    ip,
    user_agent: userAgent,
  });

  emitPricingUpdate();
  res.status(201).json({ success: true, data: created });
};

const updateRule = async (req, res) => {
  const schema = Joi.object({
    provider: Joi.string().valid('mtn', 'airtel', 'glo', '9mobile').allow(null, '').optional(),
    dataPlanId: Joi.alternatives().try(Joi.number().integer().min(1), Joi.string().pattern(/^\d+$/)).allow(null, '').optional(),
    subscriptionPlanId: Joi.string().uuid().allow(null, '').optional(),
    fixed_price: Joi.number().min(0).allow(null).optional(),
    base_price: Joi.number().min(0).allow(null).optional(),
    markup_percent: Joi.number().min(-100).max(1000).allow(null).optional(),
    discount_percent: Joi.number().min(0).max(100).allow(null).optional(),
    min_price: Joi.number().min(0).allow(null).optional(),
    max_price: Joi.number().min(0).allow(null).optional(),
    starts_at: Joi.date().allow(null).optional(),
    ends_at: Joi.date().allow(null).optional(),
    is_active: Joi.boolean().optional(),
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, message: error.message });

  const rule = await PricingRule.findByPk(req.params.id);
  if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });

  if (value.starts_at && value.ends_at && new Date(value.starts_at) > new Date(value.ends_at)) {
    return res.status(400).json({ success: false, message: 'starts_at cannot be after ends_at' });
  }

  const before = rule.toJSON();
  await rule.update({
    provider: value.provider !== undefined ? (value.provider ? String(value.provider).toLowerCase() : null) : rule.provider,
    dataPlanId:
      value.dataPlanId !== undefined ? (value.dataPlanId ? Number.parseInt(String(value.dataPlanId), 10) : null) : rule.dataPlanId,
    subscriptionPlanId:
      value.subscriptionPlanId !== undefined ? (value.subscriptionPlanId || null) : rule.subscriptionPlanId,
    fixed_price: value.fixed_price !== undefined ? value.fixed_price : rule.fixed_price,
    base_price: value.base_price !== undefined ? value.base_price : rule.base_price,
    markup_percent: value.markup_percent !== undefined ? value.markup_percent : rule.markup_percent,
    discount_percent: value.discount_percent !== undefined ? value.discount_percent : rule.discount_percent,
    min_price: value.min_price !== undefined ? value.min_price : rule.min_price,
    max_price: value.max_price !== undefined ? value.max_price : rule.max_price,
    starts_at: value.starts_at !== undefined ? value.starts_at : rule.starts_at,
    ends_at: value.ends_at !== undefined ? value.ends_at : rule.ends_at,
    is_active: value.is_active !== undefined ? value.is_active : rule.is_active,
    updatedBy: req.user?.id || null,
  });

  const { ip, userAgent } = getClientInfo(req);
  await PricingAuditLog.create({
    adminId: req.user?.id || null,
    action: 'update',
    entity_type: 'pricing_rule',
    entity_id: rule.id,
    before,
    after: rule.toJSON(),
    ip,
    user_agent: userAgent,
  });

  emitPricingUpdate();
  res.json({ success: true, data: rule });
};

const deleteRule = async (req, res) => {
  const rule = await PricingRule.findByPk(req.params.id);
  if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });

  const before = rule.toJSON();
  await rule.update({ is_active: false, updatedBy: req.user?.id || null });

  const { ip, userAgent } = getClientInfo(req);
  await PricingAuditLog.create({
    adminId: req.user?.id || null,
    action: 'delete',
    entity_type: 'pricing_rule',
    entity_id: rule.id,
    before,
    after: rule.toJSON(),
    ip,
    user_agent: userAgent,
  });

  emitPricingUpdate();
  res.json({ success: true });
};

const listAuditLogs = async (req, res) => {
  const limit = Math.min(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 200);
  const logs = await PricingAuditLog.findAll({ order: [['createdAt', 'DESC']], limit });
  res.json({ success: true, data: logs });
};

module.exports = {
  listTiers,
  createTier,
  updateTier,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  listAuditLogs,
};
