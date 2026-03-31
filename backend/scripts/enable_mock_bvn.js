const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { connectDB, sequelize } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

async function run() {
  await connectDB();
  await SystemSetting.set('allow_mock_bvn', true, 'boolean', 'api');
  const value = await SystemSetting.get('allow_mock_bvn');
  // eslint-disable-next-line no-console
  console.log('allow_mock_bvn:', value);
  await sequelize.close();
}

run().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  try {
    await sequelize.close();
  } catch (_) {}
  process.exit(1);
});

