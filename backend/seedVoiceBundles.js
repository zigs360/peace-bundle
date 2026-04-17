const { connectDB } = require('./config/db');
const VoiceBundle = require('./models/VoiceBundle');
const { Op } = require('sequelize');

const seedVoiceBundles = async () => {
  try {
    await connectDB();
    
    // Sync table without force to avoid clearing other data
    await VoiceBundle.sync();

    const bundles = [
      { network: 'airtel', plan_name: 'Call Sub 10 Minutes', amount: 120, validity: '3 days', api_plan_id: 'ATM-120-10M' },
      { network: 'airtel', plan_name: 'Call Sub 20 Minutes', amount: 230, validity: '7 days', api_plan_id: 'ATM-230-20M' },
      { network: 'airtel', plan_name: 'Call Sub 30 Minutes', amount: 330, validity: '7 days', api_plan_id: 'ATM-330-30M' },
      { network: 'airtel', plan_name: 'Call Sub 50 Minutes', amount: 700, validity: '14 days', api_plan_id: 'ATM-700-50M' },
      { network: 'airtel', plan_name: 'Call Sub 150 Minutes', amount: 2000, validity: '30 days', api_plan_id: 'ATM-2000-150M-30D' },
    ];

    console.log('Seeding Airtel Call Sub minute bundles...');

    await VoiceBundle.update(
      { is_active: false },
      {
        where: {
          network: 'airtel',
          api_plan_id: {
            [Op.notIn]: bundles.map((bundle) => bundle.api_plan_id),
          },
        },
      }
    );
    
    for (const bundle of bundles) {
      await VoiceBundle.findOrCreate({
        where: { api_plan_id: bundle.api_plan_id },
        defaults: bundle
      });
    }

    console.log('Voice bundles seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding voice bundles:', error);
    process.exit(1);
  }
};

seedVoiceBundles();
