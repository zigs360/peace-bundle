const logger = require('../utils/logger');

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET'
];

const validateEnv = () => {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }
};

module.exports = validateEnv;
