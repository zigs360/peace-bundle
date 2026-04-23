const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { DataPlan, PlanPriceHistory } = require('../config/db');
const logger = require('../utils/logger');

const EDITABLE_FIELDS = new Set([
  'your_price',
  'wallet_price',
  'available_sim',
  'available_wallet',
  'is_active',
  'original_price',
  'sort_order',
  'validity',
  'data_size',
  'name',
  'source',
  'provider',
  'plan_id',
]);

const PRICE_FIELDS = new Set(['your_price', 'wallet_price', 'original_price']);
const BOOLEAN_FIELDS = new Set(['available_sim', 'available_wallet', 'is_active']);
const TEXT_LIKE = sequelize.getDialect && sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;

function toNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

function getChangedBy(req) {
  return req.user?.email || req.user?.id || 'admin';
}

function normalizePlan(plan) {
  const json = plan.toJSON ? plan.toJSON() : plan;
  return {
    ...json,
    network: json.provider,
    plan: json.name,
    data_size: json.data_size || json.size || null,
    plan_id: json.plan_id || json.smeplug_plan_id || json.ogdams_sku || null,
    original_price: toNumber(json.original_price ?? json.api_cost, 0),
    your_price: toNumber(json.your_price ?? json.admin_price, 0),
    wallet_price: toNumber(json.wallet_price ?? json.api_cost, 0),
    available_sim: Boolean(json.available_sim),
    available_wallet: Boolean(json.available_wallet),
    is_active: Boolean(json.is_active),
  };
}

function buildWhere(query) {
  const where = {};
  const source = String(query.source || '').trim().toLowerCase();
  const network = String(query.network || query.provider || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();
  const search = String(query.search || '').trim();
  const dataSize = String(query.data_size || '').trim();
  const validity = String(query.validity || '').trim();

  if (source) where.source = source;
  if (network) where.provider = network;
  if (dataSize) where.data_size = dataSize;
  if (validity) where.validity = validity;
  if (status === 'active') where.is_active = true;
  if (status === 'inactive') where.is_active = false;

  if (search) {
    where[Op.or] = [
      { name: { [TEXT_LIKE]: `%${search}%` } },
      { plan_id: { [TEXT_LIKE]: `%${search}%` } },
      { data_size: { [TEXT_LIKE]: `%${search}%` } },
      { smeplug_plan_id: { [TEXT_LIKE]: `%${search}%` } },
      { ogdams_sku: { [TEXT_LIKE]: `%${search}%` } },
    ];
  }

  return where;
}

async function recordHistory({ planId, fieldName, oldValue, newValue, changedBy, reason = null, source = null, transaction }) {
  if (String(oldValue) === String(newValue)) return;
  await PlanPriceHistory.create(
    {
      planIdRef: planId,
      field_name: fieldName,
      old_price: PRICE_FIELDS.has(fieldName) ? toNumber(oldValue) : null,
      new_price: PRICE_FIELDS.has(fieldName) ? toNumber(newValue) : null,
      old_value: oldValue === null || oldValue === undefined ? null : String(oldValue),
      new_value: newValue === null || newValue === undefined ? null : String(newValue),
      changed_by: changedBy,
      reason,
      source,
    },
    { transaction },
  );
}

function applyLegacyPriceMirrors(plan) {
  const yourPrice = toNumber(plan.your_price, null);
  const walletPrice = toNumber(plan.wallet_price, null);
  const originalPrice = toNumber(plan.original_price, null);

  if (yourPrice !== null) {
    plan.admin_price = yourPrice;
  }

  if (walletPrice !== null) {
    plan.api_cost = walletPrice;
  } else if (originalPrice !== null) {
    plan.api_cost = originalPrice;
  }
}

async function updatePlanInstance(plan, payload, meta) {
  const changedFields = [];

  for (const [field, incomingValue] of Object.entries(payload)) {
    if (!EDITABLE_FIELDS.has(field)) continue;
    let nextValue = incomingValue;
    if (BOOLEAN_FIELDS.has(field)) {
      nextValue = toBoolean(incomingValue, Boolean(plan[field]));
    }
    if (PRICE_FIELDS.has(field)) {
      nextValue = toNumber(incomingValue, null);
    }

    const previousValue = plan[field];
    if (String(previousValue) === String(nextValue)) continue;
    plan[field] = nextValue;
    changedFields.push({ field, previousValue, nextValue });
  }

  if (!changedFields.length) return [];

  plan.last_updated_by = meta.changedBy;
  applyLegacyPriceMirrors(plan);
  await plan.save({ transaction: meta.transaction });

  for (const item of changedFields) {
    await recordHistory({
      planId: plan.id,
      fieldName: item.field,
      oldValue: item.previousValue,
      newValue: item.nextValue,
      changedBy: meta.changedBy,
      reason: meta.reason,
      source: plan.source,
      transaction: meta.transaction,
    });
  }

  return changedFields;
}

const listPlans = async (req, res) => {
  try {
    const page = Number.parseInt(String(req.query.page || '1'), 10);
    const limit = Number.parseInt(String(req.query.limit || '50'), 10);
    const offset = (page - 1) * limit;
    const where = buildWhere(req.query);

    const { count, rows } = await DataPlan.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ['provider', 'ASC'],
        ['source', 'ASC'],
        ['sort_order', 'ASC'],
        ['updatedAt', 'DESC'],
      ],
    });

    return res.json({
      success: true,
      items: rows.map(normalizePlan),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    logger.error('[AdminPlans] list failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load plans' });
  }
};

