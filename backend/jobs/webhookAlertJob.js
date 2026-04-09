const { Op } = require('sequelize');
const logger = require('../utils/logger');
const User = require('../models/User');
const WebhookEvent = require('../models/WebhookEvent');
const notificationRealtimeService = require('../services/notificationRealtimeService');

let isRunning = false;
let lastAlertAt = 0;

const parseIntSafe = (value, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return fallback;
};

const runWebhookAlertOnce = async () => {
  if (isRunning) return null;
  isRunning = true;
  try {
    const windowMs = parseIntSafe(process.env.WEBHOOK_ALERT_WINDOW_MS, 10 * 60 * 1000);
    const threshold = parseIntSafe(process.env.WEBHOOK_ALERT_THRESHOLD, 3);
    const cooldownMs = parseIntSafe(process.env.WEBHOOK_ALERT_COOLDOWN_MS, 10 * 60 * 1000);
    const slowMs = parseIntSafe(process.env.WEBHOOK_ALERT_SLOW_MS, 3000);
    const stuckMs = parseIntSafe(process.env.WEBHOOK_ALERT_STUCK_MS, 5000);

    const since = new Date(Date.now() - windowMs);
    const count = await WebhookEvent.count({
      where: {
        provider: 'billstack',
        status: { [Op.in]: ['failed', 'rejected'] },
        createdAt: { [Op.gte]: since },
      },
    });

    const slow = await WebhookEvent.count({
      where: {
        provider: 'billstack',
        status: 'processed',
        createdAt: { [Op.gte]: since },
        processed_at: { [Op.ne]: null },
        [Op.and]: WebhookEvent.sequelize.where(
          WebhookEvent.sequelize.literal('EXTRACT(EPOCH FROM ("processed_at" - "createdAt")) * 1000'),
          { [Op.gt]: slowMs },
        ),
      },
    });

    const stuck = await WebhookEvent.count({
      where: {
        provider: 'billstack',
        status: { [Op.in]: ['received', 'verified'] },
        createdAt: { [Op.lte]: new Date(Date.now() - stuckMs) },
      },
    });

    if (count < threshold && slow < 1 && stuck < 1) return { count, slow, stuck };
    if (Date.now() - lastAlertAt < cooldownMs) return { count, suppressed: true };

    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    const adminIds = admins.map((a) => a.id);
    if (!adminIds.length) return { count, adminIds: 0 };

    await notificationRealtimeService.sendBulk(adminIds, {
      title: 'BillStack webhook alert',
      message: `${count} failed/rejected, ${slow} slow(>${Math.round(slowMs / 1000)}s), ${stuck} stuck(>${Math.round(stuckMs / 1000)}s) in last ${Math.round(windowMs / 60000)} minutes`,
      type: 'warning',
      priority: 'high',
      metadata: { provider: 'billstack', count, slow, stuck, since: since.toISOString() },
    });

    lastAlertAt = Date.now();
    logger.warn('[WebhookAlertJob] Alert sent', { provider: 'billstack', count, slow, stuck });
    return { count, slow, stuck, alerted: true };
  } catch (e) {
    logger.error('[WebhookAlertJob] run failed', { error: e.message });
    return null;
  } finally {
    isRunning = false;
  }
};

const startWebhookAlertJob = () => {
  if (process.env.NODE_ENV === 'test') return null;

  const enabled = parseBoolean(process.env.WEBHOOK_ALERT_JOB_ENABLED, true);
  if (!enabled) return null;

  const intervalMs = parseIntSafe(process.env.WEBHOOK_ALERT_INTERVAL_MS, 60 * 1000);
  const timer = setInterval(() => {
    void runWebhookAlertOnce();
  }, intervalMs);
  timer.unref?.();
  void runWebhookAlertOnce();
  return timer;
};

module.exports = { startWebhookAlertJob, runWebhookAlertOnce };
