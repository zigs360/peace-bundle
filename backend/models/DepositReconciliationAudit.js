const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const DepositReconciliationAudit = sequelize.define(
  'DepositReconciliationAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    transactionReference: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'transaction_reference',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'wallet_id',
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'transaction_id',
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    gatewayProvider: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'gateway_provider',
    },
    accountNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'account_number',
    },
    reconciliationType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'historical_batch',
      field: 'reconciliation_type',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'settled',
    },
    isReconciled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_reconciled',
    },
    walletBalanceBefore: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'wallet_balance_before',
    },
    walletBalanceAfter: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'wallet_balance_after',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    timestampCredited: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'timestamp_credited',
    },
  },
  {
    tableName: 'deposit_reconciliation_audits',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['wallet_id'] },
      { fields: ['transaction_reference'] },
      { fields: ['status'] },
      { fields: ['gateway_provider'] },
      { fields: ['reconciliation_type'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = DepositReconciliationAudit;
