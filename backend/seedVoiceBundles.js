const { connectDB } = require('./config/db');
const VoiceBundle = require('./models/VoiceBundle');

const seedVoiceBundles = async () => {
  try {
    await connectDB();
    
    // Sync table without force to avoid clearing other data
    await VoiceBundle.sync();

    const bundles = [
      { network: 'airtel', plan_name: 'TalkMore 100', amount: 100, validity: '3 days', api_plan_id: 'TM100' },
      { network: 'airtel', plan_name: 'TalkMore 200', amount: 200, validity: '7 days', api_plan_id: 'TM200' },
      { network: 'airtel', plan_name: 'TalkMore 300', amount: 300, validity: '7 days', api_plan_id: 'TM300' },
      { network: 'airtel', plan_name: 'TalkMore 500', amount: 500, validity: '14 days', api_plan_id: 'TM500' },
      { network: 'airtel', plan_name: 'TalkMore 1000', amount: 1000, validity: '14 days', api_plan_id: 'TM1000' },
      { network: 'airtel', plan_name: 'TalkMore 1500', amount: 1500, validity: '30 days', api_plan_id: 'TM1500' },
    ];

    console.log('Seeding Airtel TalkMore bundles...');
    
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
