const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const WebhookEvent = sequelize.define(
  'WebhookEvent',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('received', 'rejected', 'verified', 'processed', 'failed'),
      allowNull: false,
      defaultValue: 'received',
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    signature_header: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signature_present: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    raw_body_base64: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_attempt_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ['provider'] },
      { fields: ['status'] },
      { fields: ['reference'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = WebhookEvent;

