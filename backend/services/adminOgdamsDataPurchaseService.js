const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Sim = require('../models/Sim');
const User = require('../models/User');
const DataPlan = require('../models/DataPlan');
const SystemSetting = require('../models/SystemSetting');
const AdminOgdamsDataPurchase = require('../models/AdminOgdamsDataPurchase');
const AdminOgdamsDataPurchaseAudit = require('../models/AdminOgdamsDataPurchaseAudit');
const ogdamsService = require('./ogdamsService');
const ussdParserService = require('./ussdParserService');
const notificationRealtimeService = require('./notificationRealtimeService');
const logger = require('../utils/logger');
const crypto = require('crypto');

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizePhone = (value) => {
  const formatted = ussdParserService.formatPhoneNumber(String(value || ''));
  if (!ussdParserService.validatePhoneNumber(formatted)) return null;
  return formatted;
};

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const last3 = digits.slice(-3);
  return `********${last3}`;
};

const getNetworkIdForProvider = (provider) => {
  const p = String(provider || '').toLowerCase();
  if (p === 'mtn') return 1;
  if (p === 'airtel') return 2;
  if (p === 'glo') return 3;
  if (p === '9mobile') return 4;
  return null;
};

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

class AdminOgdamsDataPurchaseService {
  async getCapsForAdmin(adminUser) {
    const role = String(adminUser?.role || 'admin').toLowerCase();
    const dailyKey = role === 'super_admin' ? 'ogdams_cap_super_admin_daily_ngn' : 'ogdams_cap_admin_daily_ngn';
    const monthlyKey = role === 'super_admin' ? 'ogdams_cap_super_admin_monthly_ngn' : 'ogdams_cap_admin_monthly_ngn';
    const daily = Number(await SystemSetting.get(dailyKey, process.env.OGDAMS_ADMIN_DAILY_CAP_NGN || '500000'));
    const monthly = Number(await SystemSetting.get(monthlyKey, process.env.OGDAMS_ADMIN_MONTHLY_CAP_NGN || '5000000'));
    return {
      daily: Number.isFinite(daily) && daily > 0 ? daily : 500000,
      monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : 5000000,
    };
  }

  async getAdminSpend(adminId, rangeStart) {
    const sum = await AdminOgdamsDataPurchase.sum('costToSim', {
      where: {
        adminId,
        createdAt: { [Op.gte]: rangeStart },
        status: { [Op.in]: ['reserved', 'processing', 'completed'] },
      },
    });
    return Number(sum || 0);
  }

  async listAdminSims(adminUserId, options = {}) {
    const forceBalance = options.forceBalance === true || options.forceBalance === 'true';
    const sims = await Sim.findAll({
      where: {
        userId: adminUserId,
        status: 'active',
      },
      order: [['updatedAt', 'DESC']],
    });

    const out = [];
    for (const s of sims) {
      if (forceBalance) {
        try {
          const simManagementService = require('./simManagementService');
          await simManagementService.checkBalance(s, 1, true);
          await s.reload();
        } catch (e) {
          void e;
        }
      }

      const airtimeBalance = s.airtimeBalance !== null ? Number(s.airtimeBalance) : null;
      const reserved = Number(s.reservedAirtime || 0);
      const available = airtimeBalance !== null && Number.isFinite(airtimeBalance) ? Math.max(0, airtimeBalance - reserved) : null;

      out.push({
        id: s.id,
        provider: s.provider,
        status: s.status,
        connection_status: s.connectionStatus,
        phone: maskPhone(s.phoneNumber),
        iccid_last4: s.iccid ? String(s.iccid).slice(-4) : null,
        airtime_balance: airtimeBalance,
        reserved_airtime: reserved,
        available_airtime: available,
        last_balance_check: s.lastBalanceCheck,
      });
    }

    return out;
  }

