const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const path = require('path');

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const SystemSetting = require('../models/SystemSetting');

// Setup Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

const runVerification = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB Connected successfully');

    // 1. Seed Initial Settings
    console.log('\n--- Seeding Settings ---');
    const settingsToSeed = [
      { key: 'site_name', value: 'Peace Bundle', group: 'general' },
      { key: 'support_email', value: 'support@peacebundle.com', group: 'general' },
      { key: 'min_wallet_fund', value: '100', group: 'payment' },
      { key: 'data_config', value: JSON.stringify({ provider: 'mtn', rate: 250 }), group: 'api' }
    ];

    for (const s of settingsToSeed) {
      await SystemSetting.findOrCreate({
        where: { key: s.key },
        defaults: s
      });
    }
    console.log('✅ Settings seeded');

    // 2. Simulate getSystemSettings (Grouped)
    console.log('\n--- Testing getSystemSettings Logic ---');
    const allSettings = await SystemSetting.findAll({
      order: [['group', 'ASC'], ['key', 'ASC']]
    });

    const grouped = allSettings.reduce((acc, setting) => {
        const group = setting.group || 'general';
        if (!acc[group]) acc[group] = [];
        acc[group].push({
            key: setting.key, 
            value: setting.value,
            description: setting.description
        });
        return acc;
    }, {});

    console.log('Grouped Settings:', JSON.stringify(grouped, null, 2));
    
    if (grouped.general && grouped.payment) {
        console.log('✅ Grouping logic works');
    } else {
        console.error('❌ Grouping logic failed');
    }

    // 3. Simulate updateSystemSettings (Bulk Update)
    console.log('\n--- Testing updateSystemSettings Logic ---');
    const updates = {
        site_name: 'Peace Bundle Updated',
        min_wallet_fund: '500',
        data_config: { provider: 'airtel', rate: 240 } // Object handling
    };

    console.log('Applying updates:', updates);

    await Promise.all(Object.keys(updates).map(async (key) => {
        const valueToStore = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : String(updates[key]);
        
        const [setting] = await SystemSetting.findOrCreate({
            where: { key },
            defaults: { value: valueToStore, group: 'general' }
        });

        if (setting.value !== valueToStore) {
            setting.value = valueToStore;
            await setting.save();
            console.log(`Updated ${key} to ${valueToStore}`);
        } else {
            console.log(`No change for ${key}`);
        }
    }));

    // Verify Update
    const updatedSiteName = await SystemSetting.findOne({ where: { key: 'site_name' } });
    const updatedConfig = await SystemSetting.findOne({ where: { key: 'data_config' } });

    if (updatedSiteName.value === 'Peace Bundle Updated' && updatedConfig.value.includes('airtel')) {
        console.log('✅ Bulk update logic works');
    } else {
        console.error('❌ Bulk update logic failed');
        console.log('Site Name:', updatedSiteName.value);
        console.log('Config:', updatedConfig.value);
    }

  } catch (error) {
    console.error('❌ Verification Error:', error);
  } finally {
    await sequelize.close();
  }
};

runVerification();
