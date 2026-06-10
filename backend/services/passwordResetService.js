const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const TEST_ROUNDS = 4;
const PROD_ROUNDS = 10;

function getSaltRounds() {
  return process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? TEST_ROUNDS : PROD_ROUNDS;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getPasswordResetState(user) {
  const metadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
  const passwordReset = metadata.passwordReset && typeof metadata.passwordReset === 'object' ? metadata.passwordReset : {};
  return { metadata, passwordReset };
}

function maskEmail(email) {
  const value = normalizeEmail(email);
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? `${local[0] || '*'}***` : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

function getResetBaseUrl(req) {
  const configuredOrigins = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const preferredConfigured = configuredOrigins.find((item) => item.startsWith('https://')) || configuredOrigins[0] || '';
  if (preferredConfigured) {
    return preferredConfigured.replace(/\/+$/, '');
  }

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || '').split(',')[0].trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || '').split(',')[0].trim();
  const host = forwardedHost || String(req?.get?.('host') || '').trim();
  const proto = host && (/^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host))
    ? (forwardedProto || 'http')
    : 'https';
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  return 'https://peacebundlle.com';
}

function buildResetLink(req, token) {
  const baseUrl = getResetBaseUrl(req);
  return `${baseUrl}/reset-password?token=${encodeURIComponent(String(token || ''))}`;
}

function getExpirationDescription() {
  return 'This reset link expires in 1 hour.';
}

function isNonProduction() {
  return String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
}

function getExpirationIso() {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
}

function getPasswordRuleChecks(password) {
  const value = String(password || '');
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

function isPasswordStrong(password) {
  return Object.values(getPasswordRuleChecks(password)).every(Boolean);
}

function makePasswordValidationError() {
  const error = new Error('Password must be at least 8 characters and include uppercase, lowercase, numeric, and special characters.');
  error.status = 400;
  error.code = 'PASSWORD_TOO_WEAK';
  return error;
}

function createTokenState(token, now = Date.now()) {
  return {
    tokenHash: hashResetToken(token),
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RESET_TOKEN_TTL_MS).toISOString(),
    status: 'unused',
    usedAt: null,
  };
}

function clearTokenState(existing = {}) {
  return {
    ...existing,
    tokenHash: null,
    requestedAt: null,
    expiresAt: null,
    status: 'used',
    usedAt: new Date().toISOString(),
  };
}

function makeGenericResetRequestResponse() {
  return {
    success: true,
    message: 'If an account exists for that email, a password reset link will be sent shortly. The link expires in 1 hour.',
  };
}

async function persistPasswordResetState(user, nextState) {
  const { metadata } = getPasswordResetState(user);
  user.metadata = {
    ...metadata,
    passwordReset: nextState,
  };
  await user.save();
}

