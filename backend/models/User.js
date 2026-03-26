const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('user', 'admin', 'reseller'),
    defaultValue: 'user',
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // balance field removed, moved to Wallet model
  kyc_status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'none'),
    defaultValue: 'none',
  },
  kyc_document: {
    type: DataTypes.STRING, // Path to file
    allowNull: true,
  },
  kyc_rejection_reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  kyc_submitted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  kyc_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  bvn: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: {
      len: [11, 11], // BVN is always 11 digits
    },
  },
  nin: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: {
      len: [11, 11], // NIN is usually 11 digits
    },
  },
  is_bvn_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  bvn_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  referral_code: {
    type: DataTypes.STRING,
    unique: true,
  },
  referred_by: {
    type: DataTypes.STRING, // Store referral code of the referrer
    allowNull: true,
  },
  is_two_factor_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  two_factor_secret: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    allowNull: true,
  },
  account_status: {
    type: DataTypes.ENUM('active', 'suspended', 'banned'),
    defaultValue: 'active',
  },
  package: {
    type: DataTypes.STRING,
    defaultValue: 'Standard',
  },
  // Virtual Account Details
  virtual_account_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  virtual_account_bank: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  virtual_account_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  lockout_until: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  timestamps: true,
  paranoid: true, // Soft delete
});

// Auto-create wallet and virtual account on user creation
User.afterCreate(async (user, options) => {
  const Wallet = require('./Wallet');
  const logger = require('../utils/logger');
  
  const { transaction } = options;

  try {
    logger.info(`[AUDIT] Starting automated setup for new user: ${user.email} (${user.id})`);

    // 1. Create Wallet
    // Ensure Wallet model is loaded and we have a valid reference
    const wallet = await Wallet.create({ userId: user.id }, { transaction });
    logger.info(`[AUDIT] Wallet created successfully for user: ${user.email} (Wallet ID: ${wallet.id})`);

    // 2. Assign Virtual Account (Non-blocking)
    // We make this non-blocking for registration to ensure the user can at least register 
    // even if the virtual account provider is temporarily down or keys are misconfigured.
    
    // In test environment, skip background assignment to avoid Jest teardown errors
    if (process.env.NODE_ENV === 'test') {
      logger.info(`[AUDIT] Skipping background VA assignment in test mode for user: ${user.email}`);
      return;
    }

    // Use a small delay to ensure transaction is committed before external service tries to update user
    setTimeout(async () => {
      try {
        const VirtualAccountService = require('../services/virtualAccountService');
        const accountDetails = await VirtualAccountService.assignVirtualAccount(user);
        
        if (accountDetails) {
          logger.info(`[AUDIT] Virtual account assigned successfully for user: ${user.email}`);
          // Send notification to user about their new virtual account
          try {
            await VirtualAccountService.notifyUserOfNewAccount(user);
          } catch (notifErr) {
            logger.warn(`[AUDIT] Failed to notify user ${user.email} of new account: ${notifErr.message}`);
          }
        } else {
          logger.warn(`[AUDIT] Virtual account assignment returned no details for user: ${user.email}`);
        }
      } catch (err) {
        logger.error(`[AUDIT] Virtual account assignment FAILED for user: ${user.email}. Error: ${err.message}`);
      }
    }, 2000); // 2 second delay to ensure DB transaction is finalized

  } catch (error) {
    logger.error(`[AUDIT] Automated setup FAILED for user: ${user.email}. Error: ${error.message}`);
    // Only re-throw for wallet creation as it's critical
    throw error;
  }
});

module.exports = User;
