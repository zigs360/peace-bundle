const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const TransactionPinSecurityEvent = sequelize.define(
  'TransactionPinSecurityEvent',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    eventType: {
      type: DataTypes.ENUM(
        'pin_created',
        'pin_changed',
        'pin_recovery_otp_requested',
        'pin_recovery_otp_verified',
        'pin_recovery_failed',
        'pin_recovered',
        'pin_verification_failed',
        'pin_locked',
        'pin_session_created'
      ),
      allowNull: false,
      field: 'event_type',
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'info'),
      allowNull: false,
      defaultValue: 'info',
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'user_agent',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'transaction_pin_security_events',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = TransactionPinSecurityEvent;
