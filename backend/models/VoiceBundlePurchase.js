const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const VoiceBundlePurchase = sequelize.define(
  'VoiceBundlePurchase',
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    callPlanId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'call_plan_id',
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'transaction_id',
    },
    provider: {
      type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
      allowNull: false,
    },
    recipientPhoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'recipient_phone_number',
    },
    amountCharged: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'amount_charged',
    },
    minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    validityDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'validity_days',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    apiPlanId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'api_plan_id',
    },
    providerReference: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'provider_reference',
    },
    status: {
      type: DataTypes.ENUM('processing', 'completed', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'processing',
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'failure_reason',
    },
    bundleCategory: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'minute',
      field: 'bundle_category',
    },
    migratedFromPurchaseId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'migrated_from_purchase_id',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    tableName: 'voice_bundle_purchases',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['userId'] },
      { fields: ['call_plan_id'] },
      { fields: ['transaction_id'] },
      { fields: ['provider'] },
      { fields: ['status'] },
      { fields: ['bundle_category'] },
      { fields: ['expires_at'] },
      { fields: ['migrated_from_purchase_id'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = VoiceBundlePurchase;
