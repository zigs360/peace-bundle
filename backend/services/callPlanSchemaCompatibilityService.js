const sequelize = require('../config/database');
const CallPlan = require('../models/CallPlan');

const CALLPLAN_MANAGED_COLUMNS = [
  'customer_price',
  'dealer_commission',
  'short_code',
  'internal_sequence_number',
  'portfolio',
  'bundle_class',
  'service_name',
  'service_slug',
  'category_name',
  'category_slug',
  'subcategory_name',
  'subcategory_slug',
  'stock_limit',
  'stock_remaining',
  'metadata',
];

const BASE_CALLPLAN_ATTRIBUTES = [
  'id',
  'name',
  'provider',
  'price',
  'minutes',
  'validityDays',
  'status',
  'type',
  'api_plan_id',
  'createdAt',
  'updatedAt',
];

let cache = {
  checkedAt: 0,
  result: null,
};

const CACHE_TTL_MS = Number.parseInt(process.env.CALLPLAN_SCHEMA_CACHE_TTL_MS || '30000', 10);

async function getCallPlanSchemaCompatibility({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.result && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.result;
  }

  const fallback = {
    checked: false,
    managedColumnsAvailable: true,
    missingManagedColumns: [],
    readableAttributes: undefined,
  };

  if (!sequelize?.getDialect || sequelize.getDialect() !== 'postgres') {
    cache = { checkedAt: now, result: fallback };
    return fallback;
  }

  try {
    const tableName = typeof CallPlan.getTableName === 'function' ? CallPlan.getTableName() : 'CallPlans';
    const desc = await sequelize.getQueryInterface().describeTable(tableName);
    const missingManagedColumns = CALLPLAN_MANAGED_COLUMNS.filter(
      (columnName) => !Object.prototype.hasOwnProperty.call(desc || {}, columnName),
    );
    const result = {
      checked: true,
      managedColumnsAvailable: missingManagedColumns.length === 0,
      missingManagedColumns,
      readableAttributes: missingManagedColumns.length ? BASE_CALLPLAN_ATTRIBUTES : undefined,
    };
    cache = { checkedAt: now, result };
    return result;
  } catch (error) {
    const result = {
      checked: true,
      managedColumnsAvailable: false,
      missingManagedColumns: [...CALLPLAN_MANAGED_COLUMNS],
      readableAttributes: BASE_CALLPLAN_ATTRIBUTES,
      error: {
        name: error.name || 'Error',
        message: error.message || String(error),
      },
    };
    cache = { checkedAt: now, result };
    return result;
  }
}

async function getReadableCallPlanAttributes() {
  const compatibility = await getCallPlanSchemaCompatibility();
  return compatibility.readableAttributes;
}

module.exports = {
  BASE_CALLPLAN_ATTRIBUTES,
  CALLPLAN_MANAGED_COLUMNS,
  getCallPlanSchemaCompatibility,
  getReadableCallPlanAttributes,
};
