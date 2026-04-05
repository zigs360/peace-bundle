const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const PricingRule = sequelize.define(
  'PricingRule',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    tierId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    product_type: {
      type: DataTypes.ENUM('airtime', 'data', 'subscription'),
      allowNull: false,
    },
    provider: {
      type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
      allowNull: true,
    },
    dataPlanId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    subscriptionPlanId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    fixed_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    base_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    markup_percent: {
      type: DataTypes.DECIMAL(7, 3),
      allowNull: true,
    },
    discount_percent: {
      type: DataTypes.DECIMAL(7, 3),
      allowNull: true,
    },
    min_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    max_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    starts_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ends_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ['tierId', 'product_type', 'is_active'] },
      { fields: ['provider'] },
      { fields: ['dataPlanId'] },
      { fields: ['subscriptionPlanId'] },
      { fields: ['starts_at', 'ends_at'] },
    ],
  },
);

module.exports = PricingRule;
