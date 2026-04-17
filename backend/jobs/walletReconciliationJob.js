const logger = require('../utils/logger');
const walletReconciliationService = require('../services/walletReconciliationService');

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

const runWalletReconciliationOnce = async () => {
  if (isRunning) return null;
  isRunning = true;
  try {
    const limit = parseIntSafe(process.env.WALLET_RECONCILIATION_LIMIT, 1000);
    const result = await walletReconciliationService.runReconciliation({
      includeTransactions: false,
      persist: true,
      alertOnDiscrepancy: true,
      limit,
    });
    logger.info('[WalletReconciliationJob] pass complete', result.summary);
    return result;
  } catch (error) {
    logger.error('[WalletReconciliationJob] pass failed', { error: error.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startWalletReconciliationJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.WALLET_RECONCILIATION_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[WalletReconciliationJob] Disabled via WALLET_RECONCILIATION_JOB_ENABLED');
    return null;
  }

  const intervalMs = parseIntSafe(process.env.WALLET_RECONCILIATION_INTERVAL_MS, 24 * 60 * 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.WALLET_RECONCILIATION_STARTUP_DELAY_MS, 45 * 1000);

  setTimeout(() => {
    void runWalletReconciliationOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runWalletReconciliationOnce();
  }, intervalMs);
  timer.unref?.();

  logger.info('[WalletReconciliationJob] Started', { intervalMs, startupDelayMs });
  return timer;
};

module.exports = { startWalletReconciliationJob, runWalletReconciliationOnce };
