const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/peacebundle', {
  dialect: 'postgres',
  logging: false, // Set to console.log to see SQL queries
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL Connected via Sequelize');
    
    // Import models to ensure they are registered
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
    const Role = require('../models/Role');
    const Permission = require('../models/Permission');
    const SupportTicket = require('../models/SupportTicket');

    // Define Associations
    
    // User - Wallet (One-to-One)
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

    // User - Transaction (One-to-Many) - Direct association as per new schema
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

    // Polymorphic association for Commission (Commissionable)
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

    User.hasMany(Referral, { foreignKey: 'referredUserId', as: 'ReferralData', onDelete: 'CASCADE' }); 
    Referral.belongsTo(User, { foreignKey: 'referredUserId', as: 'ReferredUser' });

    // ApiKey Associations
    User.hasMany(ApiKey, { foreignKey: 'userId', onDelete: 'CASCADE' });
    ApiKey.belongsTo(User, { foreignKey: 'userId' });

    // SupportTicket Associations
    User.hasMany(SupportTicket, { foreignKey: 'userId', as: 'Tickets', onDelete: 'CASCADE' });
    SupportTicket.belongsTo(User, { foreignKey: 'userId', as: 'User' });

    User.hasMany(SupportTicket, { foreignKey: 'assignedTo', as: 'AssignedTickets', onDelete: 'SET NULL' });
    SupportTicket.belongsTo(User, { foreignKey: 'assignedTo', as: 'AssignedAdmin' });

    // Sync models (in development, alter: true is okay, but be careful in production)
    await sequelize.sync({ alter: true });
    console.log('Database Synced');
    
    // Seed System Settings if empty (Basic defaults)
    const settingsCount = await SystemSetting.count();
    if (settingsCount === 0) {
       await SystemSetting.bulkCreate([
         { key: 'site_name', value: 'Peace Bundle', type: 'string', group: 'general' },
         { key: 'site_url', value: 'https://peacebundle.com', type: 'string', group: 'general' },
         { key: 'referral_bonus_percentage', value: '2.5', type: 'integer', group: 'commission' },
       ]);
       console.log('Default System Settings Seeded');
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
