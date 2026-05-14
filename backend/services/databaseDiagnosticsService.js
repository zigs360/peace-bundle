const { QueryTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../config/database');
const logger = require('../utils/logger');

const DIAGNOSTICS_STATE_KEY = Symbol.for('peacebundle.databaseDiagnosticsState');

const createMetrics = () => ({
  startedAt: new Date().toISOString(),
  lastQueryAt: null,
  lastQueryDurationMs: null,
  lastSlowQueryAt: null,
  lastSlowQuery: null,
  slowQueryCount: 0,
  queryCount: 0,
  queryErrorCount: 0,
  lastQueryError: null,
  lastHealthCheckAt: null,
  lastHealthLatencyMs: null,
  lastHealthError: null,
  healthFailureCount: 0,
});

const getDiagnosticsState = () => {
  if (!sequelize[DIAGNOSTICS_STATE_KEY]) {
    sequelize[DIAGNOSTICS_STATE_KEY] = {
      isInstrumented: false,
      metrics: createMetrics(),
    };
  }

  return sequelize[DIAGNOSTICS_STATE_KEY];
};

const parseDatabaseUrl = () => {
  const runtimeConfig =
    typeof sequelize.getDatabaseRuntimeConfig === 'function'
      ? sequelize.getDatabaseRuntimeConfig()
      : sequelize.__databaseRuntimeConfig || {};
  const rawUrl = process.env.DATABASE_URL || '';

  try {
    const parsed = new URL(rawUrl);
    return {
      dialect: sequelize.getDialect ? sequelize.getDialect() : 'unknown',
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : null,
      username: parsed.username || null,
      ssl: Boolean(runtimeConfig.useSSL),
      maskedUrl: runtimeConfig.databaseUrlMasked || null,
    };
  } catch (error) {
    return {
      dialect: sequelize.getDialect ? sequelize.getDialect() : 'unknown',
      host: null,
      port: null,
      database: null,
      username: null,
      ssl: Boolean(runtimeConfig.useSSL),
      maskedUrl: runtimeConfig.databaseUrlMasked || null,
    };
  }
};

const getPoolSnapshot = () => {
  const pool = sequelize?.connectionManager?.pool;
  if (!pool) {
    return {
      configured: false,
      size: null,
      available: null,
      using: null,
      waiting: null,
      max: sequelize.__databaseRuntimeConfig?.pool?.max ?? null,
      min: sequelize.__databaseRuntimeConfig?.pool?.min ?? null,
    };
  }

  const valueOrNull = (candidate) => (Number.isFinite(candidate) ? candidate : null);
  const borrowCount =
    typeof pool.borrowed === 'number'
      ? pool.borrowed
      : typeof pool.using === 'number'
        ? pool.using
        : typeof pool.pending === 'number'
          ? pool.pending
          : null;

  return {
    configured: true,
    size: valueOrNull(typeof pool.size === 'number' ? pool.size : null),
    available: valueOrNull(typeof pool.available === 'number' ? pool.available : null),
    using: valueOrNull(borrowCount),
    waiting: valueOrNull(typeof pool.pending === 'number' ? pool.pending : null),
    max: sequelize.__databaseRuntimeConfig?.pool?.max ?? null,
    min: sequelize.__databaseRuntimeConfig?.pool?.min ?? null,
  };
};

const summarizeError = (error) => {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.original?.code || error.parent?.code || error.code || null,
  };
};

const instrumentQueries = () => {
  const diagnosticsState = getDiagnosticsState();
  if (diagnosticsState.isInstrumented || typeof sequelize.query !== 'function') return;

  const slowThreshold = sequelize.__databaseRuntimeConfig?.slowQueryThresholdMs ?? 1500;
  const originalQuery = sequelize.query.bind(sequelize);
  const fingerprintSql = (sql) => {
    if (!sql || typeof sql !== 'string') return null;
    const cleaned = sql.trim();
    if (!cleaned) return null;
    const upper = cleaned.toUpperCase();
    const op = upper.split(/\s+/)[0] || 'UNKNOWN';
    let table = null;
    if (op === 'SELECT' || op === 'DELETE') {
      const match = upper.match(/\bFROM\s+("?[\w.]+")/);
      table = match ? match[1] : null;
    } else if (op === 'UPDATE') {
      const match = upper.match(/\bUPDATE\s+("?[\w.]+")/);
      table = match ? match[1] : null;
    } else if (op === 'INSERT') {
      const match = upper.match(/\bINTO\s+("?[\w.]+")/);
      table = match ? match[1] : null;
    }
    const hash = crypto.createHash('sha256').update(cleaned).digest('hex').slice(0, 12);
    return { op, table, hash };
  };

  sequelize.query = async function instrumentedQuery(...args) {
    const { metrics } = getDiagnosticsState();
    const startedAt = Date.now();
    const sqlText = typeof args[0] === 'string' ? args[0] : null;
    try {
      const result = await originalQuery(...args);
      const durationMs = Date.now() - startedAt;
      metrics.queryCount += 1;
      metrics.lastQueryAt = new Date().toISOString();
      metrics.lastQueryDurationMs = durationMs;
      if (durationMs >= slowThreshold) {
        metrics.slowQueryCount += 1;
        metrics.lastSlowQueryAt = metrics.lastQueryAt;
        const fp = fingerprintSql(sqlText);
        metrics.lastSlowQuery = fp ? { durationMs, ...fp } : { durationMs };
        if (fp) {
          logger.warn(`[DB] Slow query detected (${durationMs}ms)`, fp);
        } else {
          logger.warn(`[DB] Slow query detected (${durationMs}ms)`);
        }
      }
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      metrics.queryCount += 1;
      metrics.queryErrorCount += 1;
      metrics.lastQueryAt = new Date().toISOString();
      metrics.lastQueryDurationMs = durationMs;
      metrics.lastQueryError = summarizeError(error);
      throw error;
    }
  };

  diagnosticsState.isInstrumented = true;
};

