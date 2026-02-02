const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

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
  category: {
    type: DataTypes.ENUM('sme', 'gifting', 'corporate_gifting', 'coupon'),
    allowNull: false,
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
  }
}, {
  timestamps: true,
  tableName: 'data_plans',
  indexes: [
    {
      fields: ['provider', 'category', 'is_active']
    }
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

// Instance Methods
DataPlan.prototype.getPriceForUser = async function(user) {
  if (!user) {
    return parseFloat(this.admin_price);
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

  return parseFloat(this.admin_price);
};

module.exports = DataPlan;
