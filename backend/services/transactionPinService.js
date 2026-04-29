const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const TransactionPinSecurityEvent = require('../models/TransactionPinSecurityEvent');
const { sendEmail, sendSMS } = require('./notificationService');
const logger = require('../utils/logger');

const PIN_REGEX = /^\d{4}$/;
const REPEATED_PIN_REGEX = /^(\d)\1{3}$/;
const ASCENDING_PIN = '0123456789';
const DESCENDING_PIN = '9876543210';
const TEST_ROUNDS = 4;
const PROD_ROUNDS = 10;
const SESSION_TIMEOUT_MS = Number.parseInt(process.env.TRANSACTION_PIN_SESSION_TTL_MS || '300000', 10);
const MAX_ATTEMPTS = Number.parseInt(process.env.TRANSACTION_PIN_MAX_ATTEMPTS || '5', 10);
const LOCKOUT_MINUTES = Number.parseInt(process.env.TRANSACTION_PIN_LOCKOUT_MINUTES || '15', 10);
const RECOVERY_OTP_TTL_MS = Number.parseInt(process.env.TRANSACTION_PIN_RECOVERY_OTP_TTL_MS || '600000', 10);
const RECOVERY_OTP_COOLDOWN_MS = Number.parseInt(process.env.TRANSACTION_PIN_RECOVERY_OTP_COOLDOWN_MS || '60000', 10);

function makeError(message, status = 400, code = 'TRANSACTION_PIN_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getSaltRounds() {
  return process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? TEST_ROUNDS : PROD_ROUNDS;
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp || '')).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function isSequentialPin(pin) {
  return ASCENDING_PIN.includes(pin) || DESCENDING_PIN.includes(pin);
}

function assertPinFormat(pin) {
  if (!PIN_REGEX.test(String(pin || ''))) {
    throw makeError('Transaction PIN must be exactly 4 digits', 400, 'TRANSACTION_PIN_INVALID_FORMAT');
  }
  if (REPEATED_PIN_REGEX.test(pin) || isSequentialPin(pin)) {
    throw makeError('Choose a less predictable 4-digit PIN', 400, 'TRANSACTION_PIN_TOO_WEAK');
  }
}

function assertPinConfirmation(pin, confirmPin) {
  if (String(pin || '') !== String(confirmPin || '')) {
    throw makeError('PIN confirmation does not match', 400, 'TRANSACTION_PIN_CONFIRMATION_MISMATCH');
  }
}

async function verifyPassword(user, password) {
  if (!password) {
    throw makeError('Account password is required for this action', 400, 'ACCOUNT_PASSWORD_REQUIRED');
  }
  const matches = await bcrypt.compare(String(password), String(user.password || ''));
  if (!matches) {
    throw makeError('Account password is incorrect', 401, 'ACCOUNT_PASSWORD_INVALID');
  }
}

function getLockoutExpiry() {
  return new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
}

function sanitizeScope(scope) {
  return String(scope || 'financial').trim().toLowerCase() || 'financial';
}

function maskEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const lastFour = digits.slice(-4);
  return `***${lastFour}`;
}

function buildOtpDeliveryChannels(user) {
  const channels = [];
  const maskedEmail = maskEmail(user.email);
  const maskedPhone = maskPhone(user.phone);
  if (maskedEmail) channels.push({ channel: 'email', destination: maskedEmail });
  if (maskedPhone) channels.push({ channel: 'sms', destination: maskedPhone });
  return channels;
}

async function logSecurityEvent(user, { eventType, status = 'info', metadata = {}, context = {} }) {
  if (!user?.id) return;
  try {
    await TransactionPinSecurityEvent.create({
      userId: user.id,
      eventType,
      status,
      ip: context.ip || null,
      userAgent: context.userAgent || null,
      metadata,
    });
  } catch (error) {
    logger.warn('[PIN] Failed to persist security event', {
      userId: user.id,
      eventType,
      status,
      message: error.message,
    });
  }
}