const getPlanFilters = async (_req, res) => {
  try {
    const plans = await DataPlan.findAll({
      attributes: ['source', 'provider', 'validity', 'data_size'],
      order: [['provider', 'ASC']],
    });
    const values = {
      sources: [...new Set(plans.map((plan) => String(plan.source || '').trim()).filter(Boolean))],
      networks: [...new Set(plans.map((plan) => String(plan.provider || '').trim()).filter(Boolean))],
      validities: [...new Set(plans.map((plan) => String(plan.validity || '').trim()).filter(Boolean))],
      data_sizes: [...new Set(plans.map((plan) => String(plan.data_size || plan.size || '').trim()).filter(Boolean))],
      statuses: ['active', 'inactive'],
    };
    return res.json({ success: true, ...values });
  } catch (error) {
    logger.error('[AdminPlans] filters failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load filters' });
  }
};

const getPlanById = async (req, res) => {
  try {
    const plan = await DataPlan.findByPk(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    return res.json({ success: true, item: normalizePlan(plan) });
  } catch (error) {
    logger.error('[AdminPlans] get by id failed', { error: error.message, id: req.params.id });
    return res.status(500).json({ success: false, message: 'Failed to load plan' });
  }
};

const updatePlan = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const plan = await DataPlan.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!plan) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const changedBy = getChangedBy(req);
    const changedFields = await updatePlanInstance(plan, req.body || {}, {
      changedBy,
      reason,
      transaction,
    });

    await transaction.commit();
    return res.json({
      success: true,
      message: changedFields.length ? 'Plan updated successfully' : 'No changes applied',
      item: normalizePlan(plan),
      changedFields: changedFields.map((item) => item.field),
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    logger.error('[AdminPlans] update failed', { error: error.message, id: req.params.id });
    return res.status(500).json({ success: false, message: 'Failed to update plan' });
  }
};

const togglePlanStatus = async (req, res) => {
  try {
    if (req.body?.is_active === undefined) {
      const plan = await DataPlan.findByPk(req.params.id);
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Plan not found' });
      }
      req.body = { ...(req.body || {}), is_active: !Boolean(plan.is_active) };
    }
    return updatePlan(req, res);
  } catch (error) {
    logger.error('[AdminPlans] toggle status failed', { error: error.message, id: req.params.id });
    return res.status(500).json({ success: false, message: 'Failed to toggle plan status' });
  }
};

