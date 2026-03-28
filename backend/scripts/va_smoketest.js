const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../config/db');
const { sequelize, User, SystemSetting, connectDB } = db;
const virtualAccountService = require('../services/virtualAccountService');

async function run() {
  try {
    await connectDB();

    const allowMockBvn = await SystemSetting.get('allow_mock_bvn');
    console.log('allow_mock_bvn:', allowMockBvn);

    let user = await User.findOne({
      where: { virtual_account_number: null, account_status: 'active' },
      order: [['createdAt', 'DESC']],
    });

    if (!user) {
      user = await User.create({
        name: 'VA Smoke Test User',
        email: `va_smoke_${Date.now()}@test.com`,
        phone: '08011001100',
        password: 'password123',
        role: 'user',
        account_status: 'active',
      });
      console.log('Created user:', user.email, user.id);
    } else {
      console.log('Using existing user:', user.email, user.id);
    }

    const result = await virtualAccountService.assignVirtualAccount(user);
    console.log('assignVirtualAccount result:', result);

    const updated = await User.findByPk(user.id);
    console.log('Saved fields:', {
      virtual_account_number: updated.virtual_account_number,
      virtual_account_bank: updated.virtual_account_bank,
      virtual_account_name: updated.virtual_account_name,
    });

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('VA smoke test failed:', e.message);
    try {
      await sequelize.close();
    } catch (e2) {
      void e2;
    }
    process.exit(1);
  }
}

run();
