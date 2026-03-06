const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

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
