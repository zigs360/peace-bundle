const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VoiceBundle = sequelize.define('VoiceBundle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  network: {
    type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
    allowNull: false,
  },
  plan_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  validity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  api_plan_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  }
}, {
  timestamps: true,
  tableName: 'voice_bundles',
});

module.exports = VoiceBundle;
