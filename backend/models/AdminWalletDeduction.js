const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AdminWalletDeduction = sequelize.define(
  'AdminWalletDeduction',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'admin_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    balanceBefore: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'balance_before',
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'balance_after',
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'transaction_id',
    },
    status: {
      type: DataTypes.ENUM('completed', 'reversed'),
      allowNull: false,
      defaultValue: 'completed',
    },
    reversedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reversed_at',
    },
    reversalTransactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reversal_transaction_id',
    },
    idempotencyKeyHash: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'idempotency_key_hash',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    tableName: 'admin_wallet_deductions',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['admin_id'] },
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = AdminWalletDeduction;

