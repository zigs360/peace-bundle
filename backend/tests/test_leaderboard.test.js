const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, Referral } = require('../config/db');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');

describe('Dynamic Leaderboard Endpoint', () => {
  let userA, userB, tokenA;
  const suffix = Date.now();

  beforeAll(async () => {
    await connectDB();

    userA = await User.create({
      name: 'Alice Johnson',
      email: `alice-${suffix}@test.com`,
      phone: `080${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
    });

    userB = await User.create({
      name: 'Bob Smith',
      email: `bob-${suffix}@test.com`,
      phone: `081${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
    });

    const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
    tokenA = jwt.sign({ id: userA.id }, secret, { expiresIn: '1h' });

    // Create completed transaction for user A
    await Transaction.create({
      userId: userA.id,
      amount: 5000,
      balance_before: 10000,
      balance_after: 5000,
      type: 'debit',
      source: 'data_purchase',
      status: 'completed',
      reference: `TEST-LEAD-${suffix}-A`,
    });

    // Create completed transaction for user B (higher volume)
    await Transaction.create({
      userId: userB.id,
      amount: 15000,
      balance_before: 20000,
      balance_after: 5000,
      type: 'debit',
      source: 'data_purchase',
      status: 'completed',
      reference: `TEST-LEAD-${suffix}-B`,
    });
  });

  afterAll(async () => {
    if (userA && userB) {
      await Transaction.destroy({
        where: { userId: [userA.id, userB.id] },
        force: true,
      });
      await Wallet.destroy({
        where: { userId: [userA.id, userB.id] },
        force: true,
      });
      await User.destroy({
        where: { id: [userA.id, userB.id] },
        force: true,
      });
    }
  });

  it('GET /api/users/leaderboard?category=volume returns ranking with masked names and no PII leak', async () => {
    const res = await request(app)
      .get('/api/users/leaderboard?category=volume&period=all_time')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);

    const entries = res.body.leaderboard;
    expect(entries.length).toBeGreaterThan(0);

    for (const item of entries) {
      // Must not leak private sensitive fields
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('phone');
      expect(item).not.toHaveProperty('wallet_balance');
      expect(item).not.toHaveProperty('userId');

      // Must have rank, score, and masked displayName
      expect(item).toHaveProperty('rank');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('displayName');
      expect(typeof item.displayName).toBe('string');
      // Names are formatted like "Alice J." or "Bob S."
      expect(item.displayName).toMatch(/\./);
    }

    // Check myStats for userA
    expect(res.body.myStats).toBeTruthy();
    expect(res.body.myStats.volume).toBeGreaterThanOrEqual(5000);
  });

  it('GET /api/users/leaderboard?category=transactions ranks by transaction count', async () => {
    const res = await request(app)
      .get('/api/users/leaderboard?category=transactions&period=all_time')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category).toBe('transactions');
  });

  it('GET /api/users/leaderboard?category=referrals ranks by referrals', async () => {
    const res = await request(app)
      .get('/api/users/leaderboard?category=referrals&period=all_time')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category).toBe('referrals');
  });
});
