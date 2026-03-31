const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { connectDB, sequelize } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

async function run() {
  await connectDB();
  await SystemSetting.set('allow_mock_bvn', true, 'boolean', 'api');
  const value = await SystemSetting.get('allow_mock_bvn');
  console.log('allow_mock_bvn:', value);
  await sequelize.close();
}

run().catch(async (e) => {
  console.error(e);
  try {
    await sequelize.close();
  } catch (closeErr) {
    void closeErr;
  }
  process.exit(1);
});
