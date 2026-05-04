const sequelize = require('../config/database');

const TRANSACTION_INTEGRITY_COLUMNS = [
  'payment_channel',
  'fulfillment_route',
  'route_lock_key',
  'delivery_status',
  'integrity_status',
  'refund_reference',
  'anomaly_flag',
];

const BASE_TRANSACTION_ATTRIBUTES = [
  'id',
  'type',
  'amount',
  'balance_before',
  'balance_after',
  'source',
  'provider',
  'recipient_phone',
  'reference',
  'description',
  'metadata',
  'status',
  'smeplug_reference',
  'smeplug_response',
  'completed_at',
  'failure_reason',
  'retry_count',
  'userId',
  'walletId',
  'dataPlanId',
  'simId',
  'createdAt',
  'updatedAt',
];

let cache = {
  checkedAt: 0,
  result: null,
};

const CACHE_TTL_MS = Number.parseInt(process.env.TRANSACTION_SCHEMA_CACHE_TTL_MS || '30000', 10);

async function getTransactionSchemaCompatibility({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.result && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.result;
  }

  const fallback = {
    checked: false,
    integrityColumnsAvailable: true,
    missingIntegrityColumns: [],
    readableAttributes: undefined,
  };

  if (!sequelize?.getDialect || sequelize.getDialect() !== 'postgres') {
    cache = { checkedAt: now, result: fallback };
    return fallback;
  }

  try {
    const desc = await sequelize.getQueryInterface().describeTable('transactions');
    const missingIntegrityColumns = TRANSACTION_INTEGRITY_COLUMNS.filter(
      (columnName) => !Object.prototype.hasOwnProperty.call(desc || {}, columnName),
    );
    const result = {
      checked: true,
      integrityColumnsAvailable: missingIntegrityColumns.length === 0,
      missingIntegrityColumns,
      readableAttributes: missingIntegrityColumns.length ? BASE_TRANSACTION_ATTRIBUTES : undefined,
    };
    cache = { checkedAt: now, result };
    return result;
  } catch (error) {
    const result = {
      checked: true,
      integrityColumnsAvailable: true,
      missingIntegrityColumns: [],
      readableAttributes: undefined,
      error: {
        name: error.name || 'Error',
        message: error.message || String(error),
      },
    };
    cache = { checkedAt: now, result };
    return result;
  }
}

async function getReadableTransactionAttributes() {
  const compatibility = await getTransactionSchemaCompatibility();
  return compatibility.readableAttributes;
}

module.exports = {
  TRANSACTION_INTEGRITY_COLUMNS,
  BASE_TRANSACTION_ATTRIBUTES,
  getTransactionSchemaCompatibility,
  getReadableTransactionAttributes,
};
