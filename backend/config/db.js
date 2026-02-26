const { sequelize } = require('./database');
const bcrypt = require('bcryptjs');

// Import models (Top Level)
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Beneficiary = require('../models/Beneficiary');
const Transaction = require('../models/Transaction');
const Sim = require('../models/Sim');
const DataPlan = require('../models/DataPlan');
const ResellerPlanPricing = require('../models/ResellerPlanPricing');
const Commission = require('../models/Commission');
const Referral = require('../models/Referral');
const ApiKey = require('../models/ApiKey');
const SystemSetting = require('../models/SystemSetting');
const WalletTransaction = require('../models/WalletTransaction');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const SupportTicket = require('../models/SupportTicket');

// Define Associations (Top Level)

// User - Wallet (One-to-One)
try {
  User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet', onDelete: 'CASCADE' });
  Wallet.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });

  // Wallet - WalletTransaction (One-to-Many)
  Wallet.hasMany(WalletTransaction, { foreignKey: 'walletId', onDelete: 'CASCADE' });
  WalletTransaction.belongsTo(Wallet, { foreignKey: 'walletId' });

  // Roles and Permissions (Spatie-like)
  User.belongsToMany(Role, { through: 'model_has_roles' });
  Role.belongsToMany(User, { through: 'model_has_roles' });

  Role.belongsToMany(Permission, { through: 'role_has_permissions' });
  Permission.belongsToMany(Role, { through: 'role_has_permissions' });

  // Wallet - Transaction (One-to-Many)
  Wallet.hasMany(Transaction, { foreignKey: 'walletId', onDelete: 'CASCADE' });
  Transaction.belongsTo(Wallet, { foreignKey: 'walletId' });

  // User - Transaction (One-to-Many)
  User.hasMany(Transaction, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Transaction.belongsTo(User, { foreignKey: 'userId' });

  // User - Sim (One-to-Many)
  User.hasMany(Sim, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Sim.belongsTo(User, { foreignKey: 'userId' });

  // User - Beneficiary (One-to-Many)
  User.hasMany(Beneficiary, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Beneficiary.belongsTo(User, { foreignKey: 'userId' });

  // Reseller Plan Pricing Associations
  User.hasMany(ResellerPlanPricing, { foreignKey: 'userId', onDelete: 'CASCADE' });
  ResellerPlanPricing.belongsTo(User, { foreignKey: 'userId' });

  DataPlan.hasMany(ResellerPlanPricing, { foreignKey: 'dataPlanId', onDelete: 'CASCADE' });
  ResellerPlanPricing.belongsTo(DataPlan, { foreignKey: 'dataPlanId' });

  // Transaction - DataPlan (Many-to-One)
  DataPlan.hasMany(Transaction, { foreignKey: 'dataPlanId' });
  Transaction.belongsTo(DataPlan, { foreignKey: 'dataPlanId' });

  // Transaction - Sim (Many-to-One)
  Sim.hasMany(Transaction, { foreignKey: 'simId' });
  Transaction.belongsTo(Sim, { foreignKey: 'simId' });

  // Commission Associations
  User.hasMany(Commission, { foreignKey: 'referrerId', as: 'ReferrerCommissions', onDelete: 'CASCADE' });
  Commission.belongsTo(User, { foreignKey: 'referrerId', as: 'Referrer' });

  User.hasMany(Commission, { foreignKey: 'referredUserId', as: 'ReferredCommissions', onDelete: 'CASCADE' });
  Commission.belongsTo(User, { foreignKey: 'referredUserId', as: 'ReferredUser' });

  // Polymorphic association for Commission
  Transaction.hasMany(Commission, {
    foreignKey: 'commissionableId',
    constraints: false,
    scope: {
      commissionable_type: 'transaction'
    }
  });
  Commission.belongsTo(Transaction, { foreignKey: 'commissionableId', constraints: false });

  // Referral Associations
  User.hasMany(Referral, { foreignKey: 'referrerId', as: 'ReferralsMade', onDelete: 'CASCADE' });
  Referral.belongsTo(User, { foreignKey: 'referrerId', as: 'Referrer' });

  // Support Ticket Associations
  User.hasMany(SupportTicket, { foreignKey: 'userId', as: 'Tickets', onDelete: 'CASCADE' });
  SupportTicket.belongsTo(User, { foreignKey: 'userId', as: 'User' });

  User.hasMany(Referral, { foreignKey: 'referredUserId', as: 'ReferralData', onDelete: 'CASCADE' }); 
  Referral.belongsTo(User, { foreignKey: 'referredUserId', as: 'ReferredUser' });

  // ApiKey Associations
  User.hasMany(ApiKey, { foreignKey: 'userId', onDelete: 'CASCADE' });
  ApiKey.belongsTo(User, { foreignKey: 'userId' });

  User.hasMany(SupportTicket, { foreignKey: 'assignedTo', as: 'AssignedTickets', onDelete: 'SET NULL' });
  SupportTicket.belongsTo(User, { foreignKey: 'assignedTo', as: 'AssignedStaff' });
} catch (error) {
  console.error('Error defining associations:', error);
}

// EXPORT SEQUELIZE IMMEDIATELY
module.exports.sequelize = sequelize;

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('PostgreSQL already connected via Sequelize');
    return;
  }

  try {
    const dbUrl = process.env.DATABASE_URL || 'unknown';
    console.log(`Attempting to connect to DB at ${dbUrl.split('@')[1] || 'default'}`);
    
    await sequelize.authenticate();
    console.log('PostgreSQL Connected via Sequelize');

    // Sync models
    // In test environment, we might want to be careful with sync
    // Use force: false to avoid wiping data if not intended, or alter: false if schema is stable
    // If tests hang, try skipping sync or using force: true once
    if (process.env.NODE_ENV === 'test') {
      console.log('Syncing models (test mode)...');
      try {
        // Break down sync to identify hanging model if needed
        // await sequelize.sync(); 
        await sequelize.authenticate(); // ensure connection
        await User.sync({ force: true });
        await Wallet.sync({ force: true });
        await SystemSetting.sync({ force: true });
        // Sync others if needed, or just sync all
        // await sequelize.sync();
        console.log('Models synced');
      } catch (error) {
        console.error('Model sync failed:', error);
        throw error;
      }
    } else {
      await sequelize.sync({ alter: true });
    }
    
    console.log('Database Synced');
    
    isConnected = true;

    // Seed System Settings if empty
    if (process.env.NODE_ENV !== 'test') {
      const settingsCount = await SystemSetting.count();
      if (settingsCount === 0) {
          await SystemSetting.bulkCreate([
            { key: 'site_name', value: 'Peace Bundlle', type: 'string', group: 'general' },
            { key: 'site_url', value: 'https://peacebundlle.com', type: 'string', group: 'general' },
            { key: 'payvessel_api_key', value: '', type: 'password', group: 'api' },
            { key: 'payvessel_secret_key', value: '', type: 'password', group: 'api' },
            { key: 'affiliate_commission_percent', value: '2.5', type: 'integer', group: 'commission' },
          ]);
          console.log('Default System Settings Seeded');
      }

      // Seed Requested Admin (ADMIN/Alamin0336)
      const adminUsername = 'ADMIN';
      const adminExists = await User.findOne({ where: { name: adminUsername } });
      if (!adminExists) {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash('Alamin0336', salt);
          await User.create({
              name: adminUsername,
              email: 'admin@peacebundlle.com',
              phone: '08000000000',
              password: hashedPassword,
              role: 'admin',
              account_status: 'active'
          });
          console.log('Requested Admin user (ADMIN/Alamin0336) Seeded');
      } else {
          // Update password to ensure it matches
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash('Alamin0336', salt);
          await adminExists.update({ password: hashedPassword });
      }
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports.connectDB = connectDB;
