const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const Wallet = sequelize.define('Wallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  bonus_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  commission_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN',
  },
  status: {
    type: DataTypes.ENUM('active', 'frozen', 'restricted'),
    defaultValue: 'active',
  },
  daily_limit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 1000000.00, // Default 1M NGN
  },
  daily_spent: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  last_transaction_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true
  }
}, {
  timestamps: true,
});

module.exports = Wallet;
