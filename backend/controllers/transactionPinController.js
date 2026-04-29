const User = require('../models/User');
const logger = require('../utils/logger');
const transactionPinService = require('../services/transactionPinService');

async function loadUser(req) {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw transactionPinService.makeError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

function handleError(res, error, context = {}) {
  const status = Number(error.status || 500);
  if (status >= 500) {
    logger.error('[PIN] Controller failure', {
      message: error.message,
      code: error.code,
      ...context,
    });
  } else {
    logger.warn('[PIN] Controller rejection', {
      message: error.message,
      code: error.code,
      ...context,
    });
  }

  return res.status(status).json({
    success: false,
    code: error.code || 'TRANSACTION_PIN_ERROR',
    message: error.message || 'Transaction PIN request failed',
  });
}

const getTransactionPinStatus = async (req, res) => {
  try {
    const user = await loadUser(req);
    return res.json({
      success: true,
      data: transactionPinService.getStatus(user),
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'status' });
  }
};

const createTransactionPin = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await transactionPinService.setupPin(user, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(201).json({
      success: true,
      message: 'Transaction PIN created successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'create' });
  }
};

const changeTransactionPin = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await transactionPinService.changePin(user, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Transaction PIN updated successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'change' });
  }
};

const requestTransactionPinRecoveryOtp = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await transactionPinService.requestRecoveryOtp(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Recovery OTP sent successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'request_recovery_otp' });
  }
};

const recoverTransactionPin = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await transactionPinService.recoverPin(user, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Transaction PIN recovered successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'recover' });
  }
};

const createTransactionPinSession = async (req, res) => {
  try {
    const user = await loadUser(req);
    const session = await transactionPinService.createSession(user, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Transaction PIN verified',
      data: session,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'session' });
  }
};

module.exports = {
  getTransactionPinStatus,
  createTransactionPin,
  changeTransactionPin,
  requestTransactionPinRecoveryOtp,
  recoverTransactionPin,
  createTransactionPinSession,
};
