const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Op } = require('sequelize');
const { connectDB, sequelize, User } = require('../config/db');

async function run() {
  try {
    await connectDB();

    const total = await User.count();
    const withVA = await User.count({ where: { virtual_account_number: { [Op.ne]: null } } });
    const withoutVA = await User.count({ where: { virtual_account_number: null } });
    const activeWithoutVA = await User.count({ where: { virtual_account_number: null, account_status: 'active' } });

    const sample = await User.findAll({
      where: { virtual_account_number: { [Op.ne]: null } },
      attributes: ['id', 'email', 'virtual_account_number', 'virtual_account_bank'],
      limit: 5,
      order: [['createdAt', 'DESC']],
    });

    console.log(
      JSON.stringify(
        {
          total,
          withVA,
          withoutVA,
          activeWithoutVA,
          sample,
        },
        null,
        2,
      ),
    );

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('VA status check failed:', e.message);
    try {
      await sequelize.close();
    } catch (e2) {
      void e2;
    }
    process.exit(1);
  }
}

run();

