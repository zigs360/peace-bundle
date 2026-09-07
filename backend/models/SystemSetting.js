const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly

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

// In-memory cache for fast lookups without hammering the database
const settingCache = new Map();
const SETTING_CACHE_TTL_MS = 30000; // 30 seconds cache TTL

// Static Methods
SystemSetting.get = async function(key, defaultValue = null) {
  const cached = settingCache.get(key);
  if (cached && (Date.now() - cached.timestamp < SETTING_CACHE_TTL_MS)) {
    return cached.value !== undefined ? cached.value : defaultValue;
  }

  const setting = await this.findOne({ where: { key } });
  
  if (!setting) {
    settingCache.set(key, { value: defaultValue, timestamp: Date.now() });
    return defaultValue;
  }

  const parsed = this.castValue(setting.value, setting.type);
  settingCache.set(key, { value: parsed, timestamp: Date.now() });
  return parsed;
};

SystemSetting.set = async function(key, value, type = 'string', group = 'general', description = null) {
  settingCache.delete(key);

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

  const parsed = this.castValue(setting.value, setting.type);
  settingCache.set(key, { value: parsed, timestamp: Date.now() });
  return setting;
};

SystemSetting.clearCache = function() {
  settingCache.clear();
};

module.exports = SystemSetting;
