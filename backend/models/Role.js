const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const crypto = require('crypto');

const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
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
