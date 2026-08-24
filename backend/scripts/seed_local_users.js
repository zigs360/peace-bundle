const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    await connectDB();
    await sequelize.sync({ alter: true });

    const hashedPassword = await bcrypt.hash('password123', 10);

    // 1. Admin User
    let admin = await User.findOne({ where: { email: 'admin@peacebundlle.com' } });
    if (!admin) {
      admin = await User.create({
        name: 'Admin User',
        email: 'admin@peacebundlle.com',
        phone: '08012345678',
        password: hashedPassword,
        role: 'admin',
        account_status: 'active',
        kyc_status: 'approved',
      });
      console.log('Created Admin User: admin@peacebundlle.com');
    } else {
      await admin.update({ role: 'admin', password: hashedPassword });
      console.log('Updated Admin User: admin@peacebundlle.com');
    }

    let adminWallet = await Wallet.findOne({ where: { userId: admin.id } });
    if (!adminWallet) {
      await Wallet.create({ userId: admin.id, balance: 100000 });
    }

    // 2. Regular Test User
    let user = await User.findOne({ where: { email: 'user@peacebundlle.com' } });
    if (!user) {
      user = await User.create({
        name: 'Test User',
        email: 'user@peacebundlle.com',
        phone: '08087654321',
        password: hashedPassword,
        role: 'user',
        account_status: 'active',
        kyc_status: 'approved',
      });
      console.log('Created Regular User: user@peacebundlle.com');
    } else {
      await user.update({ password: hashedPassword });
      console.log('Updated Regular User: user@peacebundlle.com');
    }

    let userWallet = await Wallet.findOne({ where: { userId: user.id } });
    if (!userWallet) {
      await Wallet.create({ userId: user.id, balance: 50000 });
    }

    console.log('\n--- SEED COMPLETE ---');
    console.log('Admin Email: admin@peacebundlle.com | Password: password123');
    console.log('User Email:  user@peacebundlle.com  | Password: password123');

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
