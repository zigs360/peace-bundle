const accountDeletionService = require('../services/accountDeletionService');
const logger = require('../utils/logger');

function handleError(res, error, context = {}) {
  const status = Number(error.status || 500);
  if (status >= 500) {
    logger.error('[AccountDeletion][Admin] Controller failure', {
      message: error.message,
      code: error.code,
      ...context,
    });
  } else {
    logger.warn('[AccountDeletion][Admin] Controller rejection', {
      message: error.message,
      code: error.code,
      ...context,
    });
  }

  return res.status(status).json({
    success: false,
    code: error.code || 'ACCOUNT_DELETION_ERROR',
    message: error.message || 'Failed to process account deletion request',
  });
}

const listAccountDeletionRequests = async (req, res) => {
  try {
    const result = await accountDeletionService.listDeletionRequests(req.query || {});
    return res.json(result);
  } catch (error) {
    return handleError(res, error, { adminId: req.user?.id, action: 'list' });
  }
};

const getAccountDeletionRequestDetail = async (req, res) => {
  try {
    const result = await accountDeletionService.getDeletionRequestDetail(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, { adminId: req.user?.id, requestId: req.params.id, action: 'detail' });
  }
};

const approveAccountDeletionRequest = async (req, res) => {
  try {
    const result = await accountDeletionService.approveDeletionRequest(req.user, req.params.id, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Account deletion request approved successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { adminId: req.user?.id, requestId: req.params.id, action: 'approve' });
  }
};

const rejectAccountDeletionRequest = async (req, res) => {
  try {
    const result = await accountDeletionService.rejectDeletionRequest(req.user, req.params.id, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Account deletion request rejected successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { adminId: req.user?.id, requestId: req.params.id, action: 'reject' });
  }
};

const executeAccountDeletionRequest = async (req, res) => {
  try {
    const result = await accountDeletionService.executeDeletion(req.user, req.params.id, req.body || {}, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({
      success: true,
      message: 'Account deletion executed successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, { adminId: req.user?.id, requestId: req.params.id, action: 'execute' });
  }
};

module.exports = {
  listAccountDeletionRequests,
  getAccountDeletionRequestDetail,
  approveAccountDeletionRequest,
  rejectAccountDeletionRequest,
  executeAccountDeletionRequest,
};
