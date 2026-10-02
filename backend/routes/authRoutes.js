const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const {
  registerUser,
  loginUser,
  getMe,
  getAllUsers,
  updateProfile,
  changePassword,
  submitKyc,
  refreshUserToken,
  logoutUser,
  trackReferralClick,
  requestPasswordReset,
  verifyPasswordResetCode,
  validatePasswordResetToken,
  completePasswordReset,
} = require('../controllers/authController');
const {
  getTransactionPinStatus,
  createTransactionPin,
  changeTransactionPin,
  requestTransactionPinRecoveryOtp,
  recoverTransactionPin,
  createTransactionPinSession,
} = require('../controllers/transactionPinController');
const { protect, admin } = require('../middleware/authMiddleware');
const { avatarUpload, kycUpload } = require('../middleware/uploadMiddleware');
const logger = require('../utils/logger');
const validate = require('../middleware/validationMiddleware');

const getClientIp = (req) => {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return String(cfIp).split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).split(',')[0].trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
};

// Auth Specific Rate Limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '50', 10), // Limit each individual client IP to 50 attempts
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    keyGenerator: (req) => getClientIp(req),
    message: {
        success: false,
        message: 'Too many login/register attempts, please try again after 15 minutes'
    }
});

// Validation Rules
const registerValidation = [
  body('fullName').optional(),
  body('name').custom((value, { req }) => {
    if (!value && !req.body.fullName) {
      throw new Error('Name is required');
    }
    return true;
  }),
  body('email').isEmail().withMessage('Please include a valid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
];

const loginValidation = [
  body('emailOrPhone')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const val = value || req.body.email || req.body.phone;
      if (!val || String(val).trim() === '') {
        throw new Error('Email or Phone is required');
      }
      return true;
    }),
  body('password').notEmpty().withMessage('Password is required')
];

const passwordResetRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 3 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    keyGenerator: (req) => {
      const identifier = String(req.body?.emailOrPhone || req.body?.email || req.body?.phone || '').trim().toLowerCase();
      return `password-reset:${identifier || getClientIp(req)}`;
    },
    message: {
      success: false,
      message: 'Too many password reset requests for this account. Please try again in about 1 hour.',
    },
});

const passwordResetRequestValidation = [
  body().custom((body) => {
    const identifier = String(body.emailOrPhone || body.email || body.phone || '').trim();
    if (!identifier) {
      throw new Error('Please enter your registered email address or phone number');
    }
    return true;
  }),
];

const passwordResetVerifyValidation = [
  body().custom((body) => {
    const identifier = String(body.emailOrPhone || body.email || body.phone || '').trim();
    if (!identifier) {
      throw new Error('Email or phone number is required');
    }
    return true;
  }),
  body('code').trim().notEmpty().withMessage('Verification code is required'),
];

const passwordResetCompleteValidation = [
  body('token').trim().notEmpty().withMessage('Reset token or code is required'),
  body('newPassword').isString().withMessage('New password is required'),
  body('confirmPassword').isString().withMessage('Password confirmation is required'),
];

const enforceSensitiveHttps = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || process.env.ENFORCE_HTTPS === 'false' || process.env.DISABLE_HTTPS_ENFORCEMENT === 'true') {
    return next();
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const host = String(req.headers['host'] || '').toLowerCase();
  const cfVisitor = String(req.headers['cf-visitor'] || '');
  const isSecure =
    req.secure ||
    forwardedProto.includes('https') ||
    req.headers['x-forwarded-ssl'] === 'on' ||
    req.headers['front-end-https'] === 'on' ||
    cfVisitor.includes('"https"') ||
    host.includes('peacebundlle.com') ||
    host.includes('peacebundle.com') ||
    host.includes('localhost') ||
    host.includes('127.0.0.1');

  if (isSecure) return next();
  return res.status(403).json({
    success: false,
    message: 'This password reset action is only available over HTTPS.',
  });
};

const { getPublicSettings } = require('../controllers/adminController');

router.get('/settings/public', getPublicSettings);
router.post('/register', authLimiter, validate(registerValidation), registerUser);
router.post('/referral/click', authLimiter, trackReferralClick);
router.post('/login', authLimiter, validate(loginValidation), loginUser);
router.post('/password-reset/request', enforceSensitiveHttps, passwordResetRequestLimiter, validate(passwordResetRequestValidation), requestPasswordReset);
router.post('/forgot-password', enforceSensitiveHttps, passwordResetRequestLimiter, validate(passwordResetRequestValidation), requestPasswordReset);
router.post('/password-reset/verify', enforceSensitiveHttps, validate(passwordResetVerifyValidation), verifyPasswordResetCode);
router.post('/verify-reset-code', enforceSensitiveHttps, validate(passwordResetVerifyValidation), verifyPasswordResetCode);
router.get('/password-reset/validate', enforceSensitiveHttps, validatePasswordResetToken);
router.post('/password-reset/complete', enforceSensitiveHttps, validate(passwordResetCompleteValidation), completePasswordReset);
router.post('/reset-password', enforceSensitiveHttps, validate(passwordResetCompleteValidation), completePasswordReset);
router.get('/me', protect, getMe);
router.get('/profile', protect, getMe); // Alias for frontend compatibility
router.get('/users', protect, admin, getAllUsers);
router.put(
  '/profile',
  protect,
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (!err) return next();
      const message = String(err.message || 'Upload failed');
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      logger.error('[ProfileUpload] Avatar upload failed', {
        userId: req.user?.id || null,
        code: err.code || null,
        message,
        contentType: req.headers?.['content-type'] || null,
      });
      return res.status(status).json({
        success: false,
        message: err.code === 'LIMIT_FILE_SIZE' ? 'Profile photo must be 5MB or less.' : message,
      });
    });
  },
  updateProfile,
);
router.put('/password', protect, changePassword);
router.post('/kyc', protect, kycUpload.single('document'), submitKyc);
router.get('/transaction-pin', protect, getTransactionPinStatus);
router.post('/transaction-pin', protect, createTransactionPin);
router.put('/transaction-pin', protect, changeTransactionPin);
router.post('/transaction-pin/recovery/otp', protect, requestTransactionPinRecoveryOtp);
router.post('/transaction-pin/recover', protect, recoverTransactionPin);
router.post('/transaction-pin/session', protect, createTransactionPinSession);
router.post('/refresh', refreshUserToken);
router.post('/logout', logoutUser);

module.exports = router;
