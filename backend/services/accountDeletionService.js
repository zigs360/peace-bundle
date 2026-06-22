const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Beneficiary = require('../models/Beneficiary');
const Notification = require('../models/Notification');
const SupportTicket = require('../models/SupportTicket');
const Referral = require('../models/Referral');
const Commission = require('../models/Commission');
const Sim = require('../models/Sim');
const Review = require('../models/Review');
const AccountDeletionRequest = require('../models/AccountDeletionRequest');
const AccountDeletionAudit = require('../models/AccountDeletionAudit');
const { sendEmail } = require('./notificationService');
const notificationRealtimeService = require('./notificationRealtimeService');
const logger = require('../utils/logger');

const OTP_TTL_MS = Number.parseInt(process.env.ACCOUNT_DELETION_OTP_TTL_MS || '900000', 10);
const OTP_COOLDOWN_MS = Number.parseInt(process.env.ACCOUNT_DELETION_OTP_COOLDOWN_MS || '60000', 10);
const GRACE_PERIOD_DAYS = Math.max(7, Number.parseInt(process.env.ACCOUNT_DELETION_GRACE_DAYS || '7', 10));
const RETENTION_POLICY_TEXT =
  'Personal account data is permanently removed after admin execution. Minimal compliance audit logs are retained only as irreversible hashes and non-personal action records.';

function makeError(message, status = 400, code = 'ACCOUNT_DELETION_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function maskEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  return `${local.slice(0, 2) || '*'}***@${domain}`;
}

function resolveDeletionVerificationState(user) {
  const meta = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
  return meta.accountDeletionVerification && typeof meta.accountDeletionVerification === 'object'
    ? meta.accountDeletionVerification
    : null;
}

async function setDeletionVerificationState(user, value) {
  const meta = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
  const nextMeta = { ...meta };
  if (value) {
    nextMeta.accountDeletionVerification = value;
  } else {
    delete nextMeta.accountDeletionVerification;
  }
  await user.update({ metadata: nextMeta });
}

function ensureRequestableUser(user) {
  if (!user) throw makeError('User not found', 404, 'USER_NOT_FOUND');
  if (String(user.role || '').toLowerCase() === 'admin' || String(user.role || '').toLowerCase() === 'super_admin') {
    throw makeError('Administrator accounts cannot be deleted through self-service workflow', 403, 'ACCOUNT_DELETION_FORBIDDEN_ROLE');
  }
}

async function logAudit({
  requestId = null,
  userId = null,
  adminId = null,
  actorType,
  eventType,
  status = 'success',
  reason = null,
  metadata = {},
}) {
  try {
    await AccountDeletionAudit.create({
      requestId,
      userId,
      adminId,
      actorType,
      eventType,
      status,
      reason,
      metadata,
    });
  } catch (error) {
    logger.warn('[AccountDeletion] Failed to write audit record', {
      requestId,
      userId,
      adminId,
      eventType,
      message: error.message,
    });
  }
}

async function notifyUser(user, { title, message, type = 'warning', priority = 'high', link = '/dashboard/settings', metadata = null }) {
  try {
    await notificationRealtimeService.sendToUser(user.id, {
      title,
      message,
      type,
      priority,
      link,
      metadata,
    });
  } catch (error) {
    logger.warn('[AccountDeletion] Failed to send in-app notification', {
      userId: user.id,
      message: error.message,
    });
  }
}

async function sendLifecycleEmail(to, subject, text, html) {
  try {
    await sendEmail(to, subject, text, html, { throwOnError: false });
  } catch (error) {
    logger.warn('[AccountDeletion] Failed to send lifecycle email', {
      to: maskEmail(to),
      subject,
      message: error.message,
    });
  }
}

