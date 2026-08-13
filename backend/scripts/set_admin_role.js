const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');
const User = require('../models/User');

async function setAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB successfully.');

    const targetEmail = process.argv[2] || 'admin@peacebundlle.com';

    const users = await User.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('email')),
        targetEmail.toLowerCase()
      )
    });

    if (!users || users.length === 0) {
      console.log(`No user found with email: ${targetEmail}`);
      const allUsers = await User.findAll({ attributes: ['id', 'email', 'role'] });
      console.log('Existing users in DB:', allUsers.map(u => ({ email: u.email, role: u.role })));
    } else {
      for (const u of users) {
        console.log(`Found user ${u.email} (current role: ${u.role})`);
        await u.update({ role: 'admin' });
        console.log(`Updated user ${u.email} role to 'admin'`);
      }
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error setting admin role:', error);
    process.exit(1);
  }
}

setAdmin();
