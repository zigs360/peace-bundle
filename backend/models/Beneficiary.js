const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const crypto = require('crypto');

const Beneficiary = sequelize.define('Beneficiary', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  network: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bankName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
});

module.exports = Beneficiary;
