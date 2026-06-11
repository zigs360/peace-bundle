const axios = require('axios');
const { User } = require('../models');
const logger = require('../utils/logger');

class OgdamsFailoverService {
  getStore() {
    const key = '__peacebundle_ogdams_failover_state';
    if (!globalThis[key]) {
      globalThis[key] = {
        status: 'healthy',
        activeReason: null,
        openUntil: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        lastHealthCheckAt: null,
        lastHealthCheckOk: null,
        lastHealthCheckStatus: null,
        lastFailureMeta: null,
        lastAlertAt: 0,
        lastRecoveryAlertAt: 0,
        monitorStarted: false,
      };
    }
    return globalThis[key];
  }

  getConfig() {
    const parseMs = (value, fallback) => {
      const parsed = Number.parseInt(String(value || fallback), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
      enabled: String(process.env.AIRTIME_OGDAMS_FALLBACK_TO_SMEPLUG || 'true').toLowerCase() !== 'false',
      healthUrl: String(process.env.OGDAMS_HEALTH_URL || '').trim(),
      healthTimeoutMs: parseMs(process.env.OGDAMS_HEALTH_TIMEOUT_MS, 2500),
      monitorIntervalMs: parseMs(process.env.OGDAMS_HEALTH_MONITOR_INTERVAL_MS, 30000),
      unavailableOpenMs: parseMs(process.env.OGDAMS_FAILOVER_OPEN_MS, 5 * 60 * 1000),
      insufficientBalanceOpenMs: parseMs(process.env.OGDAMS_BALANCE_FAILOVER_OPEN_MS, 10 * 60 * 1000),
      alertCooldownMs: parseMs(process.env.OGDAMS_FAILOVER_ALERT_COOLDOWN_MS, 10 * 60 * 1000),
    };
  }

  async notifyAdmins({ key, title, message, metadata = {}, priority = 'high', cooldownMs }) {
    try {
      const state = this.getStore();
      const now = Date.now();
      if (cooldownMs && now - Number(state[key] || 0) < cooldownMs) {
        return { ok: true, suppressed: true };
      }

      const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
      const adminIds = admins.map((admin) => admin.id).filter(Boolean);
      if (!adminIds.length) return { ok: true, suppressed: true, reason: 'no_admins' };

      const notificationRealtimeService = require('./notificationRealtimeService');
      await notificationRealtimeService.sendBulk(adminIds, {
        title,
        message,
        type: 'warning',
        priority,
        link: '/admin/transactions',
        metadata,
      });

      state[key] = now;
      return { ok: true, alerted: true };
    } catch (error) {
      logger.error('[Airtime] Failed to notify admins about Ogdams failover', {
        error: error.message,
        title,
      });
      return { ok: false, error: error.message };
    }
  }

  async probeHealth() {
    const state = this.getStore();
    const { enabled, healthUrl, healthTimeoutMs } = this.getConfig();
    if (!enabled || !healthUrl) {
      return this.getSnapshot();
    }

    try {
      const res = await axios.get(healthUrl, {
        timeout: healthTimeoutMs,
        validateStatus: () => true,
      });
      const ok = res.status >= 200 && res.status < 500;
      state.lastHealthCheckAt = new Date().toISOString();
      state.lastHealthCheckOk = ok;
      state.lastHealthCheckStatus = res.status;

      if (ok && state.openUntil && Date.now() < state.openUntil && state.activeReason === 'unavailable') {
        await this.markHealthy({ source: 'health_probe', status: res.status });
      }
      if (!ok) {
        await this.markFailure('unavailable', { source: 'health_probe', status: res.status, message: 'health probe failed' });
      }
      return this.getSnapshot();
    } catch (error) {
      state.lastHealthCheckAt = new Date().toISOString();
      state.lastHealthCheckOk = false;
      state.lastHealthCheckStatus = null;
      await this.markFailure('unavailable', { source: 'health_probe', message: error.message });
      return this.getSnapshot();
    }
  }

  ensureMonitor() {
    const state = this.getStore();
    const { enabled, healthUrl, monitorIntervalMs } = this.getConfig();
    if (!enabled || !healthUrl || state.monitorStarted) return;
    state.monitorStarted = true;
    const timer = setInterval(() => {
      this.probeHealth().catch((error) => {
        logger.error('[Airtime] Ogdams health probe failed', { error: error.message });
      });
    }, monitorIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async markFailure(reason, meta = {}) {
    const state = this.getStore();
    const { enabled, unavailableOpenMs, insufficientBalanceOpenMs, alertCooldownMs } = this.getConfig();
    if (!enabled) return this.getSnapshot();

    const now = Date.now();
    const durationMs = reason === 'insufficient_balance' ? insufficientBalanceOpenMs : unavailableOpenMs;
    const nextOpenUntil = now + durationMs;
    const wasActive = state.openUntil > now;

    state.status = 'failedover';
    state.activeReason = reason;
    state.openUntil = Math.max(Number(state.openUntil || 0), nextOpenUntil);
    state.lastFailureAt = new Date(now).toISOString();
    state.lastFailureMeta = {
      ...(state.lastFailureMeta && typeof state.lastFailureMeta === 'object' ? state.lastFailureMeta : {}),
      ...meta,
      reason,
    };

    logger.warn('[Airtime] Ogdams failover opened', {
      reason,
      openUntil: new Date(state.openUntil).toISOString(),
      meta: state.lastFailureMeta,
    });

    await this.notifyAdmins({
      key: 'lastAlertAt',
      title: 'Ogdams failover active',
      message:
        reason === 'insufficient_balance'
          ? 'Ogdams airtime balance is insufficient. Airtime requests are switching to SMEPlug until recovery.'
          : 'Ogdams airtime service is unavailable. Airtime requests are switching to SMEPlug until recovery.',
      metadata: {
        provider: 'ogdams',
        reason,
        failoverActive: true,
        openUntil: new Date(state.openUntil).toISOString(),
        ...meta,
      },
      cooldownMs: alertCooldownMs,
    });

    if (!wasActive && reason === 'unavailable') {
      this.ensureMonitor();
    }

    return this.getSnapshot();
  }

  async markHealthy(meta = {}) {
    const state = this.getStore();
    const wasActive = this.isActive();
    state.status = 'healthy';
    state.activeReason = null;
    state.openUntil = 0;
    state.lastSuccessAt = new Date().toISOString();
    state.lastFailureMeta = meta && Object.keys(meta).length ? meta : state.lastFailureMeta;

    if (wasActive) {
      logger.info('[Airtime] Ogdams failover cleared', { meta });
      await this.notifyAdmins({
        key: 'lastRecoveryAlertAt',
        title: 'Ogdams failover cleared',
        message: 'Ogdams airtime routing has recovered. New purchases can use Ogdams again.',
        metadata: {
          provider: 'ogdams',
          recovered: true,
          ...meta,
        },
        priority: 'medium',
        cooldownMs: this.getConfig().alertCooldownMs,
      });
    }

    return this.getSnapshot();
  }

  isActive() {
    const state = this.getStore();
    return Number(state.openUntil || 0) > Date.now();
  }

  getSnapshot() {
    const state = this.getStore();
    this.ensureMonitor();
    return {
      active: this.isActive(),
      status: state.status,
      reason: state.activeReason,
      openUntil: state.openUntil ? new Date(state.openUntil).toISOString() : null,
      lastFailureAt: state.lastFailureAt,
      lastSuccessAt: state.lastSuccessAt,
      lastHealthCheckAt: state.lastHealthCheckAt,
      lastHealthCheckOk: state.lastHealthCheckOk,
      lastHealthCheckStatus: state.lastHealthCheckStatus,
      lastFailureMeta: state.lastFailureMeta,
    };
  }
}

module.exports = new OgdamsFailoverService();
