const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
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

function generateResetCode() {
  return String(crypto.randomInt(1000, 10000));
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

function buildResetLink(req, token, email) {
  const baseUrl = getResetBaseUrl(req);
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/reset-password?token=${encodeURIComponent(String(token || ''))}${emailParam}`;
}

function getExpirationDescription() {
  return 'This code expires in 15 minutes.';
}

function isNonProduction() {
  return String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
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

function makeGenericResetRequestResponse() {
  return {
    success: true,
    message: 'If an account exists for that email, a 4-digit verification code will be sent shortly. The code expires in 15 minutes.',
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
    ip: req?.ip || null,
    userAgent: req?.get?.('user-agent') || null,
  };

  if (!user) {
    logger.info('[Auth] Password reset requested for non-existent email', requestMeta);
    return makeGenericResetRequestResponse();
  }

  const code = generateResetCode();
  const nextState = {
    code,
    tokenHash: hashResetToken(code),
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    status: 'unused',
    verified: false,
    usedAt: null,
  };
  await persistPasswordResetState(user, nextState);

  const resetLink = buildResetLink(req, code, user.email);
  const subject = `Your PEACE BUNDLE Password Reset Code: ${code}`;
  const text = [
    `Hello ${user.name || 'User'},`,
    '',
    'We received a request to reset your PEACE BUNDLE account password.',
    '',
    `Your 4-digit verification code is: ${code}`,
    '',
    'This code expires in 15 minutes. Enter this code on the verification screen to set your new password.',
    '',
    `Or use this direct link: ${resetLink}`,
    '',
    'If you did not request this password reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0f766e; margin: 0;">PEACE BUNDLE</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Password Reset Verification Code</p>
      </div>
      <p>Hello <strong>${user.name || 'User'}</strong>,</p>
      <p>We received a request to reset your PEACE BUNDLE account password.</p>
      <p>Enter the 4-digit verification code below on the password reset screen:</p>
      <div style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f766e; background: #f0fdfa; border: 2px dashed #0f766e; padding: 12px 28px; border-radius: 10px;">
          ${code}
        </span>
      </div>
      <p style="font-size: 14px; color: #64748b; text-align: center;">
        This code expires in <strong>15 minutes</strong>. Do not share this code with anyone.
      </p>
      <p style="text-align: center; margin-top: 20px;">
        <a href="${resetLink}" style="display: inline-block; padding: 10px 18px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Reset Password Directly
        </a>
      </p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        If you did not request a password reset, you can safely ignore this email.
      </div>
    </div>
  `;

  const delivery = await notificationService.sendEmail(user.email, subject, text, html, { throwOnError: false });
  if (!delivery?.success) {
    const isMissingEmailSetup = ['smtp_not_configured', 'missing_recipient'].includes(String(delivery?.reason || ''));

    if (isNonProduction() && isMissingEmailSetup) {
      logger.warn('[Auth] Password reset email unavailable, exposing development reset code', {
        userId: user.id,
        maskedEmail,
        ip: req?.ip || null,
      });
      return {
        success: true,
        message: 'Email delivery is not configured in this environment. Use the development code below. The code expires in 15 minutes.',
        code,
        devResetLink: resetLink,
        expiresAt: nextState.expiresAt,
      };
    }

    await persistPasswordResetState(user, {
      code: null,
      tokenHash: null,
      requestedAt: null,
      expiresAt: null,
      status: 'unused',
      verified: false,
      usedAt: null,
    });
    logger.error('[Auth] Password reset email delivery failed', {
      userId: user.id,
      maskedEmail,
      ip: req?.ip || null,
      userAgent: req?.get?.('user-agent') || null,
      reason: delivery?.reason || 'unknown',
    });
    return {
      success: true,
      message: 'If an account exists for that email, a password reset code will be sent shortly. If you do not receive it, please try again later.',
    };
  }

  logger.info('[Auth] Password reset 4-digit code email sent', {
    userId: user.id,
    maskedEmail,
    expiresAt: nextState.expiresAt,
    ip: req?.ip || null,
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

async function verifyResetCode(email, code, req) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || '').trim();

  if (!normalizedEmail) {
    const error = new Error('Email address is required.');
    error.status = 400;
    error.code = 'EMAIL_REQUIRED';
    throw error;
  }

  if (!/^\d{4}$/.test(normalizedCode)) {
    const error = new Error('Please enter a valid 4-digit verification code.');
    error.status = 400;
    error.code = 'INVALID_CODE_FORMAT';
    throw error;
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user) {
    const error = new Error('Invalid or expired verification code.');
    error.status = 400;
    error.code = 'INVALID_CODE';
    throw error;
  }

  const { passwordReset } = getPasswordResetState(user);
  if (passwordReset.status !== 'unused') {
    const error = new Error('This verification code has already been used.');
    error.status = 410;
    error.code = 'CODE_ALREADY_USED';
    throw error;
  }

  const expiresAt = passwordReset.expiresAt ? new Date(passwordReset.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    const error = new Error('This verification code has expired. Please request a new code.');
    error.status = 410;
    error.code = 'CODE_EXPIRED';
    throw error;
  }

  const codeHash = hashResetToken(normalizedCode);
  const isMatch = (passwordReset.code && String(passwordReset.code) === normalizedCode) ||
    compareTokenHashes(passwordReset.tokenHash, codeHash);

  if (!isMatch) {
    const error = new Error('Incorrect verification code. Please check your email and try again.');
    error.status = 400;
    error.code = 'INVALID_CODE';
    throw error;
  }

  await persistPasswordResetState(user, {
    ...passwordReset,
    verified: true,
    verifiedAt: new Date().toISOString(),
  });

  logger.info('[Auth] Password reset 4-digit code verified successfully', {
    userId: user.id,
    maskedEmail: maskEmail(user.email),
    ip: req?.ip || null,
  });

  return {
    success: true,
    message: 'Verification code confirmed. You may now choose your new password.',
    email: user.email,
    token: normalizedCode,
  };
}

async function resolveResetToken(token, email = null) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    const error = new Error('Password reset verification code or token is required.');
    error.status = 400;
    error.code = 'PASSWORD_RESET_TOKEN_REQUIRED';
    throw error;
  }

  let matchedUser = null;
  const tokenHash = hashResetToken(normalizedToken);

  if (email) {
    const user = await User.findOne({ where: { email: normalizeEmail(email) } });
    if (user) {
      const { passwordReset } = getPasswordResetState(user);
      if ((passwordReset.code && String(passwordReset.code) === normalizedToken) ||
          compareTokenHashes(passwordReset.tokenHash, tokenHash)) {
        matchedUser = user;
      }
    }
  }

  if (!matchedUser) {
    const users = await User.findAll();
    matchedUser = users.find((candidate) => {
      const { passwordReset } = getPasswordResetState(candidate);
      return (passwordReset.code && String(passwordReset.code) === normalizedToken) ||
             compareTokenHashes(passwordReset.tokenHash, tokenHash);
    }) || null;
  }

  if (!matchedUser) {
    const error = new Error('This verification code or reset link is invalid.');
    error.status = 400;
    error.code = 'PASSWORD_RESET_TOKEN_INVALID';
    throw error;
  }

  const { passwordReset } = getPasswordResetState(matchedUser);
  if (passwordReset.status !== 'unused') {
    const error = new Error('This password reset code has already been used.');
    error.status = 410;
    error.code = 'PASSWORD_RESET_TOKEN_USED';
    throw error;
  }

  const expiresAt = passwordReset.expiresAt ? new Date(passwordReset.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    const error = new Error('This password reset code has expired. Please request a new code.');
    error.status = 410;
    error.code = 'PASSWORD_RESET_TOKEN_EXPIRED';
    throw error;
  }

  return { user: matchedUser, passwordReset };
}

async function validateResetToken(token, req, email = null) {
  const { user, passwordReset } = await resolveResetToken(token, email);
  logger.info('[Auth] Password reset token validated', {
    userId: user.id,
    maskedEmail: maskEmail(user.email),
    ip: req?.ip || null,
  });
  return {
    success: true,
    message: 'Password reset code is valid.',
    email: user.email,
    expiresAt: passwordReset.expiresAt,
  };
}

async function completePasswordReset(token, newPassword, confirmPassword, req, email = null) {
  if (!isPasswordStrong(newPassword)) {
    throw makePasswordValidationError();
  }
  if (String(newPassword || '') !== String(confirmPassword || '')) {
    const error = new Error('Password confirmation does not match.');
    error.status = 400;
    error.code = 'PASSWORD_CONFIRMATION_MISMATCH';
    throw error;
  }

  const { user, passwordReset } = await resolveResetToken(token, email);
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

  logger.info('[Auth] Password reset completed successfully', {
    userId: user.id,
    maskedEmail: maskEmail(user.email),
    ip: req?.ip || null,
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
  verifyResetCode,
  validateResetToken,
  completePasswordReset,
};