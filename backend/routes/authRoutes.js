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

// Auth Specific Rate Limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
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
  body('emailOrPhone').trim().notEmpty().withMessage('Email or Phone is required'),
  body('password').exists().withMessage('Password is required')
];

const passwordResetRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
      return `password-reset:${normalizedEmail || 'unknown-email'}`;
    },
    message: {
      success: false,
      message: 'Too many password reset requests for this email. Please try again in about 1 hour.',
    },
});

const passwordResetRequestValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('Please include a valid email')
    .normalizeEmail(),
];

const passwordResetCompleteValidation = [
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  body('newPassword').isString().withMessage('New password is required'),
  body('confirmPassword').isString().withMessage('Password confirmation is required'),
];

const enforceSensitiveHttps = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const isSecure = req.secure || forwardedProto === 'https';
  if (isSecure) return next();
  return res.status(403).json({
    success: false,
    message: 'This password reset action is only available over HTTPS.',
  });
};

router.post('/register', authLimiter, validate(registerValidation), registerUser);
router.post('/referral/click', authLimiter, trackReferralClick);
router.post('/login', authLimiter, validate(loginValidation), loginUser);
router.post('/password-reset/request', enforceSensitiveHttps, passwordResetRequestLimiter, validate(passwordResetRequestValidation), requestPasswordReset);
router.get('/password-reset/validate', enforceSensitiveHttps, validatePasswordResetToken);
router.post('/password-reset/complete', enforceSensitiveHttps, validate(passwordResetCompleteValidation), completePasswordReset);
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