function toRequestResponse(record) {
  if (!record) return null;
  const graceEndsAt = record.graceEndsAt ? new Date(record.graceEndsAt) : null;
  const canCancel =
    String(record.status || '').toLowerCase() === 'pending' &&
    graceEndsAt &&
    graceEndsAt.getTime() > Date.now();
  return {
    id: record.id,
    status: record.status,
    requestedAt: record.requestedAt,
    graceEndsAt: record.graceEndsAt,
    cancelledAt: record.cancelledAt,
    rejectedAt: record.rejectedAt,
    approvedAt: record.approvedAt,
    completedAt: record.completedAt,
    requestReason: record.requestReason,
    adminReviewReason: record.adminReviewReason,
    executionReason: record.executionReason,
    retentionAcknowledged: Boolean(record.retentionAcknowledged),
    canCancel,
    reviewState:
      String(record.status || '').toLowerCase() !== 'pending'
        ? 'closed'
        : graceEndsAt && graceEndsAt.getTime() > Date.now()
          ? 'grace_period'
          : 'ready_for_review',
  };
}

async function getLatestRequestForUser(userId) {
  return AccountDeletionRequest.findOne({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
}

async function getActiveRequestForUser(userId) {
  return AccountDeletionRequest.findOne({
    where: {
      userId,
      status: {
        [Op.in]: ['pending', 'approved'],
      },
    },
    order: [['createdAt', 'DESC']],
  });
}

async function buildAssociatedDataSummary(user) {
  const userId = user.id;
  const wallet = await Wallet.findOne({ where: { userId } });
  const [
    transactionCount,
    beneficiaryCount,
    notificationCount,
    supportTicketCount,
    referralCount,
    commissionCount,
    simCount,
    reviewCount,
    lastTransactionAt,
    lastNotificationAt,
    lastSupportActivityAt,
  ] = await Promise.all([
    Transaction.count({ where: { userId } }),
    Beneficiary.count({ where: { userId } }),
    Notification.count({ where: { userId } }),
    SupportTicket.count({ where: { userId } }),
    Referral.count({
      where: {
        [Op.or]: [{ referrerId: userId }, { referredUserId: userId }],
      },
    }),
    Commission.count({
      where: {
        [Op.or]: [{ referrerId: userId }, { referredUserId: userId }],
      },
    }),
    Sim.count({ where: { userId } }),
    Review.count({ where: { userId } }),
    Transaction.max('createdAt', { where: { userId } }),
    Notification.max('createdAt', { where: { userId } }),
    SupportTicket.max('updatedAt', { where: { userId } }),
  ]);

  const activityCandidates = [
    user.updatedAt,
    user.createdAt,
    wallet?.last_transaction_at || null,
    lastTransactionAt,
    lastNotificationAt,
    lastSupportActivityAt,
  ]
    .map((value) => (value ? new Date(value) : null))
    .filter((value) => value && Number.isFinite(value.getTime()));

  activityCandidates.sort((left, right) => right.getTime() - left.getTime());

  const recentTransactions = await Transaction.findAll({
    where: { userId },
    attributes: ['id', 'reference', 'source', 'amount', 'status', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 5,
  });

  return {
    createdAt: user.createdAt,
    lastActivityAt: activityCandidates[0] ? activityCandidates[0].toISOString() : user.createdAt,
    wallet: wallet
      ? {
          balance: Number(wallet.balance || 0),
          bonusBalance: Number(wallet.bonus_balance || 0),
          commissionBalance: Number(wallet.commission_balance || 0),
          currency: wallet.currency,
        }
      : null,
    counts: {
      transactions: transactionCount,
      beneficiaries: beneficiaryCount,
      notifications: notificationCount,
      supportTickets: supportTicketCount,
      referrals: referralCount,
      commissions: commissionCount,
      sims: simCount,
      reviews: reviewCount,
    },
    recentTransactions: recentTransactions.map((item) => ({
      id: item.id,
      reference: item.reference,
      source: item.source,
      amount: Number(item.amount || 0),
      status: item.status,
      createdAt: item.createdAt,
    })),
    profile: {
      accountStatus: user.account_status,
      role: user.role,
      kycStatus: user.kyc_status,
      hasVirtualAccount: Boolean(user.virtual_account_number),
      virtualAccountBank: user.virtual_account_bank || null,
    },
  };
}

async function requestVerificationOtp(user, context = {}) {
  ensureRequestableUser(user);

  const activeRequest = await getActiveRequestForUser(user.id);
  if (activeRequest) {
    await logAudit({
      requestId: activeRequest.id,
      userId: user.id,
      actorType: 'user',
      eventType: 'verification_code_blocked_duplicate_request',
      status: 'failure',
      reason: 'duplicate_request',
      metadata: { activeStatus: activeRequest.status },
    });
    throw makeError('An active account deletion request already exists for this account', 409, 'ACCOUNT_DELETION_DUPLICATE_REQUEST');
  }

  if (!user.email) {
    throw makeError('A verified email address is required before requesting account deletion', 400, 'ACCOUNT_DELETION_EMAIL_REQUIRED');
  }

  const previous = resolveDeletionVerificationState(user);
  const sentAt = previous?.sentAt ? new Date(previous.sentAt).getTime() : 0;
  const resendAvailableAt = sentAt + OTP_COOLDOWN_MS;
  if (sentAt && resendAvailableAt > Date.now()) {
    const secondsLeft = Math.ceil((resendAvailableAt - Date.now()) / 1000);
    throw makeError(`Please wait ${secondsLeft} second(s) before requesting another verification code`, 429, 'ACCOUNT_DELETION_OTP_COOLDOWN');
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const verificationState = {
    hash: hashValue(otp),
    sentAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await setDeletionVerificationState(user, verificationState);

  const destination = maskEmail(user.email);
  const text = [
    `Your Peace Bundlle account deletion verification code is ${otp}.`,
    `It expires in ${Math.max(1, Math.round(OTP_TTL_MS / 60000))} minute(s).`,
    'If you did not request account deletion, ignore this email and keep your account secure.',
  ].join('\n\n');
  const html = `<p>Your Peace Bundlle account deletion verification code is <strong>${otp}</strong>.</p><p>It expires in ${Math.max(1, Math.round(OTP_TTL_MS / 60000))} minute(s).</p><p>If you did not request account deletion, ignore this email and keep your account secure.</p>`;
  await sendLifecycleEmail(user.email, 'Account deletion verification code', text, html);

  await logAudit({
    userId: user.id,
    actorType: 'user',
    eventType: 'verification_code_sent',
    metadata: {
      destination,
      expiresAt: expiresAt.toISOString(),
      ip: context.ip || null,
      userAgent: context.userAgent || null,
    },
  });

  return {
    destination,
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(Date.now() + OTP_COOLDOWN_MS).toISOString(),
  };
}

async function verifyOtpOrThrow(user, otp) {
  const verification = resolveDeletionVerificationState(user);
  const hash = String(verification?.hash || '');
  const expiresAt = verification?.expiresAt ? new Date(verification.expiresAt) : null;
  const normalized = String(otp || '').replace(/\D/g, '');

  if (!/^\d{6}$/.test(normalized)) {
    throw makeError('Enter the 6-digit email verification code', 400, 'ACCOUNT_DELETION_OTP_REQUIRED');
  }
  if (!hash || !expiresAt) {
    throw makeError('Request an email verification code before submitting your deletion request', 400, 'ACCOUNT_DELETION_OTP_REQUIRED');
  }
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await setDeletionVerificationState(user, null);
    throw makeError('The email verification code has expired. Request a new code.', 401, 'ACCOUNT_DELETION_OTP_EXPIRED');
  }
  if (hash !== hashValue(normalized)) {
    throw makeError('The email verification code is invalid', 401, 'ACCOUNT_DELETION_OTP_INVALID');
  }
}

async function submitDeletionRequest(user, payload = {}, context = {}) {
  ensureRequestableUser(user);

  const activeRequest = await getActiveRequestForUser(user.id);
  if (activeRequest) {
    throw makeError('An active account deletion request already exists for this account', 409, 'ACCOUNT_DELETION_DUPLICATE_REQUEST');
  }

  if (!payload.confirmPermanentDeletion) {
    throw makeError('You must confirm that account deletion is permanent', 400, 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED');
  }
  if (!payload.acknowledgeRetentionPolicy) {
    throw makeError('You must acknowledge the data retention policy before continuing', 400, 'ACCOUNT_DELETION_RETENTION_ACKNOWLEDGEMENT_REQUIRED');
  }

  await verifyOtpOrThrow(user, payload.verificationCode);
  await setDeletionVerificationState(user, null);

  const requestedAt = new Date();
  const graceEndsAt = new Date(requestedAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const request = await AccountDeletionRequest.create({
    userId: user.id,
    status: 'pending',
    requestedAt,
    graceEndsAt,
    requestReason: String(payload.reason || '').trim() || null,
    retentionAcknowledged: true,
    metadata: {
      retentionPolicy: RETENTION_POLICY_TEXT,
      requestedFrom: {
        ip: context.ip || null,
        userAgent: context.userAgent || null,
      },
    },
  });

  await logAudit({
    requestId: request.id,
    userId: user.id,
    actorType: 'user',
    eventType: 'request_submitted',
    metadata: {
      requestedAt: requestedAt.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    },
  });

  const message = `Your account deletion request has been submitted. You can still cancel it until ${graceEndsAt.toLocaleString()}. ${RETENTION_POLICY_TEXT}`;
  await notifyUser(user, {
    title: 'Account deletion requested',
    message,
    type: 'warning',
    priority: 'high',
    metadata: { kind: 'account_deletion_request', requestId: request.id, graceEndsAt: graceEndsAt.toISOString() },
  });
  await sendLifecycleEmail(
    user.email,
    'Account deletion request received',
    message,
    `<p>Your account deletion request has been submitted.</p><p>You can still cancel it until <strong>${graceEndsAt.toLocaleString()}</strong>.</p><p>${RETENTION_POLICY_TEXT}</p>`
  );

  return toRequestResponse(request);
}

async function cancelDeletionRequest(user, context = {}) {
  ensureRequestableUser(user);

  const request = await AccountDeletionRequest.findOne({
    where: {
      userId: user.id,
      status: 'pending',
    },
    order: [['createdAt', 'DESC']],
  });
  if (!request) {
    throw makeError('No cancellable account deletion request was found', 404, 'ACCOUNT_DELETION_REQUEST_NOT_FOUND');
  }
  if (new Date(request.graceEndsAt).getTime() <= Date.now()) {
    throw makeError('The grace period has ended and this request can no longer be cancelled', 409, 'ACCOUNT_DELETION_GRACE_PERIOD_ENDED');
  }

  await request.update({
    status: 'cancelled',
    cancelledAt: new Date(),
    metadata: {
      ...(request.metadata || {}),
      cancelledFrom: {
        ip: context.ip || null,
        userAgent: context.userAgent || null,
      },
    },
  });

  await logAudit({
    requestId: request.id,
    userId: user.id,
    actorType: 'user',
    eventType: 'request_cancelled',
  });

  await notifyUser(user, {
    title: 'Account deletion cancelled',
    message: 'Your account deletion request has been cancelled and your account remains active.',
    type: 'success',
    priority: 'medium',
    metadata: { kind: 'account_deletion_cancelled', requestId: request.id },
  });
  await sendLifecycleEmail(
    user.email,
    'Account deletion request cancelled',
    'Your account deletion request has been cancelled. No deletion will be processed for your account.',
    '<p>Your account deletion request has been cancelled. No deletion will be processed for your account.</p>'
  );

  return toRequestResponse(request);
}

async function getUserRequestStatus(user) {
  ensureRequestableUser(user);
  const currentRequest = await getLatestRequestForUser(user.id);
  return {
    retentionPolicy: RETENTION_POLICY_TEXT,
    minimumGracePeriodDays: GRACE_PERIOD_DAYS,
    request: toRequestResponse(currentRequest),
  };
}

async function buildAdminRequestRow(request) {
  const user = request.user || null;
  const graceEndsAt = request.graceEndsAt ? new Date(request.graceEndsAt) : null;
  return {
    ...toRequestResponse(request),
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          accountStatus: user.account_status,
          createdAt: user.createdAt,
          kycStatus: user.kyc_status,
        }
      : null,
    isReadyForReview: Boolean(graceEndsAt && graceEndsAt.getTime() <= Date.now() && request.status === 'pending'),
  };
}

async function listDeletionRequests(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const search = String(query.search || '').trim();
  const status = String(query.status || '').trim();
  const reviewState = String(query.reviewState || '').trim();

  const where = {};
  if (status && status !== 'all') {
    where.status = status;
  } else {
    where.status = { [Op.in]: ['pending', 'approved', 'rejected', 'cancelled', 'completed'] };
  }

  const userWhere = search
    ? {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
        ],
      }
    : undefined;

  const { count, rows } = await AccountDeletionRequest.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone', 'role', 'account_status', 'createdAt', 'kyc_status'],
        where: userWhere,
        required: Boolean(userWhere),
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  let items = await Promise.all(rows.map((row) => buildAdminRequestRow(row)));
  if (reviewState === 'ready') {
    items = items.filter((item) => item.isReadyForReview);
  } else if (reviewState === 'grace') {
    items = items.filter((item) => item.reviewState === 'grace_period');
  }

  return {
    success: true,
    count: items.length,
    total: count,
    page,
    limit,
    rows: items,
  };
}

async function getDeletionRequestDetail(requestId) {
  const request = await AccountDeletionRequest.findByPk(requestId, {
    include: [
      {
        model: User,
        as: 'user',
        include: [{ model: Wallet, as: 'wallet' }],
      },
      {
        model: AccountDeletionAudit,
        as: 'audits',
        separate: true,
        limit: 20,
        order: [['createdAt', 'DESC']],
      },
    ],
  });

  if (!request) {
    throw makeError('Deletion request not found', 404, 'ACCOUNT_DELETION_REQUEST_NOT_FOUND');
  }

  const detail = await buildAdminRequestRow(request);
  const associatedData = request.user ? await buildAssociatedDataSummary(request.user) : request.metadata?.deletedAccountSummary || null;

  return {
    success: true,
    request: {
      ...detail,
      associatedData,
      audits: Array.isArray(request.audits)
        ? request.audits.map((audit) => ({
            id: audit.id,
            actorType: audit.actorType,
            eventType: audit.eventType,
            status: audit.status,
            reason: audit.reason,
            metadata: audit.metadata,
            createdAt: audit.createdAt,
            adminId: audit.adminId,
          }))
        : [],
    },
  };
}

async function assertReadyForAdminReview(request) {
  if (!request) {
    throw makeError('Deletion request not found', 404, 'ACCOUNT_DELETION_REQUEST_NOT_FOUND');
  }
  if (String(request.status || '').toLowerCase() !== 'pending') {
    throw makeError('Only pending deletion requests can be processed', 409, 'ACCOUNT_DELETION_ALREADY_PROCESSED');
  }
  if (new Date(request.graceEndsAt).getTime() > Date.now()) {
    throw makeError('The grace period has not ended yet for this request', 409, 'ACCOUNT_DELETION_GRACE_PERIOD_ACTIVE');
  }
}

async function approveDeletionRequest(adminUser, requestId, payload = {}, context = {}) {
  const request = await AccountDeletionRequest.findByPk(requestId, {
    include: [{ model: User, as: 'user' }],
  });
  await assertReadyForAdminReview(request);

  const reason = String(payload.reason || '').trim();
  if (!reason) {
    throw makeError('Approval reason is required', 400, 'ACCOUNT_DELETION_APPROVAL_REASON_REQUIRED');
  }

  await request.update({
    status: 'approved',
    approvedAt: new Date(),
    approvedByAdminId: adminUser.id,
    adminReviewReason: reason,
    metadata: {
      ...(request.metadata || {}),
      approvedFrom: {
        ip: context.ip || null,
        userAgent: context.userAgent || null,
      },
    },
  });

  if (request.user) {
    await request.user.update({ account_status: 'suspended' });
    await notifyUser(request.user, {
      title: 'Account deletion approved',
      message: 'Your account deletion request has been approved and is awaiting final execution by an administrator.',
      type: 'warning',
      priority: 'high',
      metadata: { kind: 'account_deletion_approved', requestId: request.id },
    });
    await sendLifecycleEmail(
      request.user.email,
      'Account deletion approved',
      'Your account deletion request has been approved and is awaiting final execution by an administrator.',
      '<p>Your account deletion request has been approved and is awaiting final execution by an administrator.</p>'
    );
  }

  await logAudit({
    requestId: request.id,
    userId: request.userId,
    adminId: adminUser.id,
    actorType: 'admin',
    eventType: 'request_approved',
    reason,
    metadata: {
      ip: context.ip || null,
      userAgent: context.userAgent || null,
    },
  });

  return toRequestResponse(request);
}

async function rejectDeletionRequest(adminUser, requestId, payload = {}, context = {}) {
  const request = await AccountDeletionRequest.findByPk(requestId, {
    include: [{ model: User, as: 'user' }],
  });
  await assertReadyForAdminReview(request);

  const reason = String(payload.reason || '').trim();
  if (!reason) {
    throw makeError('Rejection reason is required', 400, 'ACCOUNT_DELETION_REJECTION_REASON_REQUIRED');
  }

  await request.update({
    status: 'rejected',
    rejectedAt: new Date(),
    rejectedByAdminId: adminUser.id,
    adminReviewReason: reason,
    metadata: {
      ...(request.metadata || {}),
      rejectedFrom: {
        ip: context.ip || null,
        userAgent: context.userAgent || null,
      },
    },
  });

  if (request.user) {
    await request.user.update({ account_status: 'active' });
    await notifyUser(request.user, {
      title: 'Account deletion rejected',
      message: `Your account deletion request was rejected. Reason: ${reason}`,
      type: 'error',
      priority: 'high',
      metadata: { kind: 'account_deletion_rejected', requestId: request.id },
    });
    await sendLifecycleEmail(
      request.user.email,
      'Account deletion rejected',
      `Your account deletion request was rejected. Reason: ${reason}`,
      `<p>Your account deletion request was rejected.</p><p><strong>Reason:</strong> ${reason}</p>`
    );
  }

  await logAudit({
    requestId: request.id,
    userId: request.userId,
    adminId: adminUser.id,
    actorType: 'admin',
    eventType: 'request_rejected',
    reason,
    metadata: {
      ip: context.ip || null,
      userAgent: context.userAgent || null,
    },
  });

  return toRequestResponse(request);
}

async function destroyWhere(model, where, transaction) {
  if (!model || !where || !Object.keys(where).length) return;
  await model.destroy({
    where,
    force: true,
    paranoid: false,
    transaction,
  });
}

async function purgeUserFiles(user) {
  const candidates = [user.avatar, user.kyc_document]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((relativePath) => path.join(__dirname, '..', relativePath));

  for (const filePath of candidates) {
    try {
      await fs.unlink(filePath);
    } catch (_error) {
      void 0;
    }
  }
}

async function purgeUserAccountData(user, transaction) {
  const walletIds = (
    await Wallet.findAll({
      where: { userId: user.id },
      attributes: ['id'],
      transaction,
      paranoid: false,
    })
  ).map((wallet) => wallet.id);

  const models = Object.values(sequelize.models);
  for (const model of models) {
    const attributes = model.rawAttributes || {};
    if (
      model === User ||
      model === Wallet ||
      model === AccountDeletionRequest ||
      model === AccountDeletionAudit
    ) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(attributes, 'userId')) {
      await destroyWhere(model, { userId: user.id }, transaction);
    }
  }

  if (walletIds.length) {
    for (const model of models) {
      const attributes = model.rawAttributes || {};
      if (Object.prototype.hasOwnProperty.call(attributes, 'walletId')) {
        await destroyWhere(model, { walletId: { [Op.in]: walletIds } }, transaction);
      }
    }
  }

  await destroyWhere(Referral, { [Op.or]: [{ referrerId: user.id }, { referredUserId: user.id }] }, transaction);
  await destroyWhere(Commission, { [Op.or]: [{ referrerId: user.id }, { referredUserId: user.id }] }, transaction);
  await destroyWhere(Wallet, { userId: user.id }, transaction);
  await user.destroy({ force: true, transaction });
}

async function executeDeletion(adminUser, requestId, payload = {}, context = {}) {
  const reason = String(payload.reason || '').trim();
  if (!reason) {
    throw makeError('Execution reason is required', 400, 'ACCOUNT_DELETION_EXECUTION_REASON_REQUIRED');
  }

  const request = await AccountDeletionRequest.findByPk(requestId, {
    include: [{ model: User, as: 'user' }],
  });
  if (!request) {
    throw makeError('Deletion request not found', 404, 'ACCOUNT_DELETION_REQUEST_NOT_FOUND');
  }
  if (String(request.status || '').toLowerCase() === 'completed') {
    throw makeError('This deletion request has already been executed', 409, 'ACCOUNT_DELETION_ALREADY_COMPLETED');
  }
  if (String(request.status || '').toLowerCase() !== 'approved') {
    throw makeError('Deletion request must be approved before execution', 409, 'ACCOUNT_DELETION_NOT_APPROVED');
  }
  if (!request.user) {
    throw makeError('The target account is no longer available for deletion', 404, 'ACCOUNT_DELETION_USER_MISSING');
  }

  const user = request.user;
  const associatedDataSummary = await buildAssociatedDataSummary(user);
  const deletedSubjectHash = hashValue([user.id, user.email, user.phone].join(':'));
  const emailAddress = user.email;

  const tx = await sequelize.transaction();
  try {
    await logAudit({
      requestId: request.id,
      userId: user.id,
      adminId: adminUser.id,
      actorType: 'admin',
      eventType: 'deletion_execution_started',
      reason,
      metadata: {
        ip: context.ip || null,
        userAgent: context.userAgent || null,
      },
    });

    await AccountDeletionAudit.update(
      { userId: null },
      {
        where: { userId: user.id },
        transaction: tx,
      }
    );

    await request.update(
      {
        status: 'completed',
        completedAt: new Date(),
        executedByAdminId: adminUser.id,
        executionReason: reason,
        userId: null,
        metadata: {
          ...(request.metadata || {}),
          deletedSubjectHash,
          deletedAccountSummary: associatedDataSummary,
          executedFrom: {
            ip: context.ip || null,
            userAgent: context.userAgent || null,
          },
        },
      },
      { transaction: tx }
    );

    await AccountDeletionAudit.create(
      {
        requestId: request.id,
        userId: null,
        adminId: adminUser.id,
        actorType: 'admin',
        eventType: 'deletion_executed',
        status: 'success',
        reason,
        metadata: {
          deletedSubjectHash,
          associatedDataSummary,
        },
      },
      { transaction: tx }
    );

    await purgeUserAccountData(user, tx);
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  await purgeUserFiles(user);
  await sendLifecycleEmail(
    emailAddress,
    'Account deletion completed',
    'Your Peace Bundlle account deletion has been completed. Your personal account data has been permanently removed from our active systems.',
    '<p>Your Peace Bundlle account deletion has been completed.</p><p>Your personal account data has been permanently removed from our active systems.</p>'
  );

  return {
    success: true,
    requestId: request.id,
    deletedSubjectHash,
    completedAt: new Date().toISOString(),
  };
}

module.exports = {
  RETENTION_POLICY_TEXT,
  GRACE_PERIOD_DAYS,
  makeError,
  requestVerificationOtp,
  submitDeletionRequest,
  cancelDeletionRequest,
  getUserRequestStatus,
  listDeletionRequests,
  getDeletionRequestDetail,
  approveDeletionRequest,
  rejectDeletionRequest,
  executeDeletion,
};
