const logger = require('../utils/logger');
const databaseDiagnosticsService = require('../services/databaseDiagnosticsService');

let intervalHandle = null;

const parseIntervalMs = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const runDatabaseHealthCheckOnce = async () => {
  const diagnostics = await databaseDiagnosticsService.getDiagnostics({ includeSchema: false });
  if (diagnostics.status === 'up') {
    logger.info(
      `[DB Monitor] healthy latency=${diagnostics.latencyMs}ms pool=${JSON.stringify(diagnostics.pool)}`,
    );
    return diagnostics;
  }

  logger.error(
    `[DB Monitor] unhealthy latency=${diagnostics.latencyMs}ms error=${JSON.stringify(
      diagnostics.lastError || diagnostics.metrics?.lastHealthError || null,
    )}`,
  );
  return diagnostics;
};

const startDatabaseHealthMonitorJob = () => {
  if (process.env.NODE_ENV === 'test') return null;
  if (intervalHandle) return intervalHandle;

  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DB_HEALTH_MONITOR_ENABLED || 'true').toLowerCase(),
  );
  if (!enabled) {
    logger.info('[DB Monitor] disabled by configuration');
    return null;
  }

  const intervalMs = parseIntervalMs(process.env.DB_HEALTH_MONITOR_INTERVAL_MS, 60000);
  runDatabaseHealthCheckOnce().catch((error) => {
    logger.error(`[DB Monitor] initial check failed: ${error.message}`);
  });

  intervalHandle = setInterval(() => {
    runDatabaseHealthCheckOnce().catch((error) => {
      logger.error(`[DB Monitor] scheduled check failed: ${error.message}`);
    });
  }, intervalMs);

  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }

  logger.info(`[DB Monitor] started with interval ${intervalMs}ms`);
  return intervalHandle;
};

module.exports = {
  startDatabaseHealthMonitorJob,
  runDatabaseHealthCheckOnce,
};
