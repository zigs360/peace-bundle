const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const TreasuryLedgerEntry = sequelize.define(
  'TreasuryLedgerEntry',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('credit', 'debit'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'completed',
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    balance_before: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    balance_after: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: 'treasury_ledger_entries',
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['source'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['reference'] },
    ],
  }
);

module.exports = TreasuryLedgerEntry;

