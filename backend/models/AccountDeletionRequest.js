const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const AccountDeletionRequest = sequelize.define(
  'AccountDeletionRequest',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    status: {
      type: DataTypes.ENUM('pending', 'cancelled', 'rejected', 'approved', 'completed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'requested_at',
      defaultValue: DataTypes.NOW,
    },
    graceEndsAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'grace_ends_at',
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancelled_at',
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    requestReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'request_reason',
    },
    adminReviewReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'admin_review_reason',
    },
    executionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'execution_reason',
    },
    retentionAcknowledged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'retention_acknowledged',
    },
    approvedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by_admin_id',
    },
    rejectedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'rejected_by_admin_id',
    },
    executedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'executed_by_admin_id',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'account_deletion_requests',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['grace_ends_at'] },
      { fields: ['approved_by_admin_id'] },
      { fields: ['rejected_by_admin_id'] },
      { fields: ['executed_by_admin_id'] },
      { fields: ['createdAt'] },
    ],
  }
);

module.exports = AccountDeletionRequest;
