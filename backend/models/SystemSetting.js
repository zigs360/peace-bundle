const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SystemSetting = sequelize.define('SystemSetting', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  key: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  value: {
    type: DataTypes.TEXT, // Can store JSON string
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'string', // string, integer, json, boolean
  },
  group: {
    type: DataTypes.STRING,
    defaultValue: 'general', // general, limits, commission, etc.
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'system_settings'
});

// Helper for casting values
SystemSetting.castValue = function(value, type) {
  switch(type) {
    case 'integer':
      return parseInt(value, 10);
    case 'boolean':
      return value === 'true' || value === true || value === '1' || value === 1;
    case 'json':
    case 'array':
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (e) {
        return value;
      }
    default:
      return value;
  }
};

// Static Methods
SystemSetting.get = async function(key, defaultValue = null) {
  const setting = await this.findOne({ where: { key } });
  
  if (!setting) {
    return defaultValue;
  }

  return this.castValue(setting.value, setting.type);
};

SystemSetting.set = async function(key, value, type = 'string', group = 'general', description = null) {
  const stringValue = (type === 'json' || type === 'array') && typeof value !== 'string' 
    ? JSON.stringify(value) 
    : String(value);

  const [setting, created] = await this.findOrCreate({
    where: { key },
    defaults: {
      value: stringValue,
      type,
      group,
      description
    }
  });

  if (!created) {
    setting.value = stringValue;
    setting.type = type; // Allow type update
    setting.group = group; // Allow group update
    if (description) setting.description = description;
    await setting.save();
  }

  return setting;
};

module.exports = SystemSetting;
