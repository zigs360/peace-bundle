const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, Referral } = require('../config/db');
const jwt = require('jsonwebtoken');

describe('Admin Ranking & Top User Rewards', () => {
  let adminUser, normalUser, targetUser;
  let adminToken, normalUserToken;
  const suffix = Date.now();
  const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';

  beforeAll(async () => {
    await connectDB();

    adminUser = await User.create({
      name: 'Super Admin',
      email: `admin-${suffix}@peacebundle.test`,
      phone: `080${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'admin',
    });
    adminToken = jwt.sign({ id: adminUser.id, role: 'admin' }, secret, { expiresIn: '1h' });

    normalUser = await User.create({
      name: 'Normal Customer',
      email: `user-${suffix}@peacebundle.test`,
      phone: `081${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
    });
    normalUserToken = jwt.sign({ id: normalUser.id, role: 'user' }, secret, { expiresIn: '1h' });

    targetUser = await User.create({
      name: 'Top Spender Star',
      email: `topstar-${suffix}@peacebundle.test`,
      phone: `090${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
    });

    await Wallet.update(
      { balance: 1000 },
      { where: { userId: targetUser.id } }
    );

    // Create completed transaction for targetUser
    await Transaction.create({
      userId: targetUser.id,
      amount: 25000,
      balance_before: 26000,
      balance_after: 1000,
      type: 'debit',
      source: 'data_purchase',
      status: 'completed',
      reference: `TEST-RANK-${suffix}-1`,
    });
  });

  afterAll(async () => {
    const userIds = [adminUser?.id, normalUser?.id, targetUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      await Transaction.destroy({ where: { userId: userIds }, force: true });
      await Wallet.destroy({ where: { userId: userIds }, force: true });
      await User.destroy({ where: { id: userIds }, force: true });
    }
  });

  describe('GET /api/admin/leaderboard (Admin Ranking)', () => {
    it('blocks unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/leaderboard');
      expect(res.statusCode).toBe(401);
    });

    it('blocks regular users with 403', async () => {
      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${normalUserToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('returns full unmasked ranking data, metrics, and summaries for admin', async () => {
      const res = await request(app)
        .get('/api/admin/leaderboard?category=volume&period=all_time')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalRankedUsers).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.leaderboard)).toBe(true);

      const target = res.body.leaderboard.find((u) => u.id === targetUser.id);
      expect(target).toBeDefined();
      expect(target.name).toBe('Top Spender Star');
      expect(target.email).toBe(targetUser.email);
      expect(target.phone).toBe(targetUser.phone);
      expect(target.totalVolume).toBe(25000);
      expect(target.walletBalance).toBe(1000);
      expect(target.rank).toBe(1);
    });
  });

  describe('POST /api/admin/leaderboard/reward (Activity Rewards)', () => {
    it('blocks non-admin users from awarding bonuses', async () => {
      const res = await request(app)
        .post('/api/admin/leaderboard/reward')
        .set('Authorization', `Bearer ${normalUserToken}`)
        .send({
          userId: targetUser.id,
          amount: 500,
          title: 'Unauthorized Bonus',
        });
      expect(res.statusCode).toBe(403);
    });

    it('rejects invalid reward amounts', async () => {
      const res = await request(app)
        .post('/api/admin/leaderboard/reward')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: targetUser.id,
          amount: -100,
        });
      expect(res.statusCode).toBe(400);
    });

    it('awards and credits the ranked user wallet with audit transaction', async () => {
      const res = await request(app)
        .post('/api/admin/leaderboard/reward')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: targetUser.id,
          amount: 2500,
          title: 'Weekly Volume Champion Bonus',
          reason: 'Highest data purchase volume of the week',
          notifyUser: true,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newBalance).toBe(3500); // 1000 + 2500
      expect(res.body.transaction).toBeDefined();
      expect(res.body.transaction.amount).toBe(2500);

      // Verify in DB
      const updatedWallet = await Wallet.findOne({ where: { userId: targetUser.id } });
      expect(parseFloat(updatedWallet.balance)).toBe(3500);
    });
  });

  describe('GET /api/users/leaderboard (User Dashboard Spend Privacy)', () => {
    it('does NOT expose monetary volume spent in public leaderboard items', async () => {
      const res = await request(app)
        .get('/api/users/leaderboard?category=volume&period=all_time')
        .set('Authorization', `Bearer ${normalUserToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.leaderboard)).toBe(true);

      for (const item of res.body.leaderboard) {
        expect(item.volume).toBeUndefined();
        expect(item).not.toHaveProperty('email');
        expect(item).not.toHaveProperty('phone');
        expect(item).not.toHaveProperty('walletBalance');
      }
    });
  });
});
