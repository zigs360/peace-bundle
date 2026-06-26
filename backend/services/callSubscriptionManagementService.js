const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { getCallPlanSchemaCompatibility } = require('./callPlanSchemaCompatibilityService');

const TALKMORE_GIFTING_BUNDLE_CLASS = 'talkmore_gifting';
const TALKMORE_VALIDITY_DAYS = 30;

function toCurrency(value, fallback = null) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : fallback;
}

function toInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeCallPlanPayload(payload = {}) {
  const normalized = {
    ...payload,
    provider: payload.provider ? String(payload.provider).toLowerCase() : undefined,
    status: payload.status ? String(payload.status).toLowerCase() : undefined,
    type: payload.type ? String(payload.type).toLowerCase() : undefined,
    portfolio: payload.portfolio ? String(payload.portfolio).toLowerCase() : undefined,
    bundleClass: payload.bundleClass ? String(payload.bundleClass).toLowerCase() : undefined,
    shortCode: payload.shortCode !== undefined ? String(payload.shortCode).trim() : undefined,
    price: payload.price !== undefined ? toCurrency(payload.price) : undefined,
    customerPrice: payload.customerPrice !== undefined ? toCurrency(payload.customerPrice) : undefined,
    dealerCommission: payload.dealerCommission !== undefined ? toCurrency(payload.dealerCommission) : undefined,
    validityDays: payload.validityDays !== undefined ? toInteger(payload.validityDays) : undefined,
    stockLimit: payload.stockLimit !== undefined && payload.stockLimit !== null && payload.stockLimit !== ''
      ? toInteger(payload.stockLimit)
      : payload.stockLimit === null
        ? null
        : undefined,
    stockRemaining: payload.stockRemaining !== undefined && payload.stockRemaining !== null && payload.stockRemaining !== ''
      ? toInteger(payload.stockRemaining)
      : payload.stockRemaining === null
        ? null
        : undefined,
    internalSequenceNumber:
      payload.internalSequenceNumber !== undefined && payload.internalSequenceNumber !== null && payload.internalSequenceNumber !== ''
        ? toInteger(payload.internalSequenceNumber)
        : undefined,
  };

  if (String(normalized.bundleClass || '').toLowerCase() === TALKMORE_GIFTING_BUNDLE_CLASS) {
    normalized.validityDays = normalized.validityDays !== undefined ? normalized.validityDays : TALKMORE_VALIDITY_DAYS;
    normalized.portfolio = 'talkmore';
    normalized.type = normalized.type || 'voice';
  }

  if (normalized.shortCode && !normalized.api_plan_id) {
    normalized.api_plan_id = normalized.shortCode;
  }

  return normalized;
}

async function validateCallPlanBusinessRules(CallPlan, payload, { currentPlan = null, transaction } = {}) {
  const errors = [];
  const bundleClass = String(payload.bundleClass ?? currentPlan?.bundleClass ?? '').toLowerCase();
  const customerPrice = toCurrency(payload.customerPrice ?? payload.price ?? currentPlan?.customerPrice ?? currentPlan?.price);
  const dealerCommission = toCurrency(payload.dealerCommission ?? currentPlan?.dealerCommission ?? 0, 0);
  const validityDays = toInteger(payload.validityDays ?? currentPlan?.validityDays);
  const shortCode = payload.shortCode !== undefined ? String(payload.shortCode || '').trim() : String(currentPlan?.shortCode || '').trim();

  if (!payload.name && !currentPlan?.name) {
    errors.push('Plan name is required');
  }
  if (!payload.provider && !currentPlan?.provider) {
    errors.push('Provider is required');
  }
  if (!Number.isFinite(customerPrice) || customerPrice <= 0) {
    errors.push('Customer price must be greater than zero');
  }
  if (!Number.isFinite(dealerCommission) || dealerCommission < 0) {
    errors.push('Dealer commission cannot be negative');
  }
  if (Number.isFinite(customerPrice) && Number.isFinite(dealerCommission) && dealerCommission > customerPrice * 0.05) {
    errors.push('Dealer commission cannot exceed 5% of customer price');
  }
  if (shortCode) {
    const where = { shortCode };
    if (currentPlan?.id) {
      where.id = { [Op.ne]: currentPlan.id };
    }
    const duplicate = await CallPlan.findOne({ where, transaction });
    if (duplicate) {
      errors.push('Short code already exists');
    }
  }

  return errors;
}

function calculateProratedCommission({
  customerPrice,
  dealerCommission,
  activatedAt = new Date(),
  cycleDays,
} = {}) {
  const charge = toCurrency(customerPrice, 0);
  const commission = toCurrency(dealerCommission, 0);
  const activationDate = activatedAt instanceof Date ? activatedAt : new Date(activatedAt);
  const daysInCycle = toInteger(cycleDays, activationDate && !Number.isNaN(activationDate.getTime())
    ? new Date(Date.UTC(activationDate.getUTCFullYear(), activationDate.getUTCMonth() + 1, 0)).getUTCDate()
    : 30);

  if (!(activationDate instanceof Date) || Number.isNaN(activationDate.getTime())) {
    throw new Error('Invalid activation date');
  }

  const activationDay = activationDate.getUTCDate();
  const remainingDays = Math.max(1, daysInCycle - activationDay + 1);
  const prorated = Number(((commission * remainingDays) / daysInCycle).toFixed(2));

  return {
    customerPrice: charge,
    dealerCommission: commission,
    activationDate: activationDate.toISOString(),
    cycleDays: daysInCycle,
    remainingDays,
    prorationFactor: Number((remainingDays / daysInCycle).toFixed(4)),
    proratedCommission: prorated,
  };
}

async function decrementPlanStock(CallPlan, { planId, transaction }) {
  const compatibility = await getCallPlanSchemaCompatibility();
  if (!compatibility.managedColumnsAvailable) {
    const error = new Error('Call subscription stock management requires the pending database migration');
    error.statusCode = 503;
    error.code = 'CALLPLAN_MIGRATION_REQUIRED';
    error.missingColumns = compatibility.missingManagedColumns || [];
    throw error;
  }

  const plan = await CallPlan.findByPk(planId, { transaction });

  if (!plan) {
    const error = new Error('Selected bundle no longer exists');
    error.statusCode = 404;
    throw error;
  }

  if (plan.stockLimit === null || plan.stockLimit === undefined) {
    return plan;
  }

  const tableName = typeof CallPlan.getTableName === 'function' ? CallPlan.getTableName() : 'CallPlans';
  const queryGenerator = sequelize.getQueryInterface().queryGenerator;
  const quotedTable = queryGenerator.quoteTable(tableName);
  const [rows] = await sequelize.query(
    `UPDATE ${quotedTable}
     SET "stock_remaining" = "stock_remaining" - 1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = :planId AND "stock_remaining" > 0
     RETURNING *;`,
    {
      replacements: { planId },
      transaction,
    },
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error('Bundle is out of stock');
    error.statusCode = 409;
    throw error;
  }

  await plan.reload({ transaction });
  return plan;
}

module.exports = {
  TALKMORE_GIFTING_BUNDLE_CLASS,
  TALKMORE_VALIDITY_DAYS,
  calculateProratedCommission,
  decrementPlanStock,
  normalizeCallPlanPayload,
  validateCallPlanBusinessRules,
};
