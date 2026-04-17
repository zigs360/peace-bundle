const { connectDB } = require('../config/db');
const callSubMigrationService = require('../services/callSubMigrationService');

const provider = process.argv[2] || 'airtel';
const dryRun = process.argv.includes('--dry-run');

const run = async () => {
  try {
    await connectDB();
    const result = await callSubMigrationService.migrateActiveLegacyValidityBundles(provider, {
      dryRun,
      migrationAt: new Date(),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Legacy validity migration failed:', error);
    process.exit(1);
  }
};

run();
