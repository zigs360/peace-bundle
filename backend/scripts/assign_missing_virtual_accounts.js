const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { connectDB, sequelize } = require('../config/db');
const virtualAccountService = require('../services/virtualAccountService');

const getArg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

async function run() {
  const batchSize = parseInt(getArg('--batch-size') || '100', 10);
  const maxUsers = getArg('--max-users') ? parseInt(getArg('--max-users'), 10) : Infinity;
  const notify = process.argv.includes('--no-notify') ? false : true;
  const includeInactive = process.argv.includes('--include-inactive');
  const dryRun = process.argv.includes('--dry-run');

  try {
    await connectDB();
    const summary = await virtualAccountService.bulkAssignMissingVirtualAccounts({
      batchSize,
      maxUsers,
      notify,
      includeInactive,
      dryRun,
    });

    console.log(JSON.stringify(summary, null, 2));
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('Bulk VA assignment failed:', e.message);
    try {
      await sequelize.close();
    } catch (e2) {
      void e2;
    }
    process.exit(1);
  }
}

run();

