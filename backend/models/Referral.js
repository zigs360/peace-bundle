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
