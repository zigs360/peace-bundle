const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const ApiProvider = sequelize.define('ApiProvider', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  service_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'all', // 'data', 'airtime', 'vtu', 'sim_management', 'all'
  },
  base_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  api_key: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  secret_key: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  public_key: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  headers: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
  capabilities: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: ['vtu_data', 'vtu_airtime', 'sim_hosting', 'ussd'],
  },
  endpoint_map: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      devices: '/devices',
      data_purchase: '/data',
      airtime_purchase: '/airtime',
      balance: '/balance',
      ussd: '/ussd',
    },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
}, {
  tableName: 'api_providers',
  timestamps: true,
});

module.exports = ApiProvider;