async function persistPin(user, pin) {
  const hash = await bcrypt.hash(pin, await bcrypt.genSalt(getSaltRounds()));
  await user.update({
    transaction_pin_hash: hash,
    transaction_pin_failed_attempts: 0,
    transaction_pin_locked_until: null,
    transaction_pin_last_changed_at: new Date(),
    transaction_pin_last_verified_at: null,
    transaction_pin_recovery_otp_hash: null,
    transaction_pin_recovery_otp_expires_at: null,
    transaction_pin_recovery_otp_sent_at: null,
  });
  return hash;
}

function issueTransactionSession(user, scope = 'financial') {
  const normalizedScope = sanitizeScope(scope);
  const expiresInSeconds = Math.max(60, Math.floor(SESSION_TIMEOUT_MS / 1000));
  const token = jwt.sign(
    {
      id: user.id,
      purpose: 'transaction_pin',
      scope: normalizedScope,
    },
    process.env.JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );

  return {
    token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    timeoutMs: expiresInSeconds * 1000,
  };
}

async function registerFailedAttempt(user, reason, context = {}) {
  const attempts = Number(user.transaction_pin_failed_attempts || 0) + 1;
  const update = { transaction_pin_failed_attempts: attempts };
  let lockedUntil = null;
  if (attempts >= MAX_ATTEMPTS) {
    lockedUntil = getLockoutExpiry();
    update.transaction_pin_failed_attempts = 0;
    update.transaction_pin_locked_until = lockedUntil;
  }

  await user.update(update);
  logger.warn('[PIN] Failed transaction PIN attempt', {
    userId: user.id,
    attempts,
    reason,
    lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
  });

  if (lockedUntil) {
    await logSecurityEvent(user, {
      eventType: 'pin_locked',
      status: 'failure',
      metadata: {
        reason,
        attempts,
        lockedUntil: lockedUntil.toISOString(),
      },
      context,
    });
  } else {
    await logSecurityEvent(user, {
      eventType: 'pin_verification_failed',
      status: 'failure',
      metadata: {
        reason,
        attempts,
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
      },
      context,
    });
  }

  if (lockedUntil) {
    throw makeError(
      `Too many failed PIN attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
      429,
      'TRANSACTION_PIN_LOCKED'
    );
  }

  throw makeError('Incorrect transaction PIN', 401, 'TRANSACTION_PIN_INVALID');
}

function ensurePinExists(user) {
  if (!user.transaction_pin_hash) {
    throw makeError('Set up your transaction PIN before using PIN recovery', 403, 'TRANSACTION_PIN_NOT_SET');
  }
}

async function ensurePinConfigured(user) {
  ensurePinExists(user);
  if (user.transaction_pin_locked_until && new Date(user.transaction_pin_locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.transaction_pin_locked_until).getTime() - Date.now()) / 60000);
    throw makeError(
      `Transaction PIN is temporarily locked. Try again in ${minutesLeft} minute(s).`,
      429,
      'TRANSACTION_PIN_LOCKED'
    );
  }
}

async function setupPin(user, { pin, confirmPin, password }, context = {}) {
  await verifyPassword(user, password);
  if (user.transaction_pin_hash) {
    throw makeError('Transaction PIN already exists. Use change PIN instead.', 409, 'TRANSACTION_PIN_ALREADY_SET');
  }
  assertPinFormat(String(pin || ''));
  assertPinConfirmation(pin, confirmPin);
  await persistPin(user, String(pin));
  await logSecurityEvent(user, {
    eventType: 'pin_created',
    status: 'success',
    metadata: {},
    context,
  });
  logger.info('[PIN] Transaction PIN created', { userId: user.id });
  return { hasPin: true };
}

async function changePin(user, { currentPin, newPin, confirmPin }, context = {}) {
  await ensurePinConfigured(user);
  const matches = await bcrypt.compare(String(currentPin || ''), String(user.transaction_pin_hash || ''));
  if (!matches) {
    await registerFailedAttempt(user, 'change_pin_invalid_current', context);
  }
  assertPinFormat(String(newPin || ''));
  assertPinConfirmation(newPin, confirmPin);
  if (String(currentPin) === String(newPin)) {
    throw makeError('New PIN must be different from the current PIN', 400, 'TRANSACTION_PIN_REUSED');
  }
  await persistPin(user, String(newPin));
  await logSecurityEvent(user, {
    eventType: 'pin_changed',
    status: 'success',
    metadata: {},
    context,
  });
  logger.info('[PIN] Transaction PIN changed', { userId: user.id });
  return { hasPin: true };
}

async function requestRecoveryOtp(user, context = {}) {
  ensurePinExists(user);

  const sentAt = user.transaction_pin_recovery_otp_sent_at ? new Date(user.transaction_pin_recovery_otp_sent_at).getTime() : 0;
  const resendAvailableAt = sentAt + RECOVERY_OTP_COOLDOWN_MS;
  if (sentAt && resendAvailableAt > Date.now()) {
    const secondsLeft = Math.ceil((resendAvailableAt - Date.now()) / 1000);
    throw makeError(
      `Please wait ${secondsLeft} second(s) before requesting another recovery OTP`,
      429,
      'TRANSACTION_PIN_RECOVERY_OTP_COOLDOWN'
    );
  }

  const deliveryChannels = buildOtpDeliveryChannels(user);
  if (!deliveryChannels.length) {
    throw makeError(
      'Add a valid email address or phone number to receive a recovery OTP',
      400,
      'TRANSACTION_PIN_RECOVERY_OTP_DELIVERY_UNAVAILABLE'
    );
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + RECOVERY_OTP_TTL_MS);
  const now = new Date();

  await user.update({
    transaction_pin_recovery_otp_hash: hashOtp(otp),
    transaction_pin_recovery_otp_expires_at: expiresAt,
    transaction_pin_recovery_otp_sent_at: now,
  });

  const textMessage = `Your Peace Bundlle transaction PIN recovery OTP is ${otp}. It expires in ${Math.max(1, Math.round(RECOVERY_OTP_TTL_MS / 60000))} minute(s).`;
  const htmlMessage = `<p>Your Peace Bundlle transaction PIN recovery OTP is <strong>${otp}</strong>.</p><p>It expires in ${Math.max(1, Math.round(RECOVERY_OTP_TTL_MS / 60000))} minute(s).</p>`;

  if (user.email) {
    await sendEmail(user.email, 'Transaction PIN recovery OTP', textMessage, htmlMessage);
  }
  if (user.phone) {
    await sendSMS(user.phone, textMessage);
  }

  await logSecurityEvent(user, {
    eventType: 'pin_recovery_otp_requested',
    status: 'success',
    metadata: {
      deliveryChannels,
      expiresAt: expiresAt.toISOString(),
    },
    context,
  });

  logger.info('[PIN] Transaction PIN recovery OTP requested', {
    userId: user.id,
    deliveryChannels,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    deliveryChannels,
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(now.getTime() + RECOVERY_OTP_COOLDOWN_MS).toISOString(),
  };
}

async function verifyRecoveryOtp(user, otp, context = {}) {
  const normalizedOtp = String(otp || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw makeError('Enter the 6-digit recovery OTP', 400, 'TRANSACTION_PIN_RECOVERY_OTP_REQUIRED');
  }

  const hash = String(user.transaction_pin_recovery_otp_hash || '');
  const expiresAt = user.transaction_pin_recovery_otp_expires_at ? new Date(user.transaction_pin_recovery_otp_expires_at) : null;
  if (!hash || !expiresAt) {
    throw makeError('Request a recovery OTP before resetting your PIN', 400, 'TRANSACTION_PIN_RECOVERY_OTP_REQUIRED');
  }
  if (expiresAt.getTime() < Date.now()) {
    await user.update({
      transaction_pin_recovery_otp_hash: null,
      transaction_pin_recovery_otp_expires_at: null,
      transaction_pin_recovery_otp_sent_at: null,
    });
    throw makeError('Recovery OTP has expired. Request a new code.', 401, 'TRANSACTION_PIN_RECOVERY_OTP_EXPIRED');
  }
  if (hash !== hashOtp(normalizedOtp)) {
    throw makeError('Recovery OTP is invalid', 401, 'TRANSACTION_PIN_RECOVERY_OTP_INVALID');
  }

  await logSecurityEvent(user, {
    eventType: 'pin_recovery_otp_verified',
    status: 'success',
    metadata: {},
    context,
  });
}

async function recoverPin(user, { password, otp, newPin, confirmPin }, context = {}) {
  ensurePinExists(user);
  try {
    await verifyPassword(user, password);
    await verifyRecoveryOtp(user, otp, context);
  } catch (error) {
    await logSecurityEvent(user, {
      eventType: 'pin_recovery_failed',
      status: 'failure',
      metadata: {
        code: error.code || 'TRANSACTION_PIN_RECOVERY_FAILED',
        message: error.message,
      },
      context,
    });
    throw error;
  }

  assertPinFormat(String(newPin || ''));
  assertPinConfirmation(newPin, confirmPin);
  await persistPin(user, String(newPin));
  await logSecurityEvent(user, {
    eventType: 'pin_recovered',
    status: 'success',
    metadata: {},
    context,
  });
  logger.info('[PIN] Transaction PIN recovered', { userId: user.id });
  return { hasPin: true };
}

async function createSession(user, { pin, scope }, context = {}) {
  await ensurePinConfigured(user);
  const matches = await bcrypt.compare(String(pin || ''), String(user.transaction_pin_hash || ''));
  if (!matches) {
    await registerFailedAttempt(user, 'transaction_session_invalid_pin', context);
  }

  await user.update({
    transaction_pin_failed_attempts: 0,
    transaction_pin_locked_until: null,
    transaction_pin_last_verified_at: new Date(),
  });

  const session = issueTransactionSession(user, scope);
  await logSecurityEvent(user, {
    eventType: 'pin_session_created',
    status: 'success',
    metadata: {
      scope: sanitizeScope(scope),
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
    context,
  });
  logger.info('[PIN] Transaction PIN validated and session issued', {
    userId: user.id,
    scope: sanitizeScope(scope),
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
  return session;
}

function verifySessionToken(token, userId, scope = 'financial') {
  if (!token) {
    throw makeError('Transaction PIN session is required', 403, 'TRANSACTION_PIN_REQUIRED');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'transaction_pin') {
      throw makeError('Invalid transaction PIN session', 403, 'TRANSACTION_PIN_SESSION_INVALID');
    }
    if (String(decoded.id) !== String(userId)) {
      throw makeError('Transaction PIN session does not belong to this user', 403, 'TRANSACTION_PIN_SESSION_INVALID');
    }
    const expectedScope = sanitizeScope(scope);
    const tokenScope = sanitizeScope(decoded.scope);
    if (tokenScope !== expectedScope) {
      throw makeError('Transaction PIN session scope mismatch', 403, 'TRANSACTION_PIN_SESSION_INVALID');
    }
    return decoded;
  } catch (error) {
    if (error.code) throw error;
    throw makeError('Transaction PIN session expired or invalid', 403, 'TRANSACTION_PIN_SESSION_INVALID');
  }
}

function getStatus(user) {
  return {
    hasPin: Boolean(user.transaction_pin_hash),
    lockedUntil: user.transaction_pin_locked_until || null,
    sessionTimeoutMs: SESSION_TIMEOUT_MS,
    failedAttemptsRemaining: user.transaction_pin_locked_until && new Date(user.transaction_pin_locked_until) > new Date()
      ? 0
      : Math.max(0, MAX_ATTEMPTS - Number(user.transaction_pin_failed_attempts || 0)),
  };
}

module.exports = {
  SESSION_TIMEOUT_MS,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  RECOVERY_OTP_TTL_MS,
  setupPin,
  changePin,
  requestRecoveryOtp,
  recoverPin,
  createSession,
  verifySessionToken,
  getStatus,
  makeError,
};
