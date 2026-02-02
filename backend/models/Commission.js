const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Commission = sequelize.define('Commission', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // referrer_id added by association
  // referred_user_id added by association
  
  type: {
    type: DataTypes.ENUM('funding', 'transaction'),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  source_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  commission_rate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
  },
  
  // Polymorphic Relation Fields
  commissionableId: {
    type: DataTypes.UUID, // Assuming Transaction IDs are UUIDs
    allowNull: false,
    field: 'commissionable_id'
  },
  commissionableType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'commissionable_type'
  },
  
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'cancelled'),
    defaultValue: 'pending',
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paid_at'
  }
}, {
  timestamps: true,
  tableName: 'commissions',
  scopes: {
    pending: {
      where: { status: 'pending' }
    },
    paid: {
      where: { status: 'paid' }
    }
  }
});

// Instance Methods
Commission.prototype.markAsPaid = async function() {
  this.status = 'paid';
  this.paid_at = new Date();
  await this.save();
};

module.exports = Commission;
