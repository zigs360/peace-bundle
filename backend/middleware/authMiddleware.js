const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { getAccessTokenFromRequest } = require('../utils/authCookies');

// In-memory cache for authenticated user lookups to prevent connection pool exhaustion during burst requests
const userAuthCache = new Map();
const inFlightUserFetches = new Map();

const USER_CACHE_TTL_MS = parseInt(process.env.USER_AUTH_CACHE_TTL_MS || '15000', 10);
const MAX_CACHE_ENTRIES = 2000;

const USER_EXCLUDE_ATTRIBUTES = [
  'password',
  'two_factor_secret',
  'transaction_pin_hash',
  'transaction_pin_failed_attempts',
  'transaction_pin_locked_until',
  'transaction_pin_last_changed_at',
  'transaction_pin_last_verified_at',
  'transaction_pin_recovery_otp_hash',
  'transaction_pin_recovery_otp_expires_at',
  'transaction_pin_recovery_otp_sent_at',
];

const fetchUserFromDb = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: {
      exclude: USER_EXCLUDE_ATTRIBUTES,
    },
  });
  return user ? user.get({ plain: true }) : null;
};

const getCachedUser = async (userId) => {
  const key = String(userId);
  const now = Date.now();

  const cached = userAuthCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Deduplicate concurrent in-flight fetches for the same userId
  if (inFlightUserFetches.has(key)) {
    return inFlightUserFetches.get(key);
  }

  const fetchPromise = (async () => {
    try {
      const userData = await fetchUserFromDb(userId);
      if (userAuthCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = userAuthCache.keys().next().value;
        userAuthCache.delete(oldestKey);
      }
      userAuthCache.set(key, {
        data: userData,
        expiresAt: Date.now() + (userData ? USER_CACHE_TTL_MS : 2000),
      });
      return userData;
    } finally {
      inFlightUserFetches.delete(key);
    }
  })();

  inFlightUserFetches.set(key, fetchPromise);
  return fetchPromise;
};

const invalidateUserAuthCache = (userId) => {
  if (!userId) return;
  const key = String(userId);
  userAuthCache.delete(key);
  inFlightUserFetches.delete(key);
};

const clearUserAuthCache = () => {
  userAuthCache.clear();
  inFlightUserFetches.clear();
};

const getUserAuthCacheStats = () => ({
  size: userAuthCache.size,
  inFlight: inFlightUserFetches.size,
  ttlMs: USER_CACHE_TTL_MS,
});

const protect = async (req, res, next) => {
  const token = getAccessTokenFromRequest(req);

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test_jwt_secret_key_12345' : '');
      const decoded = jwt.verify(token, secret);

      const plainUserData = await getCachedUser(decoded.id);

      if (!plainUserData) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }

      req.user = User.build(plainUserData, { isNewRecord: false });

      return next();
    } catch (error) {
      logger.error('Auth protect error:', { error: error.message, token: token ? 'provided' : 'none' });
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
};

const admin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    next();
  } else {
    logger.warn('Admin Access Denied:', { userId: req.user?.id, role: req.user?.role });
    res.status(403).json({ success: false, message: 'Not authorized as an admin' });
  }
};

const reseller = (req, res, next) => {
  if (req.user && (req.user.role === 'reseller' || req.user.role === 'admin')) {
    next();
  } else {
    logger.warn('Reseller Access Denied:', { userId: req.user?.id, role: req.user?.role });
    res.status(403).json({ success: false, message: 'Not authorized as a reseller' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logger.warn('Role Access Denied:', { userId: req.user?.id, role: req.user?.role, required: roles });
      return res.status(403).json({ 
        success: false,
        message: `Role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route` 
      });
    }
    next();
  };
};

module.exports = {
  protect,
  admin,
  reseller,
  authorize,
  invalidateUserAuthCache,
  clearUserAuthCache,
  getUserAuthCacheStats,
};
