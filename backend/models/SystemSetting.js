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

// In-memory cache for ultra-fast lookups without querying the database on every request
const settingCache = new Map();
let isCachePreloaded = false;
let lastPreloadTime = 0;

// Preload all system settings into memory once on startup
SystemSetting.preloadCache = async function() {
  try {
    const settings = await this.findAll();
    settingCache.clear();
    for (const s of settings) {
      const parsed = this.castValue(s.value, s.type);
      settingCache.set(s.key, {
        value: parsed,
        rawValue: s.value,
        type: s.type,
        group: s.group,
        description: s.description,
        timestamp: Date.now()
      });
    }
    isCachePreloaded = true;
    lastPreloadTime = Date.now();
    return settingCache.size;
  } catch (error) {
    // If DB is temporarily unavailable or in test mode before table exists
    return 0;
  }
};

// Static Methods
SystemSetting.get = async function(key, defaultValue = null) {
  if (settingCache.has(key)) {
    const entry = settingCache.get(key);
    return entry.value !== undefined ? entry.value : defaultValue;
  }

  // If cache is preloaded and key is not found, avoid hitting DB repeatedly
  if (isCachePreloaded) {
    return defaultValue;
  }

  // Fallback for cold start or un-preloaded state
  const setting = await this.findOne({ where: { key } });
  
  if (!setting) {
    settingCache.set(key, { value: defaultValue, timestamp: Date.now() });
    return defaultValue;
  }

  const parsed = this.castValue(setting.value, setting.type);
  settingCache.set(key, {
    value: parsed,
    rawValue: setting.value,
    type: setting.type,
    group: setting.group,
    description: setting.description,
    timestamp: Date.now()
  });
  return parsed;
};

// Return a Map of all settings from in-memory cache (or warm if not yet preloaded)
SystemSetting.getCacheMap = async function() {
  if (!isCachePreloaded) {
    await this.preloadCache();
  }
  const map = new Map();
  for (const [k, v] of settingCache.entries()) {
    map.set(k, v.value);
  }
  return map;
};

// Return all settings as key-value plain object from in-memory cache
SystemSetting.getAllCached = async function() {
  if (!isCachePreloaded) {
    await this.preloadCache();
  }
  const result = {};
  for (const [k, v] of settingCache.entries()) {
    result[k] = v.value;
  }
  return result;
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

  const parsed = this.castValue(setting.value, setting.type);
  settingCache.set(key, {
    value: parsed,
    rawValue: setting.value,
    type: setting.type,
    group: setting.group,
    description: setting.description,
    timestamp: Date.now()
  });
  return setting;
};

SystemSetting.clearCache = function() {
  settingCache.clear();
  isCachePreloaded = false;
};

SystemSetting.refreshCache = async function() {
  return await this.preloadCache();
};

SystemSetting.isPreloaded = function() {
  return isCachePreloaded;
};

module.exports = SystemSetting;
