const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

describe('Admin User Fund & Deduct with Idempotency Guard', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  });

  const makeUser = async (role, emailPrefix, initialBalance = 10000) => {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('password123', salt);
    const user = await User.create({
      name: `${role} user`,
      email: `${emailPrefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role,
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (wallet) {
      await wallet.update({ balance: initialBalance, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    }
    return user;
  };

  it('funds user wallet and guards against double-funding with idempotency key', async () => {
    const admin = await makeUser('admin', 'admin_fund_test');
    const user = await makeUser('user', 'target_fund_test', 5000);
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const idempotencyKey = `fund-key-${Date.now()}`;

    // First fund request
    const res1 = await request(app)
      .post(`/api/admin/users/${user.id}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', idempotencyKey)
      .send({ amount: 2000, reason: 'Promotional bonus' });

    expect(res1.statusCode).toBe(200);
    expect(res1.body.success).toBe(true);

    const walletAfter1 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter1.balance)).toBe(7000);

    // Second fund request with the same idempotency key
    const res2 = await request(app)
      .post(`/api/admin/users/${user.id}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', idempotencyKey)
      .send({ amount: 2000, reason: 'Promotional bonus' });

    expect([409, 200]).toContain(res2.statusCode);
    if (res2.statusCode === 409) {
      expect(res2.body.message).toContain('already processed');
    }

    // Verify balance was NOT double-credited
    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter2.balance)).toBe(7000);
  });

  it('deducts from user wallet and guards against duplicate deduction with idempotency key', async () => {
    const admin = await makeUser('admin', 'admin_deduct_test');
    const user = await makeUser('user', 'target_deduct_test', 8000);
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
    const idempotencyKey = `deduct-key-${Date.now()}`;

    // First deduct request
    const res1 = await request(app)
      .post(`/api/admin/users/${user.id}/deduct`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', idempotencyKey)
      .send({ amount: 3000, reason: 'Reversal of erroneous credit' });

    expect(res1.statusCode).toBe(200);
    expect(res1.body.success).toBe(true);

    const walletAfter1 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter1.balance)).toBe(5000);

    // Duplicate deduct request with same idempotency key
    const res2 = await request(app)
      .post(`/api/admin/users/${user.id}/deduct`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', idempotencyKey)
      .send({ amount: 3000, reason: 'Reversal of erroneous credit' });

    expect([409, 200]).toContain(res2.statusCode);
    if (res2.statusCode === 409) {
      expect(res2.body.message).toContain('already processed');
    }

    // Balance remains 5000 and was not deducted twice
    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter2.balance)).toBe(5000);
  });

  it('rejects deduction when amount exceeds user balance', async () => {
    const admin = await makeUser('admin', 'admin_overdeduct');
    const user = await makeUser('user', 'target_overdeduct', 1000);
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/deduct`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 5000, reason: 'Too much' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message.toLowerCase()).toContain('insufficient');
  });
});
