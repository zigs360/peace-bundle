const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const crypto = require('crypto');

const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN',
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'quarterly', 'annual'),
    defaultValue: 'monthly',
  },
  features: {
    type: DataTypes.JSON, // Array of strings: ["Feature 1", "Feature 2"]
    defaultValue: [],
  },
  usage_limits: {
    type: DataTypes.JSON, // Object: { "daily_transactions": 100, "max_wallet_balance": 500000 }
    defaultValue: {},
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  promo_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  promo_start_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  promo_end_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  }
}, {
  timestamps: true,
  paranoid: true,
});

module.exports = SubscriptionPlan;
