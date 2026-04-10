const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AdminOgdamsDataPurchaseAudit = sequelize.define(
  'AdminOgdamsDataPurchaseAudit',
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
    simIccidLast4: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'sim_iccid_last4',
    },
    ogdamsSku: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'ogdams_sku',
    },
    eventType: {
      type: DataTypes.ENUM('reserved', 'provider_requested', 'completed', 'failed', 'reversed'),
      allowNull: false,
      field: 'event_type',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
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
    tableName: 'admin_ogdams_data_purchase_audits',
    indexes: [
      { fields: ['purchase_id'] },
      { fields: ['admin_id'] },
      { fields: ['user_id'] },
      { fields: ['sim_id'] },
      { fields: ['event_type'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = AdminOgdamsDataPurchaseAudit;

