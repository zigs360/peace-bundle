const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const PricingAuditLog = sequelize.define(
  'PricingAuditLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM('create', 'update', 'delete'),
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.ENUM('pricing_tier', 'pricing_rule'),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    before: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    after: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [{ fields: ['entity_type', 'entity_id'] }, { fields: ['adminId'] }, { fields: ['createdAt'] }],
  },
);

module.exports = PricingAuditLog;
