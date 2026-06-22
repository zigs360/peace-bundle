const User = require('../models/User');
const accountDeletionService = require('../services/accountDeletionService');
const logger = require('../utils/logger');

async function loadUser(req) {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw accountDeletionService.makeError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

function handleError(res, error, context = {}) {
  const status = Number(error.status || 500);
  if (status >= 500) {
    logger.error('[AccountDeletion] Controller failure', {
      message: error.message,
      code: error.code,
      ...context,
    });
  } else {
    logger.warn('[AccountDeletion] Controller rejection', {
      message: error.message,
      code: error.code,
      ...context,
    });
  }

  return res.status(status).json({
    success: false,
    code: error.code || 'ACCOUNT_DELETION_ERROR',
    message: error.message || 'Account deletion request failed',
  });
}

const getAccountDeletionStatus = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await accountDeletionService.getUserRequestStatus(user);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'status' });
  }
};

const sendAccountDeletionVerificationCode = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await accountDeletionService.requestVerificationOtp(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Verification code sent successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'send_verification' });
  }
};

const submitAccountDeletionRequest = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await accountDeletionService.submitDeletionRequest(user, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(201).json({
      success: true,
      message: 'Account deletion request submitted successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'submit_request' });
  }
};

const cancelAccountDeletionRequest = async (req, res) => {
  try {
    const user = await loadUser(req);
    const result = await accountDeletionService.cancelDeletionRequest(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Account deletion request cancelled successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { userId: req.user?.id, action: 'cancel_request' });
  }
};

module.exports = {
  getAccountDeletionStatus,
  sendAccountDeletionVerificationCode,
  submitAccountDeletionRequest,
  cancelAccountDeletionRequest,
};
