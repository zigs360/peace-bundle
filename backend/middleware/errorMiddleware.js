const logger = require('../utils/logger');

// Not Found Handler
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global Error Handler
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Handle Multer errors
  if (err.name === 'MulterError' || err.message.includes('Error: KYC documents') || err.message.includes('Error: Invalid file type')) {
    statusCode = 400;
  }

  // Log the error
  logger.error(`${statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  if (statusCode === 500) {
      logger.error(err.stack);
  }

  res.status(statusCode);
  res.json({
    success: false,
    message: err.message,
    // Only show stack trace in development
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler };
