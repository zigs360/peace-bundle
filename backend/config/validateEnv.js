const logger = require('../utils/logger');

const criticalEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET'
];

const serviceEnvVars = [
  'PAYVESSEL_API_KEY',
  'PAYVESSEL_SECRET_KEY',
  'PAYVESSEL_BUSINESS_ID',
  'SMEPLUG_API_KEY',
  'SMEPLUG_SECRET_KEY',
  'SMEPLUG_BASE_URL',
  'OGDAMS_API_KEY',
  'BILLSTACK_BASE_URL',
  'BILLSTACK_SECRET_KEY',
  'BILLSTACK_PUBLIC_KEY',
  'BILLSTACK_WEBHOOK_SECRET'
];

const validateEnv = () => {
  const missingCritical = criticalEnvVars.filter((key) => !process.env[key]);
  if (missingCritical.length > 0) {
    logger.error(`CRITICAL: Missing essential environment variables: ${missingCritical.join(', ')}. App cannot start.`);
    process.exit(1);
  }

  const missingServices = serviceEnvVars.filter((key) => !process.env[key]);
  if (missingServices.length > 0) {
    logger.warn(`WARNING: Missing service API keys: ${missingServices.join(', ')}. Some features like virtual accounts or data purchase may fail.`);
  }
};

module.exports = validateEnv;
