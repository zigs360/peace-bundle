const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AdminOgdamsDataPurchase = sequelize.define(
  'AdminOgdamsDataPurchase',
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
    simId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sim_id',
    },
    dataPlanId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'data_plan_id',
    },
    recipientPhone: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'recipient_phone',
    },
    provider: {
      type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
      allowNull: false,
    },
    ogdamsSku: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'ogdams_sku',
    },
    costToSim: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'cost_to_sim',
    },
    status: {
      type: DataTypes.ENUM('reserved', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'reserved',
    },
    providerReference: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'provider_reference',
    },
    providerResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_response',
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'failure_reason',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
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
    tableName: 'admin_ogdams_data_purchases',
    indexes: [
      { fields: ['admin_id'] },
      { fields: ['user_id'] },
      { fields: ['sim_id'] },
      { fields: ['data_plan_id'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      { unique: true, fields: ['reference'] },
    ],
  }
);

module.exports = AdminOgdamsDataPurchase;