const runConnectionCheck = async () => {
  const { metrics } = getDiagnosticsState();
  const startedAt = Date.now();
  try {
    await sequelize.query('SELECT 1 AS ok', { type: QueryTypes.SELECT, plain: false });
    const latencyMs = Date.now() - startedAt;
    metrics.lastHealthCheckAt = new Date().toISOString();
    metrics.lastHealthLatencyMs = latencyMs;
    metrics.lastHealthError = null;
    return { ok: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    metrics.lastHealthCheckAt = new Date().toISOString();
    metrics.lastHealthLatencyMs = latencyMs;
    metrics.lastHealthError = summarizeError(error);
    metrics.healthFailureCount += 1;
    return { ok: false, latencyMs, error: summarizeError(error) };
  }
};

const checkSchemaCompatibility = async () => {
  const report = {
    checked: false,
    transactionsTableExists: null,
    missingTransactionColumns: [],
  };

  if (sequelize.getDialect && sequelize.getDialect() !== 'postgres') {
    return report;
  }

  try {
    const desc = await sequelize.getQueryInterface().describeTable('transactions');
    report.checked = true;
    report.transactionsTableExists = true;
    const requiredColumns = [
      'payment_channel',
      'fulfillment_route',
      'route_lock_key',
      'delivery_status',
      'integrity_status',
      'refund_reference',
      'anomaly_flag',
    ];
    report.missingTransactionColumns = requiredColumns.filter(
      (columnName) => !Object.prototype.hasOwnProperty.call(desc || {}, columnName),
    );
  } catch (error) {
    report.checked = true;
    report.transactionsTableExists = false;
    report.error = summarizeError(error);
  }

  return report;
};

const getDiagnostics = async ({ includeSchema = false } = {}) => {
  instrumentQueries();
  const { metrics } = getDiagnosticsState();

  const connection = parseDatabaseUrl();
  const runtimeConfig =
    typeof sequelize.getDatabaseRuntimeConfig === 'function'
      ? sequelize.getDatabaseRuntimeConfig()
      : sequelize.__databaseRuntimeConfig || {};
  const connectivity = await runConnectionCheck();
  const schema = includeSchema ? await checkSchemaCompatibility() : undefined;

  return {
    status: connectivity.ok ? 'up' : 'down',
    checkedAt: new Date().toISOString(),
    latencyMs: connectivity.latencyMs,
    connection,
    runtime: {
      nodeEnv: process.env.NODE_ENV || 'development',
      dbSync: String(process.env.DB_SYNC || (process.env.NODE_ENV === 'production' ? 'none' : 'alter')),
      runtimeSchemaEnsure: String(
        process.env.DB_RUNTIME_SCHEMA_ENSURE || (process.env.NODE_ENV === 'production' ? 'false' : 'true'),
      ),
      connectTimeoutMs: runtimeConfig.connectTimeout ?? null,
      statementTimeoutMs: runtimeConfig.statementTimeout ?? null,
      queryTimeoutMs: runtimeConfig.queryTimeout ?? null,
      slowQueryThresholdMs: runtimeConfig.slowQueryThresholdMs ?? null,
      pool: runtimeConfig.pool || null,
    },
    pool: getPoolSnapshot(),
    metrics: { ...metrics },
    lastError: connectivity.error || metrics.lastQueryError,
    schema,
  };
};

module.exports = {
  instrumentQueries,
  getDiagnostics,
  runConnectionCheck,
};
