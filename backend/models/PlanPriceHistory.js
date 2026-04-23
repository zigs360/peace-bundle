const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const PlanPriceHistory = sequelize.define(
  'PlanPriceHistory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    planIdRef: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'plan_id_ref',
    },
    field_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    old_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    new_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    old_value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    new_value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    changed_by: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'plan_price_history',
    createdAt: 'changed_at',
    updatedAt: false,
    indexes: [
      { fields: ['plan_id_ref'] },
      { fields: ['field_name'] },
      { fields: ['changed_by'] },
      { fields: ['changed_at'] },
    ],
  },
);

module.exports = PlanPriceHistory;
