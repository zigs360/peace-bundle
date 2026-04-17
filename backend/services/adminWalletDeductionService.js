const sequelize = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const AdminWalletDeduction = require('../models/AdminWalletDeduction');
const AdminWalletDeductionAudit = require('../models/AdminWalletDeductionAudit');
const walletService = require('./walletService');
const notificationRealtimeService = require('./notificationRealtimeService');
const { sendEmail, sendSMS } = require('./notificationService');
const logger = require('../utils/logger');
const crypto = require('crypto');

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const WALLET_DEDUCTION_TXN_SOURCE = 'withdrawal';
const WALLET_REVERSAL_TXN_SOURCE = 'refund';

class AdminWalletDeductionService {
  isSuperAdmin(user) {
    const email = String(user?.email || '').trim().toLowerCase();
    const allowListRaw = String(process.env.SUPER_ADMIN_EMAILS || '').trim();
    const allowList = allowListRaw
      ? allowListRaw
          .split(',')
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const meta = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
    const metaFlag = meta.is_super_admin === true || meta.super_admin === true;
    return metaFlag || (email && allowList.includes(email));
  }
  async getUserWalletSnapshot(userId) {
    const [user, wallet] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone', 'role'] }),
      Wallet.findOne({ where: { userId } }),
    ]);
    if (!user) return { ok: false, reason: 'user_not_found' };
    if (!wallet) return { ok: false, reason: 'wallet_not_found' };
    return {
      ok: true,
      user,
      wallet: {
        id: wallet.id,
        balance: parseFloat(String(wallet.balance)),
        status: wallet.status,
      },
    };
  }

  buildReference(idempotencyKeyHash) {
    if (idempotencyKeyHash) return `ADM-DEDUCT-${idempotencyKeyHash.slice(0, 24).toUpperCase()}`;
    return `ADM-DEDUCT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }

  async createDeduction({ adminUserId, userId, amount, reason, idempotencyKey, adminIp = null, adminAgent = null }) {
    const admin = await User.findByPk(adminUserId, { attributes: ['id', 'name', 'email', 'phone', 'role'] });
    if (!admin) return { ok: false, reason: 'admin_not_found' };

    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return { ok: false, reason: 'invalid_amount' };
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) return { ok: false, reason: 'invalid_reason' };

    const idKey = idempotencyKey ? String(idempotencyKey) : null;
    const idHash = idKey ? sha256Hex(idKey) : null;
    const reference = this.buildReference(idHash);

    const existing = await AdminWalletDeduction.findOne({ where: { reference } });
    if (existing) return { ok: true, deduction: existing, idempotent: true };

    let created = null;
    let txn = null;
    let walletAfter = null;
    let walletBefore = null;

    await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone'], transaction: t });
      if (!user) {
        const err = new Error('user_not_found');
        err.code = 'user_not_found';
        throw err;
      }

      const wallet = await Wallet.findOne({ where: { userId: user.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!wallet) {
        const err = new Error('wallet_not_found');
        err.code = 'wallet_not_found';
        throw err;
      }

      walletBefore = parseFloat(String(wallet.balance));
      const nextBalance = walletBefore - numeric;
      if (nextBalance < 0) {
        const err = new Error('insufficient_wallet_balance');
        err.code = 'insufficient_wallet_balance';
        throw err;
      }

      const { txn: createdTxn, wallet: updatedWallet } = await walletService.adminAdjust(
        user,
        -numeric,
        WALLET_DEDUCTION_TXN_SOURCE,
        `Admin deduction: ₦${Number(numeric).toLocaleString()} - ${trimmedReason}`,
        {
          reference,
          reason: trimmedReason,
          admin_id: admin.id,
          user_id: user.id,
          kind: 'admin_wallet_deduction',
        },
        t
      );

      txn = createdTxn;
      walletAfter = parseFloat(String(updatedWallet.balance));

      created = await AdminWalletDeduction.create(
        {
          reference,
          adminId: admin.id,
          userId: user.id,
          amount: numeric,
          reason: trimmedReason,
          balanceBefore: walletBefore,
          balanceAfter: walletAfter,
          transactionId: txn.id,
          status: 'completed',
          idempotencyKeyHash: idHash,
          metadata: {
            ip: adminIp || null,
            agent: adminAgent || null,
          },
        },
        { transaction: t, returning: true }
      );

      await AdminWalletDeductionAudit.create(
        {
          deductionId: created.id,
          adminId: admin.id,
          userId: user.id,
          eventType: 'deducted',
          amount: numeric,
          balanceBefore: walletBefore,
          balanceAfter: walletAfter,
          reason: trimmedReason,
          metadata: { transactionId: txn.id, reference },
        },
        { transaction: t }
      );
    });

    try {
      notificationRealtimeService.emitToUser(userId, 'wallet_balance_updated', {
        reference,
        amount: numeric,
        gateway: 'admin_deduction',
        balance: walletAfter,
      });
    } catch (e) {
      void e;
    }

    try {
      const user = await User.findByPk(userId, { attributes: ['email', 'phone', 'name'] });
      if (user) {
        await sendEmail(
          user.email,
          'Wallet deduction notice',
          `Hello ${user.name || 'User'}, ₦${Number(numeric).toLocaleString()} was deducted from your wallet. Reason: ${trimmedReason}. Ref: ${reference}.`
        );
        await sendSMS(
          user.phone,
          `PeaceBundlle: ₦${Number(numeric).toLocaleString()} deducted from your wallet. Ref: ${reference}.`
        );
      }
    } catch (e) {
      void e;
    }

    try {
      await sendEmail(
        admin.email,
        'Wallet deduction completed',
        `You deducted ₦${Number(numeric).toLocaleString()} from user ${userId}. Ref: ${reference}. Reason: ${trimmedReason}.`
      );
      await sendSMS(
        admin.phone,
        `PeaceBundlle Admin: Deduction ₦${Number(numeric).toLocaleString()} completed. Ref: ${reference}.`
      );
    } catch (e) {
      void e;
    }

    logger.info('[AUDIT][AdminWalletDeduction] Deduction completed', {
      adminId: adminUserId,
      userId,
      reference,
      amount: numeric,
      balanceBefore: walletBefore,
      balanceAfter: walletAfter,
    });

    return { ok: true, deduction: created, transaction: txn };
  }

  async reverseDeduction({ superAdminUserId, reference, reason, adminIp = null, adminAgent = null }) {
    const admin = await User.findByPk(superAdminUserId, { attributes: ['id', 'name', 'email', 'phone', 'role'] });
    if (!admin) return { ok: false, reason: 'admin_not_found' };
    if (String(admin.role) !== 'admin' || !this.isSuperAdmin(admin)) return { ok: false, reason: 'not_super_admin' };

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) return { ok: false, reason: 'invalid_reason' };

    const deduction = await AdminWalletDeduction.findOne({ where: { reference: String(reference || '').trim() } });
    if (!deduction) return { ok: false, reason: 'not_found' };
    if (deduction.status === 'reversed') return { ok: true, deduction, already: true };

    const createdAt = new Date(deduction.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    if (diffMs > 24 * 60 * 60 * 1000) return { ok: false, reason: 'window_expired' };

    const creditReference = `ADM-REV-${String(reference).replace(/^ADM-DEDUCT-/, '')}`.slice(0, 50);

    let walletBefore = null;
    let walletAfter = null;
    let txn = null;

    await sequelize.transaction(async (t) => {
      const locked = await AdminWalletDeduction.findByPk(deduction.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked) throw new Error('not_found');
      if (locked.status === 'reversed') {
        deduction.status = 'reversed';
        return;
      }

      const user = await User.findByPk(locked.userId, { attributes: ['id', 'name', 'email', 'phone'], transaction: t });
      if (!user) throw new Error('user_not_found');
      const wallet = await Wallet.findOne({ where: { userId: user.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!wallet) throw new Error('wallet_not_found');

      walletBefore = parseFloat(String(wallet.balance));

      const { txn: createdTxn, wallet: updatedWallet } = await walletService.adminAdjust(
        user,
        Number(locked.amount),
        WALLET_REVERSAL_TXN_SOURCE,
        `Admin reversal for ${locked.reference}: ₦${Number(locked.amount).toLocaleString()} - ${trimmedReason}`,
        {
          reference: creditReference,
          original_reference: locked.reference,
          reason: trimmedReason,
          admin_id: admin.id,
          user_id: user.id,
          kind: 'admin_wallet_deduction_reversal',
        },
        t
      );

      txn = createdTxn;
      walletAfter = parseFloat(String(updatedWallet.balance));

      locked.status = 'reversed';
      locked.reversedAt = new Date();
      locked.reversalTransactionId = txn.id;
      locked.metadata = { ...(locked.metadata || {}), reversal: { ip: adminIp || null, agent: adminAgent || null, reason: trimmedReason } };
      await locked.save({ transaction: t });

      await AdminWalletDeductionAudit.create(
        {
          deductionId: locked.id,
          adminId: admin.id,
          userId: user.id,
          eventType: 'reversed',
          amount: Number(locked.amount),
          balanceBefore: walletBefore,
          balanceAfter: walletAfter,
          reason: trimmedReason,
          metadata: { transactionId: txn.id, reference: locked.reference, creditReference },
        },
        { transaction: t }
      );
    });

    try {
      notificationRealtimeService.emitToUser(deduction.userId, 'wallet_balance_updated', {
        reference: creditReference,
        amount: Number(deduction.amount),
        gateway: 'admin_reversal',
        balance: walletAfter,
      });
    } catch (e) {
      void e;
    }

    try {
      const user = await User.findByPk(deduction.userId, { attributes: ['email', 'phone', 'name'] });
      if (user) {
        await sendEmail(
          user.email,
          'Wallet deduction reversed',
          `Hello ${user.name || 'User'}, a previous wallet deduction (${deduction.reference}) was reversed. Amount: ₦${Number(deduction.amount).toLocaleString()}. Ref: ${creditReference}.`
        );
        await sendSMS(user.phone, `PeaceBundlle: Wallet deduction reversed. Ref: ${creditReference}.`);
      }
    } catch (e) {
      void e;
    }

    try {
      await sendEmail(admin.email, 'Wallet deduction reversal completed', `Reversal completed for ${deduction.reference}. Ref: ${creditReference}.`);
      await sendSMS(admin.phone, `PeaceBundlle Admin: Reversal completed. Ref: ${creditReference}.`);
    } catch (e) {
      void e;
    }

    const updated = await AdminWalletDeduction.findOne({ where: { reference: String(reference || '').trim() } });
    return { ok: true, deduction: updated, transaction: txn };
  }
}

module.exports = new AdminWalletDeductionService();
