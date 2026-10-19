const logger = require('../utils/logger');
const virtualAccountReconciliationService = require('../services/virtualAccountReconciliationService');

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

const runVirtualAccountFundingReconciliationOnce = async () => {
  if (isRunning) {
    logger.debug('[VAFundingReconcileJob] Prior reconciliation run still active, skipping cycle');
    return null;
  }
  isRunning = true;
  try {
    const limit = parseIntSafe(process.env.VIRTUAL_ACCOUNT_RECONCILE_LIMIT, 100);
    const hours = parseIntSafe(process.env.VIRTUAL_ACCOUNT_RECONCILE_HOURS, 72);

    const result = await virtualAccountReconciliationService.reconcileUncreditedEvents({
      limit,
      hours,
      provider: 'all'
    });

    if (result && result.creditedCount > 0) {
      logger.info(`[VAFundingReconcileJob] Auto-healed and credited ${result.creditedCount} deposit(s)`, {
        creditedCount: result.creditedCount,
        scanned: result.scanned
      });
    } else {
      logger.debug('[VAFundingReconcileJob] Cycle complete: no uncredited deposits found', {
        scanned: result?.scanned || 0
      });
    }

    return result;
  } catch (error) {
    logger.error('[VAFundingReconcileJob] Cycle failed:', { error: error.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startVirtualAccountFundingReconcileJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.VIRTUAL_ACCOUNT_RECONCILE_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[VAFundingReconcileJob] Disabled via VIRTUAL_ACCOUNT_RECONCILE_JOB_ENABLED');
    return null;
  }

  // Run every 2 minutes by default
  const intervalMs = parseIntSafe(process.env.VIRTUAL_ACCOUNT_RECONCILE_INTERVAL_MS, 2 * 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.VIRTUAL_ACCOUNT_RECONCILE_STARTUP_DELAY_MS, 20 * 1000);

  setTimeout(() => {
    void runVirtualAccountFundingReconciliationOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runVirtualAccountFundingReconciliationOnce();
  }, intervalMs);
  timer.unref?.();

  logger.info('[VAFundingReconcileJob] Started automatic virtual account deposit self-healing job', { 
    intervalMs, 
    startupDelayMs 
  });
  return timer;
};

module.exports = { 
  startVirtualAccountFundingReconcileJob, 
  runVirtualAccountFundingReconciliationOnce 
};
