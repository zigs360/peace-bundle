const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config({ quiet: true });

const parseIntegerEnv = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const boolFromEnv = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const maskDatabaseUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch (error) {
    return '[invalid-database-url]';
  }
};

let sequelize;
if (globalThis.__peacebundle_sequelize) {
  sequelize = globalThis.__peacebundle_sequelize;
} else {
  let databaseUrl = process.env.DATABASE_URL;
  const useTestPostgres = String(process.env.USE_TEST_POSTGRES || 'false').toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'test' && !useTestPostgres) {
    sequelize = new Sequelize('sqlite::memory:', {
      logging: false,
      dialect: 'sqlite',
    });
  } else {
    // Render internal hostnames (dpg-*) usually do not require SSL
    // Render external URLs (*.render.com) always require SSL
    const isRenderExternal = databaseUrl && databaseUrl.includes('render.com');
    const isRenderInternal = databaseUrl && databaseUrl.includes('dpg-');
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Only use SSL for external Render URLs or non-local production connections that aren't internal
    const useSSL = isRenderExternal || (isProduction && databaseUrl && !databaseUrl.includes('localhost') && !isRenderInternal);
    
    const poolConfig = {
      max: parseIntegerEnv(process.env.DB_POOL_MAX, 5),
      min: parseIntegerEnv(process.env.DB_POOL_MIN, 0),
      acquire: parseIntegerEnv(process.env.DB_POOL_ACQUIRE_MS, 30000),
      idle: parseIntegerEnv(process.env.DB_POOL_IDLE_MS, 10000),
      evict: parseIntegerEnv(process.env.DB_POOL_EVICT_MS, 1000),
    };
    const connectTimeout = parseIntegerEnv(process.env.DB_CONNECT_TIMEOUT_MS, 60000);
    const statementTimeout = parseIntegerEnv(process.env.DB_STATEMENT_TIMEOUT_MS, 0);
    const queryTimeout = parseIntegerEnv(process.env.DB_QUERY_TIMEOUT_MS, 0);
    const slowQueryThresholdMs = parseIntegerEnv(process.env.DB_SLOW_QUERY_MS, 1500);
    const applicationName = process.env.DB_APPLICATION_NAME || 'peace-bundle-backend';
    const enableDbLogging = boolFromEnv(process.env.DB_LOGGING, false);
    const runtimeConfig = {
      databaseUrlMasked: maskDatabaseUrl(databaseUrl || 'postgres://postgres:***@localhost:5432/peacebundle'),
      useSSL,
      connectTimeout,
      statementTimeout,
      queryTimeout,
      slowQueryThresholdMs,
      applicationName,
      pool: poolConfig,
    };

    sequelize = new Sequelize(databaseUrl || 'postgres://postgres:postgres@localhost:5432/peacebundle', {
      dialect: 'postgres',
      logging: enableDbLogging
        ? (sql, timingMs) => {
            if (typeof timingMs === 'number') {
              logger.debug(`[DB SQL ${timingMs}ms] ${sql}`);
            } else {
              logger.debug(`[DB SQL] ${sql}`);
            }
          }
        : false,
      benchmark: enableDbLogging,
      pool: poolConfig,
      dialectOptions: {
        connectTimeout,
        statement_timeout: statementTimeout || undefined,
        query_timeout: queryTimeout || undefined,
        application_name: applicationName,
        ssl: useSSL
          ? {
              require: true,
              rejectUnauthorized: false,
            }
          : false,
      },
    });
    sequelize.__databaseRuntimeConfig = runtimeConfig;
    sequelize.getDatabaseRuntimeConfig = () => ({ ...runtimeConfig, pool: { ...runtimeConfig.pool } });
  }

  globalThis.__peacebundle_sequelize = sequelize;
}

module.exports = sequelize; // Export the instance directly
