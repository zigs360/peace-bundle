const logger = require('../utils/logger');
const transactionIntegrityService = require('../services/transactionIntegrityService');

let isRunning = false;

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const s = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
};

const parseIntSafe = (value, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const runTransactionIntegrityPassOnce = async () => {
  if (isRunning) return null;
  isRunning = true;
  try {
    const limit = parseIntSafe(process.env.TRANSACTION_INTEGRITY_MONITOR_LIMIT, 200);
    const summary = await transactionIntegrityService.monitorAndRepair({ limit });
    logger.info('[TransactionIntegrityJob] pass complete', summary);
    return summary;
  } catch (error) {
    logger.error('[TransactionIntegrityJob] pass failed', { error: error.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startTransactionIntegrityJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.TRANSACTION_INTEGRITY_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[TransactionIntegrityJob] Disabled via TRANSACTION_INTEGRITY_JOB_ENABLED');
    return null;
  }

  const intervalMs = parseIntSafe(process.env.TRANSACTION_INTEGRITY_INTERVAL_MS, 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.TRANSACTION_INTEGRITY_STARTUP_DELAY_MS, 15000);

  setTimeout(() => {
    void runTransactionIntegrityPassOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runTransactionIntegrityPassOnce();
  }, intervalMs);
  timer.unref?.();

  logger.info('[TransactionIntegrityJob] Started', { intervalMs, startupDelayMs });
  return timer;
};

module.exports = { startTransactionIntegrityJob, runTransactionIntegrityPassOnce };
