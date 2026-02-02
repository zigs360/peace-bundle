const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Wallet = sequelize.define('Wallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  bonus_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
  commission_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
  },
}, {
  timestamps: true,
});

module.exports = Wallet;
