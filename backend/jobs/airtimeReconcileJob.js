const logger = require('../utils/logger');
const Transaction = require('../models/Transaction');
const dataPurchaseService = require('../services/dataPurchaseService');

let isRunning = false;

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 1) return true;
  const s = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
};

const parseIntSafe = (value, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const runAirtimeReconcileOnce = async () => {
  if (isRunning) return null;
  isRunning = true;
  try {
    const batchSize = parseIntSafe(process.env.AIRTIME_RECONCILE_BATCH_SIZE, 50);

    const queued = await Transaction.findAll({
      where: { source: 'airtime_purchase', status: 'queued' },
      order: [['updatedAt', 'ASC']],
      limit: batchSize,
    });

    if (!queued.length) return { processed: 0 };

    let processed = 0;
    for (const txn of queued) {
      const meta = txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {};
      const isOgdamsPending = meta.provider_pending === true && String(meta.service_provider || '').toLowerCase() === 'ogdams';
      if (!isOgdamsPending) continue;

      const attempt = Number.isFinite(meta.reconcile_attempt) ? meta.reconcile_attempt : 1;
      try {
        await dataPurchaseService.reconcileAirtimeTransaction(txn.id, attempt);
        processed += 1;
      } catch (e) {
        logger.error('[AirtimeReconcileJob] reconcile failed', { transactionId: txn.id, reference: txn.reference, error: e.message });
      }
    }

    logger.info('[AirtimeReconcileJob] pass complete', { queued: queued.length, processed });
    return { queued: queued.length, processed };
  } catch (e) {
    logger.error('[AirtimeReconcileJob] pass failed', { error: e.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startAirtimeReconcileJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.AIRTIME_RECONCILE_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[AirtimeReconcileJob] Disabled via AIRTIME_RECONCILE_JOB_ENABLED');
    return null;
  }

  process.env.AIRTIME_RECONCILE_WORKER_ENABLED = 'true';

  const intervalMs = parseIntSafe(process.env.AIRTIME_RECONCILE_INTERVAL_MS, 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.AIRTIME_RECONCILE_STARTUP_DELAY_MS, 20 * 1000);

  setTimeout(() => {
    void runAirtimeReconcileOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runAirtimeReconcileOnce();
  }, intervalMs);

  timer.unref?.();
  logger.info('[AirtimeReconcileJob] Started', { intervalMs, startupDelayMs });
  return timer;
};

module.exports = { startAirtimeReconcileJob, runAirtimeReconcileOnce };

