const logger = require('../utils/logger');
const virtualAccountService = require('../services/virtualAccountService');

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

const runVirtualAccountProvisioningOnce = async () => {
  if (isRunning) return null;
  isRunning = true;
  try {
    const batchSize = parseIntSafe(process.env.VA_PROVISIONING_BATCH_SIZE, 25);
    const maxUsers = parseIntSafe(process.env.VA_PROVISIONING_MAX_USERS, batchSize);
    const notify = parseBoolean(process.env.VA_PROVISIONING_NOTIFY, false);
    const includeInactive = parseBoolean(process.env.VA_PROVISIONING_INCLUDE_INACTIVE, false);

    const summary = await virtualAccountService.bulkAssignMissingVirtualAccounts({
      batchSize,
      maxUsers,
      notify,
      includeInactive,
      dryRun: false,
    });

    logger.info('[VirtualAccountJob] Provisioning pass complete', summary);
    return summary;
  } catch (e) {
    logger.error('[VirtualAccountJob] Provisioning pass failed', { error: e.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startVirtualAccountProvisioningJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.VA_PROVISIONING_JOB_ENABLED, true);
  if (!enabled) {
    logger.info('[VirtualAccountJob] Disabled via VA_PROVISIONING_JOB_ENABLED');
    return null;
  }

  const intervalMs = parseIntSafe(process.env.VA_PROVISIONING_INTERVAL_MS, 10 * 60 * 1000);
  const startupDelayMs = parseIntSafe(process.env.VA_PROVISIONING_STARTUP_DELAY_MS, 30 * 1000);

  setTimeout(() => {
    void runVirtualAccountProvisioningOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    void runVirtualAccountProvisioningOnce();
  }, intervalMs);

  timer.unref?.();
  logger.info('[VirtualAccountJob] Started', { intervalMs, startupDelayMs });
  return timer;
};

module.exports = { startVirtualAccountProvisioningJob, runVirtualAccountProvisioningOnce };

