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

    const since = new Date(Date.now() - windowMs);
    const count = await WebhookEvent.count({
      where: {
        provider: 'billstack',
        status: { [Op.in]: ['failed', 'rejected'] },
        createdAt: { [Op.gte]: since },
      },
    });

    if (count < threshold) return { count };
    if (Date.now() - lastAlertAt < cooldownMs) return { count, suppressed: true };

    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    const adminIds = admins.map((a) => a.id);
    if (!adminIds.length) return { count, adminIds: 0 };

    await notificationRealtimeService.sendBulk(adminIds, {
      title: 'BillStack webhook failures',
      message: `${count} BillStack webhook failures in the last ${Math.round(windowMs / 60000)} minutes`,
      type: 'warning',
      priority: 'high',
      metadata: { provider: 'billstack', count, since: since.toISOString() },
    });

    lastAlertAt = Date.now();
    logger.warn('[WebhookAlertJob] Alert sent', { provider: 'billstack', count });
    return { count, alerted: true };
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

