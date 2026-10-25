const logger = require('../utils/logger');
const refundEngine = require('../services/refundEngine');

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

const runRefundReconciliationPassOnce = async () => {
  if (isRunning) {
    logger.debug('[RefundReconcileJob] Prior reconciliation run still active, skipping cycle');
    return null;
  }
  isRunning = true;
  try {
    const limit = parseIntSafe(process.env.REFUND_RECONCILE_LIMIT, 100);
    const lookbackHours = parseIntSafe(process.env.REFUND_RECONCILE_HOURS, 720); // 30 days default

    const result = await refundEngine.scanAndRepairOrphanedRefunds({
      limit,
      lookbackHours,
      autoRepair: true
    });

    if (result && result.repairedCount > 0) {
      logger.info(`[RefundReconcileJob] Auto-healed and credited ${result.repairedCount} orphaned refund(s) worth ₦${result.totalRepairedAmount.toLocaleString()}`, {
        repairedCount: result.repairedCount,
        totalRepairedAmount: result.totalRepairedAmount,
        scanned: result.scanned
      });
    } else {
      logger.debug('[RefundReconcileJob] Cycle complete: all refunds consistent with ledger', {
        scanned: result?.scanned || 0
      });
    }

    return result;
  } catch (error) {
    logger.error('[RefundReconcileJob] Cycle failed:', { error: error.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startRefundReconciliationJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.REFUND_RECONCILE_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[RefundReconcileJob] Disabled via REFUND_RECONCILE_JOB_ENABLED');
    return null;
  }

  // Run every 5 minutes by default
  const intervalMs = parseIntSafe(process.env.REFUND_RECONCILE_INTERVAL_MS, 5 * 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.REFUND_RECONCILE_STARTUP_DELAY_MS, 25 * 1000);

  setTimeout(() => {
    void runRefundReconciliationPassOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runRefundReconciliationPassOnce();
  }, intervalMs);
  timer.unref?.();

  logger.info('[RefundReconcileJob] Started automated refund reconciliation & self-healing daemon', {
    intervalMs,
    startupDelayMs
  });
  return timer;
};

module.exports = {
  startRefundReconciliationJob,
  runRefundReconciliationPassOnce
};
