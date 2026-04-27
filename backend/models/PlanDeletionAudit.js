const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const crypto = require('crypto');

const PlanDeletionAudit = sequelize.define(
  'PlanDeletionAudit',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => crypto.randomUUID(),
      primaryKey: true,
    },
    planIdRef: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'plan_id_ref',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
    },
    action_scope: {
      type: DataTypes.ENUM('single', 'bulk'),
      allowNull: false,
      defaultValue: 'single',
    },
    bulk_action_id: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'bulk_action_id',
    },
    deleted_by: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deletion_mode: {
      type: DataTypes.ENUM('soft', 'hard'),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    related_counts: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    plan_snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'plan_deletion_audits',
    createdAt: 'deleted_at',
    updatedAt: false,
    indexes: [
      { fields: ['plan_id_ref'] },
      { fields: ['admin_id'] },
      { fields: ['action_scope'] },
      { fields: ['bulk_action_id'] },
      { fields: ['deleted_by'] },
      { fields: ['deleted_at'] },
    ],
  },
);

module.exports = PlanDeletionAudit;
