const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const AdminWalletDeduction = require('../models/AdminWalletDeduction');

describe('Admin wallet deduction + rollback', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  });

  beforeEach(async () => {
    await AdminWalletDeduction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
  });

  const makeUser = async (role, emailPrefix) => {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('password123', salt);
    const user = await User.create({
      name: `${role} user`,
      email: `${emailPrefix}_${Date.now()}@test.com`,
      phone: `081${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role,
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 50000, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return user;
  };

  it('deducts from user wallet with password re-auth and records audit', async () => {
    const admin = await makeUser('admin', 'admin_deduct');
    const user = await makeUser('user', 'target_deduct');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/admin/wallet/deductions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ userId: user.id, amount: 45000, reason: 'Overfunding correction', admin_password: 'password123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference).toBeTruthy();

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(String(walletAfter.balance))).toBe(5000);
  });

  it('blocks invalid admin password', async () => {
    const admin = await makeUser('admin', 'admin_badpw');
    const user = await makeUser('user', 'target_badpw');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/admin/wallet/deductions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: user.id, amount: 1000, reason: 'Test', admin_password: 'wrong' });

    expect(res.statusCode).toBe(401);
  });

  it('prevents negative balance', async () => {
    const admin = await makeUser('admin', 'admin_negbal');
    const user = await makeUser('user', 'target_negbal');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/api/admin/wallet/deductions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: user.id, amount: 999999, reason: 'Test', admin_password: 'password123' });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message).toLowerCase()).toContain('insufficient');
  });

  it('allows super-admin rollback within 24h', async () => {
    const admin = await makeUser('admin', 'admin_deduct2');
    const superAdmin = await makeUser('super_admin', 'super_admin');
    const user = await makeUser('user', 'target_rev');

    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const superToken = jwt.sign({ id: superAdmin.id }, process.env.JWT_SECRET);

    const deduct = await request(app)
      .post('/api/admin/wallet/deductions')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ userId: user.id, amount: 45000, reason: 'Overfunding correction', admin_password: 'password123' });

    expect(deduct.statusCode).toBe(200);
    const ref = deduct.body.data.reference;

    const reverse = await request(app)
      .post(`/api/admin/wallet/deductions/${ref}/reverse`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'Mistake', admin_password: 'password123' });

    expect(reverse.statusCode).toBe(200);
    expect(reverse.body.data.status).toBe('reversed');

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(String(walletAfter.balance))).toBe(50000);
  });
});