  async createPurchase({ adminUser, userId, recipientPhone, dataPlanId, simId, idempotencyKey }) {
    const adminId = adminUser?.id;
    if (!adminId) return { ok: false, reason: 'unauthorized' };

    const phone = normalizePhone(recipientPhone);
    if (!phone) return { ok: false, reason: 'invalid_phone' };

    const [user, plan, sim] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone'] }),
      DataPlan.findByPk(dataPlanId),
      Sim.findByPk(simId),
    ]);

    if (!user) return { ok: false, reason: 'user_not_found' };
    if (!plan || plan.is_active === false) return { ok: false, reason: 'plan_not_found' };
    if (!sim || String(sim.userId) !== String(adminId)) return { ok: false, reason: 'sim_not_found' };
    if (sim.status !== 'active') return { ok: false, reason: 'sim_inactive' };
    if (!plan.ogdams_sku) return { ok: false, reason: 'plan_not_mapped' };

    const provider = String(plan.provider || '').toLowerCase();
    const networkId = getNetworkIdForProvider(provider);
    if (!networkId) return { ok: false, reason: 'invalid_provider' };

    const costToSim = Number(plan.api_cost || 0);
    if (!Number.isFinite(costToSim) || costToSim <= 0) return { ok: false, reason: 'invalid_plan_cost' };

    const caps = await this.getCapsForAdmin(adminUser);
    const [daySpent, monthSpent] = await Promise.all([
      this.getAdminSpend(adminId, startOfDay()),
      this.getAdminSpend(adminId, startOfMonth()),
    ]);

    if (daySpent + costToSim > caps.daily) return { ok: false, reason: 'daily_cap_exceeded', cap: caps.daily };
    if (monthSpent + costToSim > caps.monthly) return { ok: false, reason: 'monthly_cap_exceeded', cap: caps.monthly };

    const idKey = idempotencyKey ? String(idempotencyKey) : null;
    const idHash = idKey ? sha256Hex(idKey) : null;
    const reference = idHash ? `OGD-ADMIN-DATA-${idHash.slice(0, 24).toUpperCase()}` : `OGD-ADMIN-DATA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const existing = await AdminOgdamsDataPurchase.findOne({ where: { reference } });
    if (existing) {
      return { ok: true, purchase: existing };
    }

    const simNumber = normalizePhone(sim.phoneNumber);

    let purchase = null;
    await sequelize.transaction(async (t) => {
      const lockedSim = await Sim.findByPk(sim.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!lockedSim) throw new Error('sim_not_found');

      const airtimeBalance = lockedSim.airtimeBalance !== null ? Number(lockedSim.airtimeBalance) : null;
      if (airtimeBalance === null || !Number.isFinite(airtimeBalance)) {
        const err = new Error('sim_balance_unknown');
        err.code = 'sim_balance_unknown';
        throw err;
      }
      const reserved = Number(lockedSim.reservedAirtime || 0);
      const available = airtimeBalance - reserved;
      if (available < costToSim) {
        const err = new Error('insufficient_sim_balance');
        err.code = 'insufficient_sim_balance';
        throw err;
      }

      lockedSim.reservedAirtime = reserved + costToSim;
      await lockedSim.save({ transaction: t });

      purchase = await AdminOgdamsDataPurchase.create(
        {
          reference,
          adminId,
          userId: user.id,
          simId: sim.id,
          dataPlanId: plan.id,
          recipientPhone: phone,
          provider,
          ogdamsSku: plan.ogdams_sku,
          costToSim,
          status: 'reserved',
          idempotencyKeyHash: idHash,
          metadata: {
            sim_masked: maskPhone(simNumber),
            user_masked: maskPhone(user.phone),
          },
        },
        { transaction: t, returning: true }
      );

      await AdminOgdamsDataPurchaseAudit.create(
        {
          purchaseId: purchase.id,
          adminId,
          userId: user.id,
          simId: sim.id,
          simIccidLast4: sim.iccid ? String(sim.iccid).slice(-4) : null,
          ogdamsSku: plan.ogdams_sku,
          eventType: 'reserved',
          status: 'reserved',
          metadata: { costToSim, dataPlanId: plan.id, reference },
        },
        { transaction: t }
      );
    });

    try {
      const providerResponse = await ogdamsService.purchaseData({
        networkId,
        planCode: String(plan.ogdams_sku),
        phoneNumber: phone,
        reference,
        ...(simNumber ? { sim_number: simNumber } : {}),
      });

      const ok =
        String(providerResponse?.status || '').toLowerCase() === 'success' ||
        providerResponse?.status === true ||
        String(providerResponse?.message || '').toLowerCase().includes('success');

      if (!ok) {
        throw new Error(providerResponse?.message || 'Ogdams data purchase returned non-success response');
      }

      const providerReference = providerResponse?.reference || providerResponse?.data?.reference || null;
      await sequelize.transaction(async (t) => {
        const lockedSim = await Sim.findByPk(sim.id, { transaction: t, lock: t.LOCK.UPDATE });
        const lockedPurchase = await AdminOgdamsDataPurchase.findByPk(purchase.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!lockedSim || !lockedPurchase) throw new Error('state_missing');

        const reserved = Number(lockedSim.reservedAirtime || 0);
        lockedSim.reservedAirtime = Math.max(0, reserved - costToSim);
        const airtimeBalance = Number(lockedSim.airtimeBalance || 0);
        lockedSim.airtimeBalance = Math.max(0, airtimeBalance - costToSim);
        await lockedSim.save({ transaction: t });

        lockedPurchase.status = 'processing';
        lockedPurchase.providerReference = providerReference;
        lockedPurchase.providerResponse = providerResponse;
        await lockedPurchase.save({ transaction: t });

        await AdminOgdamsDataPurchaseAudit.create(
          {
            purchaseId: lockedPurchase.id,
            adminId,
            userId: user.id,
            simId: sim.id,
            simIccidLast4: sim.iccid ? String(sim.iccid).slice(-4) : null,
            ogdamsSku: plan.ogdams_sku,
            eventType: 'provider_requested',
            status: 'processing',
            metadata: { providerReference, reference },
          },
          { transaction: t }
        );
      });

      this.scheduleVerification(purchase.id, 1).catch((e) => void e);

      const updated = await AdminOgdamsDataPurchase.findByPk(purchase.id);
      return { ok: true, purchase: updated };
    } catch (e) {
      const message = e?.message || 'Ogdams data purchase failed';
      await this.rollbackReservation({ purchaseId: purchase.id, simId: sim.id, amount: costToSim, adminId, userId: user.id, ogdamsSku: plan.ogdams_sku, error: message });
      return { ok: false, reason: 'provider_failed', message };
    }
  }

  async rollbackReservation({ purchaseId, simId, amount, adminId, userId, ogdamsSku, error }) {
    try {
      await sequelize.transaction(async (t) => {
        const lockedSim = await Sim.findByPk(simId, { transaction: t, lock: t.LOCK.UPDATE });
        const lockedPurchase = await AdminOgdamsDataPurchase.findByPk(purchaseId, { transaction: t, lock: t.LOCK.UPDATE });
        if (lockedSim) {
          const reserved = Number(lockedSim.reservedAirtime || 0);
          lockedSim.reservedAirtime = Math.max(0, reserved - Number(amount || 0));
          await lockedSim.save({ transaction: t });
        }
        if (lockedPurchase) {
          lockedPurchase.status = 'failed';
          lockedPurchase.failureReason = error;
          await lockedPurchase.save({ transaction: t });
        }
        await AdminOgdamsDataPurchaseAudit.create(
          {
            purchaseId,
            adminId,
            userId,
            simId,
            simIccidLast4: lockedSim?.iccid ? String(lockedSim.iccid).slice(-4) : null,
            ogdamsSku,
            eventType: 'failed',
            status: 'failed',
            metadata: { error },
          },
          { transaction: t }
        );
      });
    } catch (e) {
      logger.error('[AdminOgdamsDataPurchase] rollbackReservation failed', { purchaseId, error: e.message });
    }
  }

  parseProviderStatus(raw) {
    const direct = String(raw?.status || raw?.data?.status || raw?.result?.status || '').toLowerCase();
    if (direct.includes('success') || direct === 'completed') return 'completed';
    if (direct.includes('fail') || direct.includes('error') || direct === 'failed') return 'failed';
    if (direct.includes('pending') || direct.includes('process') || direct.includes('queue')) return 'processing';
    return 'unknown';
  }

  async scheduleVerification(purchaseId, attempt = 1) {
    const enabled = String(process.env.OGDAMS_DATA_VERIFY_ENABLED || 'true').toLowerCase() !== 'false';
    if (!enabled) return;
    const maxAttempts = Number.parseInt(process.env.OGDAMS_DATA_VERIFY_MAX_ATTEMPTS || '4', 10);
    const delayMs = Number.parseInt(process.env.OGDAMS_DATA_VERIFY_DELAY_MS || '8000', 10);
    if (attempt > maxAttempts) return;

    setTimeout(async () => {
      try {
        await this.verifyPurchase(purchaseId, attempt);
      } catch (e) {
        logger.error('[AdminOgdamsDataPurchase] verifyPurchase failed', { purchaseId, error: e.message });
      }
    }, Math.max(0, delayMs));
  }

  async verifyPurchase(purchaseId, attempt = 1) {
    const purchase = await AdminOgdamsDataPurchase.findByPk(purchaseId);
    if (!purchase) return;
    if (purchase.status === 'completed' || purchase.status === 'failed') return;

    const reference = purchase.providerReference || purchase.reference;
    let status = 'unknown';
    let raw = null;
    try {
      raw = await ogdamsService.checkTransactionStatus(reference);
      status = this.parseProviderStatus(raw);
    } catch (e) {
      status = 'unknown';
      raw = { error: e.message };
    }

    if (status === 'completed') {
      await sequelize.transaction(async (t) => {
        const locked = await AdminOgdamsDataPurchase.findByPk(purchase.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!locked) return;
        if (locked.status === 'completed' || locked.status === 'failed') return;
        locked.status = 'completed';
        locked.completedAt = new Date();
        locked.providerResponse = locked.providerResponse || raw;
        await locked.save({ transaction: t });

        await AdminOgdamsDataPurchaseAudit.create(
          {
            purchaseId: locked.id,
            adminId: locked.adminId,
            userId: locked.userId,
            simId: locked.simId,
            simIccidLast4: null,
            ogdamsSku: locked.ogdamsSku,
            eventType: 'completed',
            status: 'completed',
            metadata: { attempt, reference },
          },
          { transaction: t }
        );
      });

      try {
        await notificationRealtimeService.sendToUser(purchase.userId, {
          title: 'Data bundle delivered',
          message: `A data bundle was delivered to your line ${maskPhone(purchase.recipientPhone) || ''}.`,
          type: 'success',
          priority: 'low',
          link: '/dashboard',
          metadata: { kind: 'admin_data_purchase', reference: purchase.reference },
        });
      } catch (e) {
        void e;
      }

      return;
    }

    if (status === 'failed') {
      await sequelize.transaction(async (t) => {
        const locked = await AdminOgdamsDataPurchase.findByPk(purchase.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!locked) return;
        if (locked.status === 'completed' || locked.status === 'failed') return;
        locked.status = 'failed';
        locked.failureReason = locked.failureReason || 'provider_failed';
        await locked.save({ transaction: t });

        await AdminOgdamsDataPurchaseAudit.create(
          {
            purchaseId: locked.id,
            adminId: locked.adminId,
            userId: locked.userId,
            simId: locked.simId,
            simIccidLast4: null,
            ogdamsSku: locked.ogdamsSku,
            eventType: 'failed',
            status: 'failed',
            metadata: { attempt, reference },
          },
          { transaction: t }
        );
      });
      return;
    }

    const maxAttempts = Number.parseInt(process.env.OGDAMS_DATA_VERIFY_MAX_ATTEMPTS || '4', 10);
    if (attempt >= maxAttempts) {
      await sequelize.transaction(async (t) => {
        const locked = await AdminOgdamsDataPurchase.findByPk(purchase.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!locked) return;
        if (locked.status === 'completed' || locked.status === 'failed') return;
        locked.status = 'failed';
        locked.failureReason = locked.failureReason || 'verification_timeout';
        await locked.save({ transaction: t });

        await AdminOgdamsDataPurchaseAudit.create(
          {
            purchaseId: locked.id,
            adminId: locked.adminId,
            userId: locked.userId,
            simId: locked.simId,
            simIccidLast4: null,
            ogdamsSku: locked.ogdamsSku,
            eventType: 'failed',
            status: 'failed',
            metadata: { attempt, reference, raw },
          },
          { transaction: t }
        );
      });
      return;
    }

    this.scheduleVerification(purchase.id, attempt + 1).catch((e) => void e);
  }
}

module.exports = new AdminOgdamsDataPurchaseService();

