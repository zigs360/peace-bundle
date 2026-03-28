const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');

async function run() {
  try {
    await sequelize.authenticate();

    const tables = ['Users', 'Wallets', 'Sims', 'transactions', 'system_settings'];
    for (const table of tables) {
      const [rows] = await sequelize.query(
        `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = :table
          ORDER BY ordinal_position
        `,
        { replacements: { table } },
      );

      console.log(`\n${table}:`);
      for (const r of rows) {
        console.log(`- ${r.column_name} (${r.data_type})`);
      }
    }

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('Introspect failed:', e.message);
    try {
      await sequelize.close();
    } catch (_) {}
    process.exit(1);
  }
}

run();

