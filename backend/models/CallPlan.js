const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import the instance directly
const crypto = require('crypto');

const TALKMORE_GIFTING = 'talkmore_gifting';

const normalizeCurrency = (value) => {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const normalizeInteger = (value, fallback = null) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const CallPlan = sequelize.define('CallPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => crypto.randomUUID(),
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
  customerPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'customer_price',
  },
  dealerCommission: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'dealer_commission',
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
  api_plan_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  shortCode: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'short_code',
  },
  internalSequenceNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    field: 'internal_sequence_number',
  },
  portfolio: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'standard',
  },
  bundleClass: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'generic_voice',
    field: 'bundle_class',
  },
  serviceName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Call Subscriptions',
    field: 'service_name',
  },
  serviceSlug: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'call-subscriptions',
    field: 'service_slug',
  },
  categoryName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'category_name',
  },
  categorySlug: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'category_slug',
  },
  subcategoryName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'subcategory_name',
  },
  subcategorySlug: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'subcategory_slug',
  },
  stockLimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'stock_limit',
  },
  stockRemaining: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'stock_remaining',
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
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
    {
      fields: ['api_plan_id'],
    },
    {
      unique: true,
      fields: ['short_code'],
    },
    {
      unique: true,
      fields: ['internal_sequence_number'],
    },
    {
      fields: ['provider', 'portfolio', 'bundle_class', 'status'],
    },
  ],
});

CallPlan.addHook('beforeValidate', (plan) => {
  if (plan.provider) {
    plan.provider = String(plan.provider).toLowerCase();
  }
  if (plan.status) {
    plan.status = String(plan.status).toLowerCase();
  }
  if (plan.type) {
    plan.type = String(plan.type).toLowerCase();
  }
  if (plan.portfolio) {
    plan.portfolio = String(plan.portfolio).toLowerCase();
  }
  if (plan.bundleClass) {
    plan.bundleClass = String(plan.bundleClass).toLowerCase();
  }

  const normalizedPrice = normalizeCurrency(plan.customerPrice ?? plan.price);
  if (normalizedPrice !== null) {
    plan.customerPrice = normalizedPrice;
    plan.price = normalizedPrice;
  }

  const normalizedCommission = normalizeCurrency(plan.dealerCommission);
  if (normalizedCommission !== null) {
    plan.dealerCommission = normalizedCommission;
  }

  const normalizedShortCode = String(plan.shortCode ?? plan.api_plan_id ?? '').trim();
  if (normalizedShortCode) {
    plan.shortCode = normalizedShortCode;
    if (!plan.api_plan_id) {
      plan.api_plan_id = normalizedShortCode;
    }
  }

  const normalizedSequence = normalizeInteger(plan.internalSequenceNumber);
  if (normalizedSequence !== null) {
    plan.internalSequenceNumber = normalizedSequence;
  }

  const normalizedStockLimit = normalizeInteger(plan.stockLimit);
  const normalizedStockRemaining = normalizeInteger(plan.stockRemaining);

  if (normalizedStockLimit !== null && normalizedStockLimit >= 0) {
    plan.stockLimit = normalizedStockLimit;
  } else if (plan.stockLimit === null || plan.stockLimit === undefined || plan.stockLimit === '') {
    plan.stockLimit = null;
  }

  if (plan.stockLimit === null) {
    plan.stockRemaining = null;
  } else if (normalizedStockRemaining !== null && normalizedStockRemaining >= 0) {
    plan.stockRemaining = normalizedStockRemaining;
  } else if (!plan.isNewRecord && plan.stockRemaining !== undefined && plan.stockRemaining !== null) {
    plan.stockRemaining = normalizeInteger(plan.stockRemaining, plan.stockLimit);
  } else {
    plan.stockRemaining = plan.stockLimit;
  }

  if (plan.bundleClass === TALKMORE_GIFTING) {
    plan.provider = 'airtel';
    plan.portfolio = 'talkmore';
    plan.validityDays = 30;
    plan.serviceName = plan.serviceName || 'Call Subscriptions';
    plan.serviceSlug = plan.serviceSlug || 'call-subscriptions';
    plan.categoryName = plan.categoryName || 'TalkMore';
    plan.categorySlug = plan.categorySlug || 'talkmore';
    plan.subcategoryName = plan.subcategoryName || 'Gifting Bundles';
    plan.subcategorySlug = plan.subcategorySlug || 'gifting-bundles';
  }
});

CallPlan.addHook('beforeSave', (plan) => {
  const customerPrice = normalizeCurrency(plan.customerPrice ?? plan.price);
  const dealerCommission = normalizeCurrency(plan.dealerCommission) ?? 0;

  if (customerPrice === null || customerPrice <= 0) {
    throw new Error('Customer price must be greater than zero');
  }

  if (dealerCommission < 0) {
    throw new Error('Dealer commission cannot be negative');
  }

  if (dealerCommission > customerPrice * 0.05) {
    throw new Error('Dealer commission cannot exceed 5% of the customer price');
  }

  if (plan.bundleClass === TALKMORE_GIFTING) {
    plan.validityDays = 30;
  }

  if (plan.stockLimit !== null && plan.stockLimit !== undefined) {
    if (Number(plan.stockLimit) < 0) {
      throw new Error('Stock limit cannot be negative');
    }
    if (plan.stockRemaining === null || plan.stockRemaining === undefined) {
      plan.stockRemaining = plan.stockLimit;
    }
    if (Number(plan.stockRemaining) < 0) {
      throw new Error('Stock remaining cannot be negative');
    }
    if (Number(plan.stockRemaining) > Number(plan.stockLimit)) {
      throw new Error('Stock remaining cannot exceed the stock limit');
    }
  }
});

module.exports = CallPlan;
