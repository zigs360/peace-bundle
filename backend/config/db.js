const sequelize = require('./database'); // Correct import of instance
const bcrypt = require('bcryptjs');

let isConnected = false;
const globalState = globalThis.__peacebundle_db_state || {
  isConnected: false,
  isSyncDone: false,
  connectPromise: null
};
globalThis.__peacebundle_db_state = globalState;

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
const PricingTier = require('../models/PricingTier');
const PricingRule = require('../models/PricingRule');
const PricingAuditLog = require('../models/PricingAuditLog');
const WebhookEvent = require('../models/WebhookEvent');

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

  PricingTier.hasMany(PricingRule, { foreignKey: 'tierId', as: 'rules', onDelete: 'CASCADE' });
  PricingRule.belongsTo(PricingTier, { foreignKey: 'tierId', as: 'tier' });

  User.hasMany(PricingAuditLog, { foreignKey: 'adminId', as: 'pricingAuditLogs' });
  PricingAuditLog.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
} catch (error) {
  console.error('Error defining associations:', error);
}

const connectDB = async () => {
  if (globalState.isConnected || isConnected) {
    console.log('PostgreSQL already connected via Sequelize');
    return;
  }

  try {
    if (globalState.connectPromise) {
      await globalState.connectPromise;
      isConnected = globalState.isConnected;
      return;
    }

    const dbUrl = process.env.DATABASE_URL || 'unknown';
    console.log(`Attempting to connect to DB at ${dbUrl.split('@')[1] || 'default'}`);
    globalState.connectPromise = (async () => {
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

      if (process.env.NODE_ENV === 'test') {
        if (!globalState.isSyncDone) {
          console.log('Syncing models (test mode)...');
          await sequelize.sync({ force: true });
          console.log('Models synced');
          globalState.isSyncDone = true;
        }
      } else {
        const syncMode = String(
          process.env.DB_SYNC || (process.env.NODE_ENV === 'production' ? 'safe' : 'alter'),
        ).toLowerCase();

        if (syncMode === 'alter') {
          await sequelize.sync({ alter: true });
        } else if (syncMode === 'safe') {
          await sequelize.sync();
        } else if (syncMode !== 'none') {
          throw new Error(`Invalid DB_SYNC mode: ${syncMode}`);
        }
      }

      console.log('Database Synced');

      if (process.env.NODE_ENV !== 'test') {
        const settingsCount = await SystemSetting.count();
        if (settingsCount === 0) {
          await SystemSetting.bulkCreate([
            { key: 'site_name', value: 'Peace Bundle', type: 'string', group: 'general' },
            { key: 'site_url', value: 'https://peacebundle.com', type: 'string', group: 'general' },
            { key: 'payvessel_api_key', value: '', type: 'password', group: 'api' },
            { key: 'payvessel_secret_key', value: '', type: 'password', group: 'api' },
            { key: 'paystack_secret_key', value: '', type: 'password', group: 'api' },
            {
              key: 'allow_mock_bvn',
              value: String(process.env.MOCK_BVN_ALLOWED || 'false'),
              type: 'boolean',
              group: 'api',
            },
            { key: 'affiliate_commission_percent', value: '2.5', type: 'integer', group: 'commission' },
            { key: 'pricing_tier_user', value: 'default', type: 'string', group: 'pricing' },
            { key: 'pricing_tier_reseller', value: 'default', type: 'string', group: 'pricing' },
            { key: 'pricing_tier_admin', value: 'default', type: 'string', group: 'pricing' },
          ]);
          console.log('Default System Settings Seeded');
        }

        const adminUser = await seedAdmin();

        if (adminUser) {
          const [updatedCount] = await Sim.update({ userId: adminUser.id }, { where: { userId: null } });
          if (updatedCount > 0) {
            console.log(`[FIX] Assigned ${updatedCount} orphaned SIMs to admin user ${adminUser.name}`);
          }
        }
      }

      globalState.isConnected = true;
      isConnected = true;
    })();

    await globalState.connectPromise;
    globalState.connectPromise = null;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const seedAdmin = async () => {
  const existingAdmin = await User.findOne({ where: { role: 'admin' } });

  const adminName = process.env.ADMIN_NAME || 'Admin';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPhone = process.env.ADMIN_PHONE || '08000000000';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const forcePasswordReset = String(process.env.ADMIN_FORCE_PASSWORD_RESET || 'false').toLowerCase() === 'true';
  const allowSeed =
    process.env.NODE_ENV !== 'production' || String(process.env.SEED_ADMIN || 'false').toLowerCase() === 'true';

  if (existingAdmin) {
    if (adminPassword && forcePasswordReset) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      await existingAdmin.update({ password: hashedPassword });
      console.log('Admin password updated via ADMIN_FORCE_PASSWORD_RESET');
    }
    return existingAdmin;
  }

  if (!allowSeed) {
    console.warn('No admin user found and seeding is disabled; skipping admin seed.');
    return null;
  }

  if (!adminEmail || !adminPassword) {
    console.warn('No admin user found; set ADMIN_EMAIL and ADMIN_PASSWORD (and SEED_ADMIN=true in production) to seed one.');
    return null;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(adminPassword, salt);
  const adminUser = await User.create({
    name: adminName,
    email: adminEmail,
    phone: adminPhone,
    password: hashedPassword,
    role: 'admin',
    account_status: 'active',
  });
  console.log('Admin user seeded from environment variables');
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
  CallPlan,
  PricingTier,
  PricingRule,
  PricingAuditLog,
  WebhookEvent
};
