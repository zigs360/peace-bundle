const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const CallPlan = sequelize.define('CallPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  provider: {
    type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  validityDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
  type: {
    type: DataTypes.ENUM('voice', 'sms'), // For call subscriptions, it's primarily voice
    defaultValue: 'voice',
  },
  // Optional: If plans can be created by specific users (e.g., admins)
  // userId: {
  //   type: DataTypes.UUID,
  //   allowNull: true,
  // },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['provider'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['type'],
    },
  ],
});

module.exports = CallPlan;
