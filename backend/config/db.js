const sequelize = require('./database'); // Correct import of instance
const bcrypt = require('bcryptjs');
const { DataTypes, Op } = require('sequelize');

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
const PlanPriceHistory = require('../models/PlanPriceHistory');
const PlanDeletionAudit = require('../models/PlanDeletionAudit');
const WebhookEvent = require('../models/WebhookEvent');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const AdminOgdamsDataPurchase = require('../models/AdminOgdamsDataPurchase');
const AdminOgdamsDataPurchaseAudit = require('../models/AdminOgdamsDataPurchaseAudit');
const AdminWalletDeduction = require('../models/AdminWalletDeduction');
const AdminWalletDeductionAudit = require('../models/AdminWalletDeductionAudit');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const VoiceBundlePurchaseAudit = require('../models/VoiceBundlePurchaseAudit');

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

  DataPlan.hasMany(PlanPriceHistory, { foreignKey: 'planIdRef', as: 'priceHistory', onDelete: 'CASCADE' });
  PlanPriceHistory.belongsTo(DataPlan, { foreignKey: 'planIdRef', as: 'plan' });

  User.hasMany(PlanDeletionAudit, { foreignKey: 'adminId', as: 'planDeletionAudits' });
  PlanDeletionAudit.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

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

  User.hasMany(AdminOgdamsDataPurchase, { foreignKey: 'adminId', as: 'ogdamsDataPurchases' });
  AdminOgdamsDataPurchase.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

  User.hasMany(AdminOgdamsDataPurchase, { foreignKey: 'userId', as: 'ogdamsDataReceipts' });
  AdminOgdamsDataPurchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Sim.hasMany(AdminOgdamsDataPurchase, { foreignKey: 'simId', as: 'ogdamsDataPurchases' });
  AdminOgdamsDataPurchase.belongsTo(Sim, { foreignKey: 'simId', as: 'sim' });

  DataPlan.hasMany(AdminOgdamsDataPurchase, { foreignKey: 'dataPlanId', as: 'ogdamsDataPurchases' });
  AdminOgdamsDataPurchase.belongsTo(DataPlan, { foreignKey: 'dataPlanId', as: 'dataPlan' });

  AdminOgdamsDataPurchase.hasMany(AdminOgdamsDataPurchaseAudit, { foreignKey: 'purchaseId', as: 'audits', onDelete: 'CASCADE' });
  AdminOgdamsDataPurchaseAudit.belongsTo(AdminOgdamsDataPurchase, { foreignKey: 'purchaseId', as: 'purchase' });

  User.hasMany(AdminWalletDeduction, { foreignKey: 'adminId', as: 'walletDeductionsMade' });
  AdminWalletDeduction.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

  User.hasMany(AdminWalletDeduction, { foreignKey: 'userId', as: 'walletDeductionsReceived' });
  AdminWalletDeduction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  AdminWalletDeduction.hasMany(AdminWalletDeductionAudit, { foreignKey: 'deductionId', as: 'audits', onDelete: 'CASCADE' });
  AdminWalletDeductionAudit.belongsTo(AdminWalletDeduction, { foreignKey: 'deductionId', as: 'deduction' });

  User.hasMany(VoiceBundlePurchase, { foreignKey: 'userId', as: 'voiceBundlePurchases', onDelete: 'CASCADE' });
  VoiceBundlePurchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  CallPlan.hasMany(VoiceBundlePurchase, { foreignKey: 'callPlanId', as: 'voiceBundlePurchases', onDelete: 'CASCADE' });
  VoiceBundlePurchase.belongsTo(CallPlan, { foreignKey: 'callPlanId', as: 'callPlan' });

  Transaction.hasMany(VoiceBundlePurchase, { foreignKey: 'transactionId', as: 'voiceBundlePurchases' });
  VoiceBundlePurchase.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

  VoiceBundlePurchase.hasMany(VoiceBundlePurchaseAudit, { foreignKey: 'purchaseId', as: 'audits', onDelete: 'CASCADE' });
  VoiceBundlePurchaseAudit.belongsTo(VoiceBundlePurchase, { foreignKey: 'purchaseId', as: 'purchase' });
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
      try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected via Sequelize');
      } catch (authError) {
        console.error('CRITICAL: Authentication failed during connectDB sequence');
        console.error(`Database URL Host: ${dbUrl.split('@')[1] || 'unknown'}`);
        console.error(`Error details: ${authError.message}`);
        if (authError.original) {
          console.error(`Original Error: ${authError.original.message}`);
        }
        throw authError;
      }

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

      const qi = sequelize.getQueryInterface();
      const ensureColumn = async (tableName, columnName, columnDef) => {
        try {
          const desc = await qi.describeTable(tableName);
          if (desc && Object.prototype.hasOwnProperty.call(desc, columnName)) return;
          await qi.addColumn(tableName, columnName, columnDef);
        } catch (e) {
          void e;
        }
      };

      const dataPlansTable = typeof DataPlan.getTableName === 'function' ? DataPlan.getTableName() : 'data_plans';
      const simsTable = typeof Sim.getTableName === 'function' ? Sim.getTableName() : 'Sims';
      const callPlansTable = typeof CallPlan.getTableName === 'function' ? CallPlan.getTableName() : 'CallPlans';
      const planPriceHistoryTable =
        typeof PlanPriceHistory.getTableName === 'function' ? PlanPriceHistory.getTableName() : 'plan_price_history';
      const planDeletionAuditTable =
        typeof PlanDeletionAudit.getTableName === 'function' ? PlanDeletionAudit.getTableName() : 'plan_deletion_audits';
      const voiceBundlePurchasesTable =
        typeof VoiceBundlePurchase.getTableName === 'function' ? VoiceBundlePurchase.getTableName() : 'voice_bundle_purchases';
      const ensureVoiceBundlePurchaseColumns = async () =>
        Promise.all([
          ensureColumn(voiceBundlePurchasesTable, 'expires_at', { type: DataTypes.DATE, allowNull: true }),
          ensureColumn(voiceBundlePurchasesTable, 'bundle_category', { type: DataTypes.STRING, allowNull: false, defaultValue: 'minute' }),
          ensureColumn(voiceBundlePurchasesTable, 'migrated_from_purchase_id', { type: DataTypes.UUID, allowNull: true }),
        ]);

      if (process.env.NODE_ENV !== 'test') {
        await Promise.all([
          ensureColumn(dataPlansTable, 'ogdams_sku', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'source', { type: DataTypes.STRING, allowNull: false, defaultValue: 'smeplug' }),
          ensureColumn(dataPlansTable, 'plan_id', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'service_name', { type: DataTypes.STRING, allowNull: false, defaultValue: 'Data Plans' }),
          ensureColumn(dataPlansTable, 'service_slug', { type: DataTypes.STRING, allowNull: false, defaultValue: 'data-plans' }),
          ensureColumn(dataPlansTable, 'category_name', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'category_slug', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'subcategory_name', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'subcategory_slug', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'network_display_name', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'network_color', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'network_icon', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'data_size', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'original_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
          ensureColumn(dataPlansTable, 'your_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
          ensureColumn(dataPlansTable, 'wallet_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
          ensureColumn(dataPlansTable, 'available_sim', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }),
          ensureColumn(dataPlansTable, 'available_wallet', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }),
          ensureColumn(dataPlansTable, 'last_updated_by', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'deletedAt', { type: DataTypes.DATE, allowNull: true }),
          ensureColumn(dataPlansTable, 'deleted_by', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(dataPlansTable, 'deletion_reason', { type: DataTypes.TEXT, allowNull: true }),
          ensureColumn(simsTable, 'iccid', { type: DataTypes.STRING, allowNull: true }),
          ensureColumn(simsTable, 'ogdams_linked', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }),
          ensureColumn(simsTable, 'reserved_airtime', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }),
          ensureColumn(callPlansTable, 'api_plan_id', { type: DataTypes.STRING, allowNull: true }),
          ensureVoiceBundlePurchaseColumns(),
        ]);
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

      await Promise.all([
        ensureColumn(dataPlansTable, 'ogdams_sku', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'source', { type: DataTypes.STRING, allowNull: false, defaultValue: 'smeplug' }),
        ensureColumn(dataPlansTable, 'plan_id', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'service_name', { type: DataTypes.STRING, allowNull: false, defaultValue: 'Data Plans' }),
        ensureColumn(dataPlansTable, 'service_slug', { type: DataTypes.STRING, allowNull: false, defaultValue: 'data-plans' }),
        ensureColumn(dataPlansTable, 'category_name', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'category_slug', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'subcategory_name', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'subcategory_slug', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'network_display_name', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'network_color', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'network_icon', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'data_size', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'original_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
        ensureColumn(dataPlansTable, 'your_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
        ensureColumn(dataPlansTable, 'wallet_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }),
        ensureColumn(dataPlansTable, 'available_sim', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }),
        ensureColumn(dataPlansTable, 'available_wallet', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }),
        ensureColumn(dataPlansTable, 'last_updated_by', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'deletedAt', { type: DataTypes.DATE, allowNull: true }),
        ensureColumn(dataPlansTable, 'deleted_by', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(dataPlansTable, 'deletion_reason', { type: DataTypes.TEXT, allowNull: true }),
        ensureColumn(simsTable, 'iccid', { type: DataTypes.STRING, allowNull: true }),
        ensureColumn(simsTable, 'ogdams_linked', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }),
        ensureColumn(simsTable, 'reserved_airtime', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }),
        ensureColumn(callPlansTable, 'api_plan_id', { type: DataTypes.STRING, allowNull: true }),
      ]);

      try {
        await PlanPriceHistory.sync();
        await ensureColumn(planPriceHistoryTable, 'field_name', { type: DataTypes.STRING, allowNull: false, defaultValue: 'your_price' });
        await ensureColumn(planPriceHistoryTable, 'old_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true });
        await ensureColumn(planPriceHistoryTable, 'new_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true });
        await ensureColumn(planPriceHistoryTable, 'old_value', { type: DataTypes.STRING, allowNull: true });
        await ensureColumn(planPriceHistoryTable, 'new_value', { type: DataTypes.STRING, allowNull: true });
        await ensureColumn(planPriceHistoryTable, 'changed_by', { type: DataTypes.STRING, allowNull: false, defaultValue: 'system' });
        await ensureColumn(planPriceHistoryTable, 'reason', { type: DataTypes.TEXT, allowNull: true });
        await ensureColumn(planPriceHistoryTable, 'source', { type: DataTypes.STRING, allowNull: true });
      } catch (e) {
        console.error('Plan price history table sync failed:', e.message);
      }

      try {
        await PlanDeletionAudit.sync();
        await ensureColumn(planDeletionAuditTable, 'plan_id_ref', { type: DataTypes.INTEGER, allowNull: false });
        await ensureColumn(planDeletionAuditTable, 'admin_id', { type: DataTypes.UUID, allowNull: true });
        await ensureColumn(planDeletionAuditTable, 'deleted_by', { type: DataTypes.STRING, allowNull: false, defaultValue: 'system' });
        await ensureColumn(planDeletionAuditTable, 'deletion_mode', { type: DataTypes.STRING, allowNull: false, defaultValue: 'soft' });
        await ensureColumn(planDeletionAuditTable, 'reason', { type: DataTypes.TEXT, allowNull: true });
        await ensureColumn(planDeletionAuditTable, 'related_counts', { type: DataTypes.JSONB, allowNull: false, defaultValue: {} });
        await ensureColumn(planDeletionAuditTable, 'plan_snapshot', { type: DataTypes.JSONB, allowNull: false, defaultValue: {} });
      } catch (e) {
        console.error('Plan deletion audit table sync failed:', e.message);
      }

      try {
        await AdminWalletDeduction.sync();
        await AdminWalletDeductionAudit.sync();
      } catch (e) {
        console.error('Admin wallet deduction tables sync failed:', e.message);
      }

      try {
        await VoiceBundlePurchase.sync();
        await VoiceBundlePurchaseAudit.sync();
        await ensureVoiceBundlePurchaseColumns();
      } catch (e) {
        console.error('Voice bundle purchase tables sync failed:', e.message);
      }

      console.log('Database Synced');

      try {
        const { getAllCallSubProviders } = require('../services/callSubCatalog');
        const providers = Object.values(getAllCallSubProviders());
        await Promise.all(
          providers.flatMap((provider) =>
            (provider.bundles || []).map(async (bundle) => {
              const existing = await CallPlan.findOne({ where: { provider: provider.key, api_plan_id: bundle.code } });
              if (existing) {
                existing.name = bundle.name;
                existing.price = bundle.price;
                existing.minutes = bundle.minutes;
                existing.validityDays = bundle.validityDays;
                existing.status = 'active';
                existing.type = 'voice';
                await existing.save();
                return;
              }
              await CallPlan.create({
                name: bundle.name,
                provider: provider.key,
                price: bundle.price,
                minutes: bundle.minutes,
                validityDays: bundle.validityDays,
                status: 'active',
                type: 'voice',
                api_plan_id: bundle.code,
              });
            }),
          ),
        );
        await Promise.all(
          providers.map(async (provider) => {
            const activeCodes = (provider.bundles || []).map((bundle) => bundle.code);
            await CallPlan.update(
              { status: 'inactive' },
              {
                where: {
                  provider: provider.key,
                  type: 'voice',
                  api_plan_id: {
                    [Op.like]: `${provider.apiPlanPrefix}%`,
                    [Op.notIn]: activeCodes,
                  },
                },
              },
            );
          }),
        );
      } catch (e) {
        console.error('Call Sub seed failed:', e.message);
      }

      if (process.env.NODE_ENV !== 'test') {
        const settingsCount = await SystemSetting.count();
        if (settingsCount === 0) {
          await SystemSetting.bulkCreate([
            { key: 'site_name', value: 'Peace Bundlle', type: 'string', group: 'general' },
            { key: 'site_url', value: 'https://peacebundlle.com', type: 'string', group: 'general' },
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
            { key: 'settlement_bank_code', value: '', type: 'string', group: 'treasury', description: 'Settlement bank code for admin revenue cashout' },
            { key: 'settlement_bank_name', value: '', type: 'string', group: 'treasury', description: 'Settlement bank name for admin revenue cashout' },
            { key: 'settlement_account_number', value: '', type: 'string', group: 'treasury', description: 'Settlement 10-digit account number for admin revenue cashout' },
            { key: 'settlement_account_name', value: '', type: 'string', group: 'treasury', description: 'Settlement account name for admin revenue cashout' },
            { key: 'treasury_last_sync_at', value: '', type: 'string', group: 'treasury', description: 'Last treasury sync timestamp' },
          ]);
          console.log('Default System Settings Seeded');
        }

        const ensureSetting = async (key, value, type, group, description) => {
          const existing = await SystemSetting.findOne({ where: { key } });
          if (existing) return;
          await SystemSetting.set(key, value, type, group, description);
        };

        await Promise.all([
          ensureSetting('settlement_bank_code', '', 'string', 'treasury', 'Settlement bank code for admin revenue cashout'),
          ensureSetting('settlement_bank_name', '', 'string', 'treasury', 'Settlement bank name for admin revenue cashout'),
          ensureSetting('settlement_account_number', '', 'string', 'treasury', 'Settlement 10-digit account number for admin revenue cashout'),
          ensureSetting('settlement_account_name', '', 'string', 'treasury', 'Settlement account name for admin revenue cashout'),
          ensureSetting('treasury_last_sync_at', '', 'string', 'treasury', 'Last treasury sync timestamp'),
        ]);

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
  PlanPriceHistory,
  PlanDeletionAudit,
  WebhookEvent,
  TreasuryBalance,
  TreasuryLedgerEntry,
  AdminOgdamsDataPurchase,
  AdminOgdamsDataPurchaseAudit,
  AdminWalletDeduction,
  AdminWalletDeductionAudit,
  VoiceBundlePurchase,
  VoiceBundlePurchaseAudit
};
