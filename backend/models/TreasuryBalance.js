const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TreasuryBalance = sequelize.define(
  'TreasuryBalance',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    balance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'NGN',
    },
  },
  {
    timestamps: true,
    tableName: 'treasury_balances',
  }
);

module.exports = TreasuryBalance;

