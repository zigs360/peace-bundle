const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const pricingService = require('../services/pricingService');

const extractDataSize = (name, fallback = null) => {
  const source = String(name || '').trim();
  if (!source) return fallback;
  const match = source.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  if (!match) return fallback;
  return `${match[1]}${match[2].toUpperCase()}`;
};

const slugify = (value, fallback = '') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const NETWORK_META = {
  mtn: { displayName: 'MTN', color: '#FFCC00', icon: '📡' },
  airtel: { displayName: 'Airtel', color: '#FF0000', icon: '📡' },
  glo: { displayName: 'Glo', color: '#008000', icon: '📡' },
  '9mobile': { displayName: '9mobile', color: '#006B3F', icon: '📡' },
};

const DataPlan = sequelize.define('DataPlan', {
  id: {
    type: DataTypes.INTEGER, // Using Integer as per "table->id()" default in Laravel usually implies BigInt/Integer auto-increment
    autoIncrement: true,
    primaryKey: true,
  },
  provider: {
    type: DataTypes.ENUM('mtn', 'airtel', 'glo', '9mobile'),
    allowNull: false,
  },
  source: {
    type: DataTypes.ENUM('ogdams', 'smeplug'),
    allowNull: false,
    defaultValue: 'smeplug',
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  service_name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Data Plans',
  },
  service_slug: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'data-plans',
  },
  category_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  category_slug: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  subcategory_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  subcategory_slug: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  network_display_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  network_color: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  network_icon: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  size: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  size_mb: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  validity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  data_size: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  plan_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  original_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  your_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  wallet_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  admin_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  api_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  smeplug_plan_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smeplug_metadata: {
    type: DataTypes.JSON, // Postgres JSON
    allowNull: true,
  },
  ogdams_sku: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  available_sim: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  available_wallet: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_updated_by: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'data_plans',
  indexes: [
    {
      fields: ['provider', 'category', 'is_active']
    },
    {
      fields: ['provider', 'service_slug', 'category_slug', 'subcategory_slug']
    },
    {
      fields: ['source', 'provider']
    },
    {
      fields: ['plan_id']
    },
  ],
  scopes: {
    active: {
      where: {
        is_active: true
      }
    },
    featured: {
      where: {
        is_featured: true
      }
    },
    byProvider(provider) {
      return {
        where: {
          provider: provider
        }
      }
    },
    byCategory(category) {
      return {
        where: {
          category: category
        }
      }
    }
  }
});

DataPlan.addHook('beforeValidate', (plan) => {
  if (plan.provider) {
    plan.provider = String(plan.provider).toLowerCase();
  }
  if (plan.source) {
    plan.source = String(plan.source).toLowerCase();
  }
  if (plan.category) {
    plan.category = String(plan.category).toLowerCase();
  }

  const networkMeta = NETWORK_META[plan.provider] || null;
  if (!plan.network_display_name && networkMeta) {
    plan.network_display_name = networkMeta.displayName;
  }
  if (!plan.network_color && networkMeta) {
    plan.network_color = networkMeta.color;
  }
  if (!plan.network_icon && networkMeta) {
    plan.network_icon = networkMeta.icon;
  }

  if (!plan.service_name) {
    plan.service_name = 'Data Plans';
  }
  if (!plan.service_slug) {
    plan.service_slug = slugify(plan.service_name, 'data-plans');
  }

  if (!plan.category_name && plan.category) {
    plan.category_name = String(plan.category)
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  if (!plan.category_slug && plan.category_name) {
    plan.category_slug = slugify(plan.category_name, slugify(plan.category, 'general'));
  }
  if (plan.subcategory_name && !plan.subcategory_slug) {
    plan.subcategory_slug = slugify(plan.subcategory_name);
  }

  const derivedPlanId = plan.plan_id || plan.smeplug_plan_id || plan.ogdams_sku || null;
  if (derivedPlanId) {
    plan.plan_id = String(derivedPlanId);
  }

  if (!plan.smeplug_plan_id && plan.source === 'smeplug' && plan.plan_id) {
    plan.smeplug_plan_id = String(plan.plan_id);
  }

  if (!plan.ogdams_sku && plan.source === 'ogdams' && plan.plan_id) {
    plan.ogdams_sku = String(plan.plan_id);
  }

  if (!plan.data_size) {
    plan.data_size = extractDataSize(plan.name, plan.size || null);
  }

  if (!plan.size && plan.data_size) {
    plan.size = String(plan.data_size);
  }

  const numericOriginal = Number.parseFloat(String(plan.original_price));
  const numericYour = Number.parseFloat(String(plan.your_price));
  const numericWallet = Number.parseFloat(String(plan.wallet_price));
  const numericAdmin = Number.parseFloat(String(plan.admin_price));
  const numericApi = Number.parseFloat(String(plan.api_cost));

  if (!Number.isFinite(numericOriginal)) {
    if (Number.isFinite(numericApi)) plan.original_price = numericApi;
    else if (Number.isFinite(numericAdmin)) plan.original_price = numericAdmin;
  }

  if (!Number.isFinite(numericYour) && Number.isFinite(numericAdmin)) {
    plan.your_price = numericAdmin;
  }

  if (!Number.isFinite(numericWallet) && Number.isFinite(numericApi)) {
    plan.wallet_price = numericApi;
  }

  if (!Number.isFinite(numericAdmin) && Number.isFinite(Number.parseFloat(String(plan.your_price)))) {
    plan.admin_price = plan.your_price;
  }

  if (!Number.isFinite(numericApi) && Number.isFinite(Number.parseFloat(String(plan.original_price)))) {
    plan.api_cost = plan.original_price;
  }
});

// Instance Methods
DataPlan.prototype.getPriceForUser = async function(user) {
  const fallbackBasePrice = parseFloat(String(this.your_price ?? this.admin_price ?? this.wallet_price ?? 0));

  if (!user) {
    return fallbackBasePrice;
  }

  try {
    const quote = await pricingService.quoteDataPlan({ user, plan: this });
    if (quote && quote.ruleId) {
      return parseFloat(String(quote.charged_amount));
    }
  } catch (e) {
    void e;
  }

  // Check if reseller has custom pricing
  // Assuming user has a method hasRole (from previous turn)
  // or we check user.role === 'reseller'
  
  // Need to fetch user roles if using Spatie-like logic
  // Or check the role field if simplistic
  
  // Since we implemented Roles/Permissions, let's try to use that or fallback to role field
  // The user object passed here might be a Sequelize instance with roles loaded or not.
  
  // Safe check for role
  let isReseller = false;
  if (user.role === 'reseller') {
    isReseller = true;
  } else if (user.getRoles) {
    const roles = await user.getRoles();
    if (roles.some(r => r.name === 'reseller')) {
      isReseller = true;
    }
  }

  if (isReseller) {
    // Need to import ResellerPlanPricing or access via association
    // Since this is an instance method, we can use this.getResellerPlanPricings() if associated
    // But we need to filter by user_id.
    
    // Better to query the model directly to avoid loading all pricings
    const ResellerPlanPricing = require('./ResellerPlanPricing');
    const customPricing = await ResellerPlanPricing.findOne({
      where: {
        userId: user.id,
        dataPlanId: this.id
      }
    });

    if (customPricing) {
      return parseFloat(customPricing.custom_price);
    }
  }

  return fallbackBasePrice;
};

module.exports = DataPlan;
