const User = require('../models/User');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');

const WELCOME_RETRY_DELAYS_MS = [0, 2000, 10000];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function getWelcomeState(user) {
  const metadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
  const welcomeEmail = metadata.welcomeEmail && typeof metadata.welcomeEmail === 'object' ? metadata.welcomeEmail : {};
  return { metadata, welcomeEmail };
}

function buildUnsubscribeUrl() {
  const raw = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'https://peacebundlle.com')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0] || 'https://peacebundlle.com';
  return `${raw.replace(/\/+$/, '')}/contact`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildWelcomeEmail(user) {
  const firstName = String(user?.name || 'there').trim().split(/\s+/)[0] || 'there';
  const unsubscribeUrl = buildUnsubscribeUrl();
  const subject = `Welcome to Peace Bundle, ${firstName}`;
  const featureHighlights = [
    'Fund your wallet with secure payment workflows',
    'Buy airtime, data, and utility services in one dashboard',
    'Track every transaction with clear status updates',
  ];
  const onboardingSteps = [
    'Sign in and review your dashboard overview',
    'Complete your profile and KYC details if required',
    'Fund your wallet and start using the platform services',
  ];

  const text = [
    `Hello ${user.name || 'there'},`,
    '',
    'Welcome to Peace Bundle. Your account has been created successfully.',
    '',
    'Getting started:',
    ...onboardingSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Key features:',
    ...featureHighlights.map((item) => `- ${item}`),
    '',
    'Need help? Reply to this email or visit our support page.',
    `Manage your communication preferences here: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2>Welcome to Peace Bundle</h2>
      <p>Hello ${user.name || 'there'},</p>
      <p>Your account has been created successfully. We are excited to help you manage funding, purchases, and account activity in one place.</p>
      <h3>Get started</h3>
      <ol>
        ${onboardingSteps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
      <h3>Key features</h3>
      <ul>
        ${featureHighlights.map((item) => `<li>${item}</li>`).join('')}
      </ul>
      <p>Need help? Reply to this email or visit our support page.</p>
      <p style="font-size: 12px; color: #64748b;">
        You are receiving this message because a Peace Bundle account was created with this email address.
        Manage communication preferences or unsubscribe from non-essential emails here:
        <a href="${unsubscribeUrl}">${unsubscribeUrl}</a>
      </p>
    </div>
  `;

  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

async function saveWelcomeState(user, nextState) {
  const { metadata } = getWelcomeState(user);
  user.metadata = {
    ...metadata,
    welcomeEmail: nextState,
  };
  await user.save();
}

async function sendWelcomeEmailForUser(userInput, options = {}) {
  const user = typeof userInput?.findByPk === 'function'
    ? userInput
    : (userInput?.id ? userInput : await User.findByPk(userInput));
  if (!user?.id) return { success: false, skipped: true, reason: 'user_not_found' };

  const email = normalizeEmail(user.email);
  const { welcomeEmail } = getWelcomeState(user);
  if (welcomeEmail.status === 'sent') {
    logger.info('[Auth] Welcome email skipped (already sent)', { userId: user.id, email });
    return { success: true, skipped: true, reason: 'already_sent' };
  }
  if (!isValidEmail(email)) {
    logger.warn('[Auth] Welcome email skipped (invalid email)', { userId: user.id, email });
    await saveWelcomeState(user, {
      status: 'failed',
      sentAt: null,
      attempts: Number(welcomeEmail.attempts || 0),
      lastAttemptAt: new Date().toISOString(),
      lastError: 'invalid_email',
      messageId: null,
    });
    return { success: false, skipped: true, reason: 'invalid_email' };
  }

  const userData = typeof user.toJSON === 'function' ? user.toJSON() : user;
  const mail = buildWelcomeEmail({ ...userData, email });
  let lastFailure = null;

  for (let index = 0; index < WELCOME_RETRY_DELAYS_MS.length; index += 1) {
    const delay = WELCOME_RETRY_DELAYS_MS[index];
    if (delay > 0) {
      if (process.env.NODE_ENV === 'test') {
        await Promise.resolve();
      } else {
        await sleep(delay);
      }
    }

    const attempt = Number(welcomeEmail.attempts || 0) + index + 1;
    const attemptedAt = new Date().toISOString();
    const result = await notificationService.sendEmail(email, mail.subject, mail.text, mail.html, {
      throwOnError: false,
      headers: mail.headers,
    });

    if (result?.success) {
      await saveWelcomeState(user, {
        status: 'sent',
        sentAt: attemptedAt,
        attempts: attempt,
        lastAttemptAt: attemptedAt,
        lastError: null,
        messageId: result.messageId || null,
      });
      logger.info('[Auth] Welcome email sent', { userId: user.id, email, attempt, messageId: result.messageId || null });
      return { success: true, attempts: attempt, messageId: result.messageId || null };
    }

    lastFailure = result?.reason || 'delivery_failed';
    await saveWelcomeState(user, {
      status: index === WELCOME_RETRY_DELAYS_MS.length - 1 ? 'failed' : 'retrying',
      sentAt: null,
      attempts: attempt,
      lastAttemptAt: attemptedAt,
      lastError: lastFailure,
      messageId: null,
    });
  }

  logger.error('[Auth] Welcome email permanently failed', {
    userId: user.id,
    email,
    attempts: WELCOME_RETRY_DELAYS_MS.length,
    error: lastFailure,
  });
  return { success: false, reason: lastFailure, attempts: WELCOME_RETRY_DELAYS_MS.length };
}

module.exports = {
  WELCOME_RETRY_DELAYS_MS,
  isValidEmail,
  buildWelcomeEmail,
  sendWelcomeEmailForUser,
};
