const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { registerUser, loginUser, getMe, getAllUsers, updateProfile, changePassword, submitKyc } = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
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

router.post('/register', authLimiter, validate(registerValidation), registerUser);
router.post('/login', authLimiter, validate(loginValidation), loginUser);
router.get('/me', protect, getMe);
router.get('/profile', protect, getMe); // Alias for frontend compatibility
router.get('/users', protect, admin, getAllUsers);
router.put('/profile', protect, upload.single('avatar'), updateProfile);
router.put('/password', protect, changePassword);
router.post('/kyc', protect, upload.single('document'), submitKyc);

module.exports = router;
