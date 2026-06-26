process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../server');
const sequelize = require('../config/database');
const { User, Wallet, Referral, Commission, Transaction } = require('../models');

async function main() {
  await sequelize.sync({ force: true });

  const adminPassword = await bcrypt.hash('password123', 4);
  const referrerPassword = await bcrypt.hash('password123', 4);
  const pinHash = await bcrypt.hash('1994', 4);

  const admin = await User.create({
    name: 'Admin User',
    email: 'admin-referral@test.com',
    phone: '08099990001',
    password: adminPassword,
    role: 'admin',
    account_status: 'active',
    referral_code: 'ADM0001',
    transaction_pin_hash: pinHash,
  });
  const referrer = await User.create({
    name: 'Referrer User',
    email: 'referrer@test.com',
    phone: '08099990002',
    password: referrerPassword,
    role: 'user',
    account_status: 'active',
    referral_code: 'REF1234',
    transaction_pin_hash: pinHash,
  });

  const referrerToken = jwt.sign({ id: referrer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const referredAgent = request.agent(app);
  const registerRes = await referredAgent.post('/api/auth/register').send({
    fullName: 'Referred User',
    email: 'referred@test.com',
    phone: '08099990003',
    password: 'password123',
    referralCode: 'REF1234',
  });

  const referredUser = await User.findOne({ where: { email: 'referred@test.com' } });
  await referredUser.update({ transaction_pin_hash: pinHash });

  const pinRes = await referredAgent
    .post('/api/auth/transaction-pin/session')
    .set('Authorization', `Bearer ${jwt.sign({ id: referredUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' })}`)
    .send({ pin: '1994', scope: 'financial' });

  const fundRes = await referredAgent
    .post('/api/transactions/fund')
    .set('Authorization', `Bearer ${jwt.sign({ id: referredUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' })}`)
    .send({ amount: 1000, reference: 'REF-FUND-001' });

  const referrerStatsRes = await request(app)
    .get('/api/users/affiliate-stats')
    .set('Authorization', `Bearer ${referrerToken}`);

  const adminStatsRes = await request(app)
    .get('/api/admin/referrals/analytics')
    .set('Authorization', `Bearer ${adminToken}`);

  const referralRows = await Referral.findAll();
  const commissionRows = await Commission.findAll();
  const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
  const bonusTxn = await Transaction.findOne({ where: { userId: referrer.id, source: 'bonus' } });

  process.stdout.write(`${JSON.stringify({
    register: { status: registerRes.statusCode, body: registerRes.body },
    transactionPinSession: { status: pinRes.statusCode, body: pinRes.body },
    fund: { status: fundRes.statusCode, body: fundRes.body },
    referrerStats: { status: referrerStatsRes.statusCode, body: referrerStatsRes.body },
    adminStats: { status: adminStatsRes.statusCode, body: adminStatsRes.body },
    database: {
      referredBy: referredUser?.referred_by || null,
      referralRows: referralRows.map((row) => row.toJSON()),
      commissionRows: commissionRows.map((row) => row.toJSON()),
      referrerWallet: referrerWallet ? {
        balance: referrerWallet.balance,
        bonus_balance: referrerWallet.bonus_balance,
        commission_balance: referrerWallet.commission_balance,
      } : null,
      bonusTxn: bonusTxn ? {
        reference: bonusTxn.reference,
        amount: bonusTxn.amount,
        source: bonusTxn.source,
        status: bonusTxn.status,
      } : null,
    },
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
