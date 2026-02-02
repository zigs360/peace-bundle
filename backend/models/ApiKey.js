const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const crypto = require('crypto');

const ApiKey = sequelize.define('ApiKey', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  // user_id added by association
  
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  key: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  secret: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at'
  }
}, {
  timestamps: true,
  tableName: 'api_keys',
  hooks: {
    beforeValidate: (apiKey) => { // Use beforeValidate to ensure fields are populated before validation checks
      if (!apiKey.key) {
        apiKey.key = 'vtu_' + crypto.randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
      }
      if (!apiKey.secret) {
        apiKey.secret = crypto.randomBytes(32).toString('hex'); // 32 bytes = 64 hex chars
      }
    }
  }
});

// Instance Methods
ApiKey.prototype.recordUsage = async function() {
  this.last_used_at = new Date();
  await this.save({ fields: ['last_used_at'] }); // Only update specific field for efficiency
};

module.exports = ApiKey;
