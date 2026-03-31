const crypto = require('crypto');
const sequelize = require('../config/database');
const User = require('../models/User');
const logger = require('../utils/logger');
const payvesselService = require('./payvesselService');
const billstackVirtualAccountService = require('./billstackVirtualAccountService');

const maskAccountNumber = (accountNumber) => {
  const raw = String(accountNumber || '').trim();
  if (!raw) return null;
  const visible = 4;
  if (raw.length <= visible) return raw;
  return `${'*'.repeat(raw.length - visible)}${raw.slice(-visible)}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withTimeout = async (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const isTransientError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout')) return true;
  if (msg.includes('network')) return true;
  const status = err.status || err.httpStatus || err.response?.status;
  if (!status) return true;
  return status >= 500;
};

const retryWithBackoff = async (fn, { retries = 2, baseDelayMs = 400, maxDelayMs = 2500 } = {}) => {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      const transient = isTransientError(err);
      if (!transient || attempt >= retries) throw err;
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 120);
      await sleep(exp + jitter);
      attempt += 1;
    }
  }
};

const nowIso = () => new Date().toISOString();

const randomId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

const getMetaBuckets = (metadata) => {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const dual = meta.dual_virtual_accounts && typeof meta.dual_virtual_accounts === 'object' ? meta.dual_virtual_accounts : {};
  const accounts = dual.accounts && typeof dual.accounts === 'object' ? dual.accounts : {};
  const pending = dual.pending && typeof dual.pending === 'object' ? dual.pending : {};
  return { meta, dual, accounts, pending };
};

const buildProviderResponse = (provider, record) => {
  if (record?.status === 'pending') {
    return { provider, status: 'pending', requestId: record.requestId || null, startedAt: record.startedAt || null };
  }
  if (record?.status === 'error') {
    return { provider, status: 'error', error: record.error || { type: 'unknown', message: 'Unknown error' } };
  }
  if (record?.accountNumber) {
    return {
      provider,
      status: 'ok',
      account: {
        bankName: record.bankName || null,
        accountName: record.accountName || null,
        accountNumberMasked: maskAccountNumber(record.accountNumber),
        last4: String(record.accountNumber).slice(-4),
      },
      reference: record.reference || null,
    };
  }
  return { provider, status: 'error', error: { type: 'invalid_state', message: 'No account data available' } };
};

class DualVirtualAccountService {
  async getDualVirtualAccountsSnapshot(userId) {
    const operationId = randomId();
    const providers = ['billstack', 'payvessel'];

    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    const { accounts, pending } = getMetaBuckets(user.metadata);
    const results = {};

    for (const provider of providers) {
      const existing = accounts[provider];
      if (existing && existing.accountNumber) {
        results[provider] = buildProviderResponse(provider, existing);
        continue;
      }
      const p = pending[provider];
      if (p && p.status === 'pending') {
        results[provider] = buildProviderResponse(provider, { status: 'pending', requestId: p.requestId, startedAt: p.startedAt });
        continue;
      }
      if (p && p.status === 'error') {
        results[provider] = buildProviderResponse(provider, { status: 'error', error: p.error });
        continue;
      }
      results[provider] = buildProviderResponse(provider, { status: 'error', error: { type: 'not_available', message: 'No account data available' } });
    }

    const okCount = Object.values(results).filter((r) => r.status === 'ok').length;
    const overallStatus = okCount === 2 ? 'ok' : okCount === 1 ? 'partial' : 'failed';

    logger.info('[AUDIT] Dual VA snapshot viewed', { operationId, userId, overallStatus });
    return { success: overallStatus !== 'failed', overallStatus, operationId, results };
  }

  async ensureDualVirtualAccounts(userId, { timeoutMs = 10000, retry = undefined } = {}) {
    const operationId = randomId();
    logger.info('[AUDIT] Dual VA operation started', { operationId, userId });

    const providers = ['billstack', 'payvessel'];
    const toCall = [];
    const pendingTtlMs = 10 * 60 * 1000;

    await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User not found');

      const { meta, dual, accounts, pending } = getMetaBuckets(user.metadata);
      const nextPending = { ...pending };
      const now = nowIso();
      const nowTs = Date.now();

      for (const provider of providers) {
        const existing = accounts[provider];
        if (existing && existing.accountNumber) continue;

        const p = pending[provider];
        if (p && p.startedAt) {
          const ageMs = nowTs - new Date(p.startedAt).getTime();
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < pendingTtlMs) {
            nextPending[provider] = p;
            continue;
          }
        }

        const requestId = randomId();
        nextPending[provider] = { status: 'pending', requestId, startedAt: now };
        toCall.push({ provider, requestId });
      }

      user.metadata = {
        ...meta,
        dual_virtual_accounts: {
          ...dual,
          accounts,
          pending: nextPending,
          last_operation_id: operationId,
          last_started_at: now,
        },
      };
      await user.save({ transaction: t });
    });

    const results = {};

    const runProvider = async (provider, requestId) => {
      const startedAt = Date.now();
      try {
        const detail = await retryWithBackoff(async () => {
          if (provider === 'billstack') {
            return await withTimeout(billstackVirtualAccountService.generateVirtualAccountForUserId(userId, { timeoutMs }), timeoutMs);
          }
          return await withTimeout(payvesselService.createVirtualAccountForUserId(userId, { timeoutMs }), timeoutMs);
        }, retry || undefined);

        const durationMs = Date.now() - startedAt;

        logger.info('[AUDIT] Dual VA provider success', { operationId, userId, provider, requestId, durationMs });
        return { provider, requestId, status: 'ok', detail, durationMs };
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        const type = String(err.message || '').toLowerCase().includes('timeout') ? 'timeout' : isTransientError(err) ? 'transient' : 'provider';
        const message = type === 'timeout' ? 'Provider request timed out' : err.message || 'Provider request failed';

        logger.warn('[AUDIT] Dual VA provider failed', { operationId, userId, provider, requestId, durationMs, type });
        return { provider, requestId, status: 'error', error: { type, message }, durationMs };
      }
    };

    const settled = await Promise.allSettled(toCall.map((x) => runProvider(x.provider, x.requestId)));

    const outcomesByProvider = new Map();
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value) continue;
      outcomesByProvider.set(s.value.provider, s.value);
    }

    await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User not found');

      const { meta, dual, accounts, pending } = getMetaBuckets(user.metadata);
      const nextAccounts = { ...accounts };
      const nextPending = { ...pending };

      for (const provider of providers) {
        const outcome = outcomesByProvider.get(provider);
        if (!outcome) continue;

        if (outcome.status === 'ok') {
          nextAccounts[provider] = {
            accountNumber: outcome.detail.accountNumber,
            bankName: outcome.detail.bankName,
            accountName: outcome.detail.accountName,
            reference: outcome.detail.trackingReference || outcome.detail.reference || null,
            createdAt: nowIso(),
          };
          delete nextPending[provider];
          continue;
        }

        nextPending[provider] = {
          status: 'error',
          requestId: outcome.requestId,
          startedAt: nextPending[provider]?.startedAt || nowIso(),
          error: outcome.error,
          updatedAt: nowIso(),
        };
      }

      user.metadata = {
        ...meta,
        dual_virtual_accounts: {
          ...dual,
          accounts: nextAccounts,
          pending: nextPending,
          last_completed_at: nowIso(),
        },
      };
      await user.save({ transaction: t });
    });

    const finalUser = await User.findByPk(userId);
    const { accounts, pending } = getMetaBuckets(finalUser?.metadata);

    for (const provider of providers) {
      const existing = accounts[provider];
      if (existing && existing.accountNumber) {
        results[provider] = buildProviderResponse(provider, existing);
        continue;
      }
      const p = pending[provider];
      if (p && p.status === 'pending') {
        results[provider] = buildProviderResponse(provider, { status: 'pending', requestId: p.requestId, startedAt: p.startedAt });
        continue;
      }
      if (p && p.status === 'error') {
        results[provider] = buildProviderResponse(provider, { status: 'error', error: p.error });
        continue;
      }
      results[provider] = buildProviderResponse(provider, { status: 'error', error: { type: 'not_available', message: 'No account data available' } });
    }

    const okCount = Object.values(results).filter((r) => r.status === 'ok').length;
    const overallStatus = okCount === 2 ? 'ok' : okCount === 1 ? 'partial' : 'failed';

    logger.info('[AUDIT] Dual VA operation finished', { operationId, userId, overallStatus });

    return {
      success: overallStatus !== 'failed',
      overallStatus,
      operationId,
      results,
    };
  }
}

module.exports = new DualVirtualAccountService();
