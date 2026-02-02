const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Sim = sequelize.define('Sim', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // SIM Details
  phoneNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    field: 'phone_number' // Mapping camelCase to snake_case column
  },
  provider: {
    type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('device_based', 'sim_system'),
    defaultValue: 'device_based',
  },

  // Balance Monitoring
  airtimeBalance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'airtime_balance'
  },
  dataBalanceMb: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'data_balance_mb'
  },
  lowBalanceThreshold: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 200,
    field: 'low_balance_threshold'
  },
  lastBalanceCheck: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_balance_check'
  },

  // Status
  status: {
    type: DataTypes.ENUM('active', 'paused', 'banned', 'inactive'),
    defaultValue: 'active',
  },
  statusReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'status_reason'
  },

  // Usage Stats
  totalDispenses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_dispenses'
  },
  failedDispenses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'failed_dispenses'
  },
  dailyDispenses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'daily_dispenses'
  },
  dailyResetDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'daily_reset_date'
  },

  // Validation
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_verified'
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'verified_at'
  },

  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  timestamps: true,
  paranoid: true, // Soft Delete
  indexes: [
    {
      unique: true,
      fields: ['phone_number']
    }
  ],
  scopes: {
    active: {
      where: {
        status: 'active'
      }
    },
    byProvider(provider) {
      return {
        where: {
          provider: provider
        }
      }
    }
  }
});

// Instance Methods
Sim.prototype.isLowBalance = function() {
  return this.airtimeBalance !== null && 
         parseFloat(this.airtimeBalance) < parseFloat(this.lowBalanceThreshold);
};

Sim.prototype.resetDailyDispenses = async function() {
  const today = new Date().toISOString().split('T')[0];
  if (this.dailyResetDate !== today) {
    this.dailyDispenses = 0;
    this.dailyResetDate = today;
    await this.save();
  }
};

Sim.prototype.incrementDispenses = async function(failed = false) {
  await this.resetDailyDispenses();
  
  this.totalDispenses += 1;
  this.dailyDispenses += 1;
  
  if (failed) {
    this.failedDispenses += 1;
  }
  
  await this.save();
};

module.exports = Sim;
