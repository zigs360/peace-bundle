const logger = require('../utils/logger');
const crypto = require('crypto');

// Not Found Handler
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global Error Handler
const errorHandler = (err, req, res, next) => {
  const requestIdHeader = req.headers['x-request-id'] || req.headers['x-correlation-id'] || null;
  const requestId = requestIdHeader ? String(requestIdHeader) : crypto.randomUUID();

  let statusCode = Number(err?.statusCode || err?.status) || (res.statusCode === 200 ? 500 : res.statusCode);
  
  // Handle Multer errors
  if (err.name === 'MulterError' || err.message.includes('Error: KYC documents') || err.message.includes('Error: Invalid file type')) {
    statusCode = 400;
  }

  const isUniqueConstraint =
    err?.name === 'SequelizeUniqueConstraintError' ||
    err?.original?.code === '23505';
  if (isUniqueConstraint && statusCode >= 500) {
    statusCode = 409;
  }

  // Log the error
  logger.error('Request failed', {
    requestId,
    statusCode,
    code: err?.code || null,
    message: err?.message,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });
  if (statusCode === 500) {
      logger.error(err.stack);
  }

  res.status(statusCode);
  res.json({
    success: false,
    requestId,
    code: err?.code || null,
    message: err.message,
    // Only show stack trace in development
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler };
