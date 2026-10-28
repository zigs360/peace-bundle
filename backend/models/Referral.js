const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const Referral = sequelize.define('Referral', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // referrer_id added by association
  // referred_user_id added by association
  
  registered_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'registered_at'
  },
  total_commissions_earned: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'total_commissions_earned'
  },
  total_transactions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_transactions'
  },
  referrer_signup_bonus_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'referrer_signup_bonus_amount'
  },
  referrer_signup_bonus_awarded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'referrer_signup_bonus_awarded_at'
  },
  referee_signup_bonus_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'referee_signup_bonus_amount'
  },
  referee_signup_bonus_awarded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'referee_signup_bonus_awarded_at'
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
    field: 'status'
  },
  bonus_status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'locked',
    field: 'bonus_status'
  },
  qualifying_deposit_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: null,
    field: 'qualifying_deposit_amount'
  },
  qualifying_deposit_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    field: 'qualifying_deposit_at'
  },
  qualifying_transaction_id: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    field: 'qualifying_transaction_id'
  },
  qualifying_transaction_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: null,
    field: 'qualifying_transaction_amount'
  },
  qualifying_transaction_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    field: 'qualifying_transaction_at'
  },
  flag_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    field: 'flag_reason'
  },
  flagged_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    field: 'flagged_at'
  },
  flagged_by: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
    field: 'flagged_by'
  },
  reversed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    field: 'reversed_at'
  },
  reversal_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    field: 'reversal_reason'
  },
  reversal_admin_id: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
    field: 'reversal_admin_id'
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    field: 'admin_notes'
  },
  referrerId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  referredUserId: {
    type: DataTypes.UUID,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'referrals'
});

module.exports = Referral;
