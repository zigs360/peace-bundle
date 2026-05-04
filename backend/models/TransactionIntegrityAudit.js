const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const TransactionIntegrityAudit = sequelize.define(
  'TransactionIntegrityAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'transaction_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'event_type',
    },
    severity: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'info',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'open',
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
  },
  {
    tableName: 'transaction_integrity_audits',
    timestamps: true,
    indexes: [
      { fields: ['transaction_id'] },
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  },
);

module.exports = TransactionIntegrityAudit;
