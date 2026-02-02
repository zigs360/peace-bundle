const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  guard_name: {
    type: DataTypes.STRING,
    defaultValue: 'web', // mimicking spatie
  }
}, {
  timestamps: true,
});

module.exports = Role;
