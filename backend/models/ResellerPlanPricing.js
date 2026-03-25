const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

const ResellerPlanPricing = sequelize.define('ResellerPlanPricing', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // user_id will be added by association
  // data_plan_id will be added by association
  custom_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  }
}, {
  timestamps: true,
  tableName: 'reseller_plan_pricing'
});

module.exports = ResellerPlanPricing;
