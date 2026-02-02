const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const WalletTransaction = sequelize.define('WalletTransaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  walletId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Wallets', // Assuming table name is Wallets
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('credit', 'debit'),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  balance_before: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  balance_after: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true, // e.g., 'paystack', 'bank_transfer', 'system'
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true, // Ensure transaction references are unique
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB, // Use JSONB for Postgres
    allowNull: true,
  },
}, {
  timestamps: true,
});

module.exports = WalletTransaction;
