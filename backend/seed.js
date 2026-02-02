const { sequelize, connectDB } = require('./config/db');
const User = require('./models/User');
const Wallet = require('./models/Wallet');
const SystemSetting = require('./models/SystemSetting');
const DataPlan = require('./models/DataPlan');
const ResellerPlanPricing = require('./models/ResellerPlanPricing');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seedDatabase = async () => {
  try {
    // Connect to Database and Setup Associations
    console.log('Initializing Database Connection and Associations...');
    // We suppress console.log from connectDB to keep output clean, or just let it log
    await connectDB(); 

    // Force sync to clear existing data
    console.log('Force Syncing Database (Clearing old data)...');
    await sequelize.sync({ force: true });
    console.log('Database synced (cleared)...');

    // 1. Create System Settings
    console.log('Seeding System Settings...');
    await SystemSetting.bulkCreate([
      { key: 'commission_referral_transaction', value: '0.5', type: 'float', group: 'commission' },
      { key: 'commission_affiliate_transaction', value: '1.0', type: 'float', group: 'commission' },
      { key: 'site_name', value: 'Peace Bundle', type: 'string', group: 'general' },
      { key: 'support_email', value: 'support@peacebundle.com', type: 'string', group: 'general' },
    ]);

    // 2. Create Data Plans
    console.log('Seeding Data Plans...');
    const plans = await DataPlan.bulkCreate([
      {
        provider: 'mtn',
        category: 'sme',
        name: 'MTN SME 1GB',
        size: '1GB',
        size_mb: 1024,
        validity: '30 Days',
        admin_price: 250.00,
        api_cost: 230.00,
        smeplug_plan_id: 'MTN_SME_1GB',
        is_active: true,
        sort_order: 1
      },
      {
        provider: 'mtn',
        category: 'sme',
        name: 'MTN SME 500MB',
        size: '500MB',
        size_mb: 500,
        validity: '30 Days',
        admin_price: 130.00,
        api_cost: 115.00,
        smeplug_plan_id: 'MTN_SME_500MB',
        is_active: true,
        sort_order: 2
      },
      {
        provider: 'airtel',
        category: 'corporate_gifting',
        name: 'Airtel CG 1GB',
        size: '1GB',
        size_mb: 1024,
        validity: '30 Days',
        admin_price: 260.00,
        api_cost: 240.00,
        smeplug_plan_id: 'AIRTEL_CG_1GB',
        is_active: true,
        sort_order: 1
      },
       {
        provider: 'glo',
        category: 'gifting',
        name: 'Glo Gifting 1GB',
        size: '1GB',
        size_mb: 1024,
        validity: '30 Days',
        admin_price: 240.00,
        api_cost: 220.00,
        smeplug_plan_id: 'GLO_GIFTING_1GB',
        is_active: true,
        sort_order: 1
      }
    ]);

    // 3. Create Users
    console.log('Seeding Users...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@peacebundle.com',
      phone: '08011111111',
      password: hashedPassword,
      role: 'admin',
      referral_code: 'ADMIN001',
      account_status: 'active',
      kyc_status: 'verified'
    });

    const regularUser = await User.create({
      name: 'John Doe',
      email: 'user@peacebundle.com',
      phone: '08022222222',
      password: hashedPassword,
      role: 'user',
      referral_code: 'USER001',
      account_status: 'active',
      kyc_status: 'verified'
    });

    // 4. Create Wallets
    console.log('Seeding Wallets...');
    await Wallet.create({
      userId: adminUser.id,
      balance: 50000.00,
      bonus_balance: 1000.00,
      currency: 'NGN'
    });

    await Wallet.create({
      userId: regularUser.id,
      balance: 5000.00,
      bonus_balance: 0.00,
      currency: 'NGN'
    });

    // 5. Create Reseller Pricing for Regular User
    console.log('Seeding Reseller Pricing...');
    // Give John Doe a discount on MTN SME 1GB
    await ResellerPlanPricing.create({
      userId: regularUser.id,
      dataPlanId: plans[0].id, // MTN SME 1GB
      custom_price: 245.00 // Changed from 'price' to 'custom_price' based on model definition
    });

    console.log('Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding Failed:', error);
    process.exit(1);
  }
};

seedDatabase();