const bulkUpdatePlans = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      ids,
      filters = {},
      operation,
      value,
      reason = null,
      preview = false,
      field = 'your_price',
      is_active,
    } = req.body || {};

    const where = Array.isArray(ids) && ids.length
      ? { id: { [Op.in]: ids } }
      : buildWhere(filters);

    const plans = await DataPlan.findAll({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['provider', 'ASC'], ['name', 'ASC']],
    });

    if (!plans.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'No plans matched the bulk update criteria' });
    }

    const numericValue = toNumber(value, null);
    const previewRows = [];
    const changedBy = getChangedBy(req);
    const targetField = String(field || 'your_price');

    for (const plan of plans) {
      const current = normalizePlan(plan);
      let nextValue = null;

      if (operation === 'set_fixed_price') {
        nextValue = numericValue;
      } else if (operation === 'increase_percentage') {
        nextValue = Number(((toNumber(current[targetField], 0) * (100 + toNumber(numericValue, 0))) / 100).toFixed(2));
      } else if (operation === 'decrease_percentage') {
        nextValue = Number(((toNumber(current[targetField], 0) * (100 - toNumber(numericValue, 0))) / 100).toFixed(2));
      } else if (operation === 'set_wallet_price') {
        nextValue = numericValue;
      } else if (operation === 'toggle_active') {
        nextValue = toBoolean(is_active, true);
      } else {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Unsupported bulk operation' });
      }

      const fieldToUpdate = operation === 'set_wallet_price'
        ? 'wallet_price'
        : operation === 'toggle_active'
          ? 'is_active'
          : targetField;

      previewRows.push({
        id: plan.id,
        name: plan.name,
        field: fieldToUpdate,
        oldValue: current[fieldToUpdate],
        newValue: nextValue,
      });

      if (!preview) {
        await updatePlanInstance(
          plan,
          { [fieldToUpdate]: nextValue },
          { changedBy, reason, transaction },
        );
      }
    }

    if (preview) {
      await transaction.rollback();
      return res.json({
        success: true,
        preview: true,
        count: previewRows.length,
        items: previewRows,
      });
    }

    await transaction.commit();
    return res.json({
      success: true,
      message: `Bulk update applied to ${previewRows.length} plans`,
      count: previewRows.length,
      items: previewRows,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    logger.error('[AdminPlans] bulk update failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
};

const exportPlansCsv = async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const plans = await DataPlan.findAll({
      where,
      order: [['provider', 'ASC'], ['source', 'ASC'], ['name', 'ASC']],
    });

    const rows = plans.map((plan) => normalizePlan(plan));
    const headers = [
      'Source',
      'Network',
      'Plan ID',
      'Plan Name',
      'Data Size',
      'Validity',
      'Original Price',
      'Your Price',
      'Wallet Price',
      'Available SIM',
      'Available Wallet',
      'Status',
      'Last Updated By',
    ];

    const csv = [
      headers.join(','),
      ...rows.map((row) => [
        row.source,
        row.network,
        row.plan_id,
        `"${String(row.name).replace(/"/g, '""')}"`,
        row.data_size || '',
        row.validity || '',
        row.original_price ?? '',
        row.your_price ?? '',
        row.wallet_price ?? '',
        row.available_sim ? 'Yes' : 'No',
        row.available_wallet ? 'Yes' : 'No',
        row.is_active ? 'Active' : 'Inactive',
        `"${String(row.last_updated_by || '').replace(/"/g, '""')}"`,
      ].join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="plans-export.csv"');
    return res.send(csv);
  } catch (error) {
    logger.error('[AdminPlans] export failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to export plans' });
  }
};

const getPriceHistory = async (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '100'), 10);
    const page = Number.parseInt(String(req.query.page || '1'), 10);
    const offset = (page - 1) * limit;
    const planId = req.query.planId ? Number(req.query.planId) : null;
    const adminUser = String(req.query.adminUser || '').trim();
    const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : null;
    const dateTo = req.query.date_to ? new Date(String(req.query.date_to)) : null;

    const where = {};
    if (planId) where.planIdRef = planId;
    if (adminUser) where.changed_by = { [TEXT_LIKE]: `%${adminUser}%` };
    if (dateFrom || dateTo) {
      where.changed_at = {};
      if (dateFrom) where.changed_at[Op.gte] = dateFrom;
      if (dateTo) where.changed_at[Op.lte] = dateTo;
    }

    const { count, rows } = await PlanPriceHistory.findAndCountAll({
      where,
      include: [{ model: DataPlan, as: 'plan', attributes: ['id', 'name', 'provider', 'source', 'plan_id', 'data_size'] }],
      order: [['changed_at', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      items: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    logger.error('[AdminPlans] history failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load price history' });
  }
};

const getPlanHistory = async (req, res) => {
  try {
    const rows = await PlanPriceHistory.findAll({
      where: { planIdRef: Number(req.params.id) },
      order: [['changed_at', 'DESC']],
    });
    return res.json({ success: true, items: rows });
  } catch (error) {
    logger.error('[AdminPlans] plan history failed', { error: error.message, id: req.params.id });
    return res.status(500).json({ success: false, message: 'Failed to load plan history' });
  }
};

const getPlanStatsSummary = async (_req, res) => {
  try {
    const plans = (await DataPlan.findAll()).map(normalizePlan);
    const activePlansBySourceNetwork = {};
    const zeroPricePlans = plans.filter((plan) => toNumber(plan.your_price, 0) <= 0 || !plan.is_active).length;

    for (const plan of plans) {
      const key = `${plan.source}:${plan.network}`;
      activePlansBySourceNetwork[key] = activePlansBySourceNetwork[key] || 0;
      if (plan.is_active) activePlansBySourceNetwork[key] += 1;
    }

    return res.json({
      success: true,
      totalPlans: plans.length,
      activePlans: plans.filter((plan) => plan.is_active).length,
      zeroPricePlans,
      activePlansBySourceNetwork,
    });
  } catch (error) {
    logger.error('[AdminPlans] stats summary failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load summary stats' });
  }
};

