const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const VoiceBundlePurchaseAudit = sequelize.define(
  'VoiceBundlePurchaseAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    purchaseId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'purchase_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    eventType: {
      type: DataTypes.ENUM('created', 'completed', 'failed', 'refunded'),
      allowNull: false,
      field: 'event_type',
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
    tableName: 'voice_bundle_purchase_audits',
    indexes: [
      { fields: ['purchase_id'] },
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = VoiceBundlePurchaseAudit;

