const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReferralClick = sequelize.define('ReferralClick', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  referrerId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  referredUserId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  referral_code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  click_token: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  landing_path: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ip_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  user_agent_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  converted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'referral_clicks',
  indexes: [
    {
      unique: true,
      fields: ['referral_code', 'click_token'],
      name: 'referral_clicks_code_token_unique',
    },
  ],
});

module.exports = ReferralClick;
