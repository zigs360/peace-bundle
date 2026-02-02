const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

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
  account_status: {
    type: DataTypes.ENUM('active', 'suspended', 'banned'),
    defaultValue: 'active',
  },
  package: {
    type: DataTypes.STRING,
    defaultValue: 'Standard',
  }
}, {
  timestamps: true,
  paranoid: true, // Soft delete
});

// Auto-create wallet on user creation
User.afterCreate(async (user) => {
  const Wallet = require('./Wallet');
  try {
    await Wallet.create({ UserId: user.id });
  } catch (error) {
    console.error('Failed to create wallet for user:', user.id, error);
  }
});

module.exports = User;