async function requestPasswordReset(email, req) {
  const normalizedEmail = normalizeEmail(email);
  const user = normalizedEmail ? await User.findOne({ where: { email: normalizedEmail } }) : null;
  const maskedEmail = maskEmail(normalizedEmail);
  const requestMeta = {
    maskedEmail,
    ip: req.ip || null,
    userAgent: req.get?.('user-agent') || null,
  };

  if (!user) {
    logger.info('[Auth] Password reset requested for non-existent email', requestMeta);
    return makeGenericResetRequestResponse();
  }

  const token = generateResetToken();
  const nextState = createTokenState(token);
  await persistPasswordResetState(user, nextState);

  const resetLink = buildResetLink(req, token);
  const subject = 'Reset your Peace Bundle password';
  const text = [
    `Hello ${user.name || 'User'},`,
    '',
    'We received a request to reset your Peace Bundle account password.',
    'To continue, open the secure link below and choose a new password:',
    resetLink,
    '',
    getExpirationDescription(),
    `Expiration time: ${new Date(nextState.expiresAt).toLocaleString()}`,
    '',
    'If you did not request this reset, you can safely ignore this email.',
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2>Reset your password</h2>
      <p>Hello ${user.name || 'User'},</p>
      <p>We received a request to reset your Peace Bundle account password.</p>
      <p>
        Click the secure one-time-use link below to choose a new password:
      </p>
      <p>
        <a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;">
          Reset password
        </a>
      </p>
      <p style="word-break: break-all;"><strong>Direct link:</strong> <a href="${resetLink}">${resetLink}</a></p>
      <p><strong>${getExpirationDescription()}</strong></p>
      <p><strong>Expiration time:</strong> ${new Date(nextState.expiresAt).toLocaleString()}</p>
      <p>If you did not request this reset, you can safely ignore this email.</p>
    </div>
  `;

  const delivery = await notificationService.sendEmail(user.email, subject, text, html, { throwOnError: false });
  if (!delivery?.success) {
    const devResetLink = buildResetLink(req, token);
    const isMissingEmailSetup = ['smtp_not_configured', 'missing_recipient'].includes(String(delivery?.reason || ''));

    if (isNonProduction() && isMissingEmailSetup) {
      logger.warn('[Auth] Password reset email unavailable, exposing development reset link', {
        userId: user.id,
        maskedEmail,
        ip: req.ip || null,
      });
      return {
        success: true,
        message: 'Email delivery is not configured in this environment. Use the development reset link below. The link expires in 1 hour.',
        devResetLink,
        expiresAt: nextState.expiresAt,
      };
    }

    await persistPasswordResetState(user, {
      tokenHash: null,
      requestedAt: null,
      expiresAt: null,
      status: 'unused',
      usedAt: null,
    });
    logger.error('[Auth] Password reset email delivery failed', {
      userId: user.id,
      maskedEmail,
      ip: req.ip || null,
      userAgent: req.get?.('user-agent') || null,
      reason: delivery?.reason || 'unknown',
    });
    return {
      success: true,
      message: 'If an account exists for that email, a password reset link will be sent shortly. If you do not receive it, please try again later.',
    };
  }

  logger.info('[Auth] Password reset email queued', {
    userId: user.id,
    maskedEmail,
    expiresAt: nextState.expiresAt,
    ip: req.ip || null,
  });

  return makeGenericResetRequestResponse();
}

function compareTokenHashes(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  if (!leftBuffer.length || !rightBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function resolveResetToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    const error = new Error('Password reset token is required.');
    error.status = 400;
    error.code = 'PASSWORD_RESET_TOKEN_REQUIRED';
    throw error;
  }

  const tokenHash = hashResetToken(normalizedToken);
  const users = await User.findAll();
  const matchedUser = users.find((candidate) => {
    const { passwordReset } = getPasswordResetState(candidate);
    return compareTokenHashes(passwordReset.tokenHash, tokenHash);
  }) || null;

  if (!matchedUser) {
    const error = new Error('This password reset link is invalid.');
    error.status = 400;
    error.code = 'PASSWORD_RESET_TOKEN_INVALID';
    throw error;
  }

  const { passwordReset } = getPasswordResetState(matchedUser);
  if (passwordReset.status !== 'unused') {
    const error = new Error('This password reset link has already been used.');
    error.status = 410;
    error.code = 'PASSWORD_RESET_TOKEN_USED';
    throw error;
  }

  const expiresAt = passwordReset.expiresAt ? new Date(passwordReset.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    const error = new Error('This password reset link has expired.');
    error.status = 410;
    error.code = 'PASSWORD_RESET_TOKEN_EXPIRED';
    throw error;
  }

  return { user: matchedUser, passwordReset };
}

async function validateResetToken(token, req) {
  const { user, passwordReset } = await resolveResetToken(token);
  logger.info('[Auth] Password reset token validated', {
    userId: user.id,
    maskedEmail: maskEmail(user.email),
    ip: req.ip || null,
  });
  return {
    success: true,
    message: 'Password reset token is valid.',
    expiresAt: passwordReset.expiresAt,
  };
}

async function completePasswordReset(token, newPassword, confirmPassword, req) {
  if (!isPasswordStrong(newPassword)) {
    throw makePasswordValidationError();
  }
  if (String(newPassword || '') !== String(confirmPassword || '')) {
    const error = new Error('Password confirmation does not match.');
    error.status = 400;
    error.code = 'PASSWORD_CONFIRMATION_MISMATCH';
    throw error;
  }

  const { user, passwordReset } = await resolveResetToken(token);
  const passwordHash = await bcrypt.hash(String(newPassword), await bcrypt.genSalt(getSaltRounds()));
  const { metadata } = getPasswordResetState(user);

  user.password = passwordHash;
  user.login_attempts = 0;
  user.lockout_until = null;
  user.metadata = {
    ...metadata,
    refreshTokens: [],
    passwordReset: {
      ...passwordReset,
      status: 'used',
      usedAt: new Date().toISOString(),
    },
  };
  await user.save();

  logger.info('[Auth] Password reset completed', {
    userId: user.id,
    maskedEmail: maskEmail(user.email),
    ip: req.ip || null,
  });

  return {
    success: true,
    message: 'Your password has been reset successfully. You can now sign in with your new password.',
  };
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  normalizeEmail,
  getPasswordRuleChecks,
  isPasswordStrong,
  makePasswordValidationError,
  makeGenericResetRequestResponse,
  requestPasswordReset,
  validateResetToken,
  completePasswordReset,
};