const getRecentPriceUpdates = async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await PlanPriceHistory.findAll({
      where: { changed_at: { [Op.gte]: since } },
      include: [{ model: DataPlan, as: 'plan', attributes: ['id', 'name', 'provider', 'source'] }],
      order: [['changed_at', 'DESC']],
      limit: 50,
    });
    return res.json({ success: true, items: rows });
  } catch (error) {
    logger.error('[AdminPlans] recent updates failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load recent updates' });
  }
};

const getCheapestPlans = async (_req, res) => {
  try {
    const plans = (await DataPlan.findAll({ where: { is_active: true } })).map(normalizePlan);
    const result = {};
    for (const network of ['mtn', 'airtel', 'glo']) {
      result[network] = plans
        .filter((plan) => plan.network === network && toNumber(plan.your_price, 0) > 0)
        .sort((a, b) => toNumber(a.your_price, 0) - toNumber(b.your_price, 0))
        .slice(0, 10);
    }
    return res.json({ success: true, items: result });
  } catch (error) {
    logger.error('[AdminPlans] cheapest plans failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to load cheapest plans' });
  }
};

const createPlan = async (req, res) => {
  try {
    const payload = {
      source: String(req.body?.source || 'smeplug').toLowerCase(),
      provider: String(req.body?.network || req.body?.provider || '').toLowerCase(),
      category: req.body?.category || 'gifting',
      name: req.body?.name,
      size: req.body?.data_size || req.body?.size,
      size_mb: Number.parseInt(String(req.body?.size_mb || '0'), 10) || 0,
      validity: req.body?.validity,
      data_size: req.body?.data_size || req.body?.size || null,
      plan_id: req.body?.plan_id || req.body?.smeplug_plan_id || null,
      original_price: toNumber(req.body?.original_price ?? req.body?.api_cost, 0),
      your_price: toNumber(req.body?.your_price ?? req.body?.admin_price, 0),
      wallet_price: toNumber(req.body?.wallet_price ?? req.body?.api_cost, 0),
      admin_price: toNumber(req.body?.your_price ?? req.body?.admin_price, 0),
      api_cost: toNumber(req.body?.wallet_price ?? req.body?.api_cost ?? req.body?.original_price, 0),
      available_sim: toBoolean(req.body?.available_sim, true),
      available_wallet: toBoolean(req.body?.available_wallet, true),
      is_active: toBoolean(req.body?.is_active, true),
      last_updated_by: getChangedBy(req),
      smeplug_plan_id:
        String(req.body?.source || 'smeplug').toLowerCase() === 'smeplug'
          ? req.body?.plan_id || req.body?.smeplug_plan_id || null
          : null,
      ogdams_sku:
        String(req.body?.source || '').toLowerCase() === 'ogdams'
          ? req.body?.plan_id || req.body?.ogdams_sku || null
          : null,
    };

    const plan = await DataPlan.create(payload);
    return res.status(201).json({ success: true, item: normalizePlan(plan) });
  } catch (error) {
    logger.error('[AdminPlans] create failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to create plan' });
  }
};

module.exports = {
  listPlans,
  getPlanFilters,
  getPlanById,
  updatePlan,
  bulkUpdatePlans,
  togglePlanStatus,
  exportPlansCsv,
  getPriceHistory,
  getPlanHistory,
  getPlanStatsSummary,
  getRecentPriceUpdates,
  getCheapestPlans,
  createPlan,
};
