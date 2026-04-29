const logger = require('../utils/logger');
const transactionPinService = require('../services/transactionPinService');

function requireTransactionPinSession(scope = 'financial') {
  return (req, res, next) => {
    try {
      const token = req.headers['x-transaction-pin-token'] || req.headers['x-transaction-authorization'];
      transactionPinService.verifySessionToken(token, req.user?.id, scope);
      return next();
    } catch (error) {
      logger.warn('[PIN] Transaction route denied', {
        userId: req.user?.id,
        path: req.originalUrl,
        method: req.method,
        code: error.code,
        message: error.message,
      });

      return res.status(Number(error.status || 403)).json({
        success: false,
        code: error.code || 'TRANSACTION_PIN_REQUIRED',
        message: error.message || 'Transaction PIN validation is required',
      });
    }
  };
}

module.exports = {
  requireTransactionPinSession,
};
