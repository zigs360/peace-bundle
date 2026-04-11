const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AdminWalletDeductionAudit = sequelize.define(
  'AdminWalletDeductionAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    deductionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'deduction_id',
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
    eventType: {
      type: DataTypes.ENUM('deducted', 'reversed'),
      allowNull: false,
      field: 'event_type',
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
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
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    updatedAt: false,
    tableName: 'admin_wallet_deduction_audits',
    indexes: [
      { fields: ['deduction_id'] },
      { fields: ['admin_id'] },
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = AdminWalletDeductionAudit;

