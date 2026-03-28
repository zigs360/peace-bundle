const sequelize = require('./database'); // Correct import of instance
const bcrypt = require('bcryptjs');

let isConnected = false;

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
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const CallPlan = require('../models/CallPlan');

// Define Associations (Top Level)

// User - Wallet (One-to-One)
try {
  User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet', onDelete: 'CASCADE' });
  Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });

  // User - Review (One-to-Many)
  User.hasMany(Review, { foreignKey: 'userId', as: 'reviews', onDelete: 'CASCADE' });
  Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User - Notification (One-to-Many)
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Wallet - WalletTransaction (One-to-Many)
  Wallet.hasMany(WalletTransaction, { foreignKey: 'walletId', as: 'transactions', onDelete: 'CASCADE' });
  WalletTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });

  // Roles and Permissions (Spatie-like)
  User.belongsToMany(Role, { through: 'model_has_roles', as: 'roles' });
  Role.belongsToMany(User, { through: 'model_has_roles', as: 'users' });

  Role.belongsToMany(Permission, { through: 'role_has_permissions', as: 'permissions' });
  Permission.belongsToMany(Role, { through: 'role_has_permissions', as: 'roles' });

  // Wallet - Transaction (One-to-Many)
  Wallet.hasMany(Transaction, { foreignKey: 'walletId', as: 'walletTransactions', onDelete: 'CASCADE' });
  Transaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });

  // User - Transaction (One-to-Many)
  User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions', onDelete: 'CASCADE' });
  Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User - Sim (One-to-Many)
  User.hasMany(Sim, { foreignKey: 'userId', as: 'sims', onDelete: 'CASCADE' });
  Sim.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User - Beneficiary (One-to-Many)
  User.hasMany(Beneficiary, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Beneficiary.belongsTo(User, { foreignKey: 'userId' });

  // Reseller Plan Pricing Associations
  User.hasMany(ResellerPlanPricing, { foreignKey: 'userId', onDelete: 'CASCADE' });
  ResellerPlanPricing.belongsTo(User, { foreignKey: 'userId' });

  DataPlan.hasMany(ResellerPlanPricing, { foreignKey: 'dataPlanId', onDelete: 'CASCADE' });
  ResellerPlanPricing.belongsTo(DataPlan, { foreignKey: 'dataPlanId' });

  // Transaction - DataPlan (Many-to-One)
  DataPlan.hasMany(Transaction, { foreignKey: 'dataPlanId', as: 'transactions' });
  Transaction.belongsTo(DataPlan, { foreignKey: 'dataPlanId', as: 'dataPlan' });

  // Transaction - Sim (Many-to-One)
  Sim.hasMany(Transaction, { foreignKey: 'simId', as: 'transactions' });
  Transaction.belongsTo(Sim, { foreignKey: 'simId', as: 'sim' });

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

    try {
      await sequelize.query('DELETE FROM "Wallets" WHERE "userId" IS NULL');
    } catch (e) {
      void e;
      try {
        await sequelize.query('DELETE FROM wallets WHERE "userId" IS NULL');
      } catch (e2) {
        void e2;
      }
    }

    // Sync models
    if (process.env.NODE_ENV === 'test') {
      console.log('Syncing models (test mode)...');
      try {
        await sequelize.sync({ force: true });
        console.log('Models synced');
      } catch (error) {
        console.error('Model sync failed:', error);
        throw error;
      }
    } else {
      await sequelize.sync({ alter: true });
    }
    
    console.log('Database Synced');

    // Seed System Settings and Admin if not in test mode
    if (process.env.NODE_ENV !== 'test') {
      // Seed System Settings if empty
      const settingsCount = await SystemSetting.count();
      if (settingsCount === 0) {
        await SystemSetting.bulkCreate([
          { key: 'site_name', value: 'Peace Bundlle', type: 'string', group: 'general' },
          { key: 'site_url', value: 'https://peacebundlle.com', type: 'string', group: 'general' },
          { key: 'payvessel_api_key', value: '', type: 'password', group: 'api' },
          { key: 'payvessel_secret_key', value: '', type: 'password', group: 'api' },
          { key: 'paystack_secret_key', value: '', type: 'password', group: 'api' },
          { key: 'allow_mock_bvn', value: 'true', type: 'boolean', group: 'api' },
          { key: 'affiliate_commission_percent', value: '2.5', type: 'integer', group: 'commission' },
        ]);
        console.log('Default System Settings Seeded');
      }

      // Seed Requested Admin
      const adminUser = await seedAdmin();

      // FIX: Assign any Sims with NULL userId to the admin user
      // We do this after ensuring adminUser exists
      const [updatedCount] = await Sim.update(
        { userId: adminUser.id },
        { where: { userId: null } }
      );
      if (updatedCount > 0) {
        console.log(`[FIX] Assigned ${updatedCount} orphaned SIMs to admin user ${adminUser.name}`);
      }
    }
    
    isConnected = true;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

// Seed Requested Admin (ADMIN/Alamin0336)
const seedAdmin = async () => {
  const adminUsername = 'ADMIN';
  let adminUser = await User.findOne({ where: { name: adminUsername } });
  
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Alamin0336', salt);

  if (!adminUser) {
    adminUser = await User.create({
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
    await adminUser.update({ password: hashedPassword });
  }
  return adminUser;
};

module.exports = {
  sequelize,
  connectDB,
  seedAdmin,
  User,
  Wallet,
  Beneficiary,
  Transaction,
  Sim,
  DataPlan,
  ResellerPlanPricing,
  Commission,
  Referral,
  ApiKey,
  SystemSetting,
  WalletTransaction,
  SubscriptionPlan,
  Role,
  Permission,
  SupportTicket,
  Notification,
  Review,
  CallPlan
};
