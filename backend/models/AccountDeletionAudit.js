const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AccountDeletionAudit = sequelize.define(
  'AccountDeletionAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'request_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
    },
    actorType: {
      type: DataTypes.ENUM('user', 'admin', 'system'),
      allowNull: false,
      field: 'actor_type',
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'event_type',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'success',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'account_deletion_audits',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['request_id'] },
      { fields: ['user_id'] },
      { fields: ['admin_id'] },
      { fields: ['actor_type'] },
      { fields: ['event_type'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = AccountDeletionAudit;
