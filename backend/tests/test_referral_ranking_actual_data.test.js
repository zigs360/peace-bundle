const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, Referral } = require('../config/db');
const jwt = require('jsonwebtoken');
const referralService = require('../services/referralService');

describe('Referral Ranking Database Data Fetching & Sync Verification', () => {
  let referrerA, referee1, referee2, referee3, adminUser;
  let tokenA, adminToken;
  const suffix = Date.now();
  const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';

  beforeAll(async () => {
    await connectDB();

    // 1. Create Referrer A with unique referral code
    referrerA = await User.create({
      name: `Referrer Test A ${suffix}`,
      email: `refA_${suffix}@test.com`,
      phone: `080${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
      referral_code: `TOPREF${suffix}`
    });
    tokenA = jwt.sign({ id: referrerA.id }, secret, { expiresIn: '1h' });

    // 2. Create Referee 1: signed up with exact referral code in Users table, NO row in Referral table initially
    referee1 = await User.create({
      name: `Referee One ${suffix}`,
      email: `ref1_${suffix}@test.com`,
      phone: `081${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
      referred_by: `TOPREF${suffix}`
    });

    // 3. Create Referee 2: signed up with lowercase/untrimmed referral code, NO row in Referral table initially
    referee2 = await User.create({
      name: `Referee Two ${suffix}`,
      email: `ref2_${suffix}@test.com`,
      phone: `082${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
      referred_by: `  topref${suffix}  `
    });

    // 4. Create Referee 3: completed a transaction
    referee3 = await User.create({
      name: `Referee Three ${suffix}`,
      email: `ref3_${suffix}@test.com`,
      phone: `083${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'user',
      referred_by: `TOPREF${suffix}`
    });

    await Transaction.create({
      userId: referee3.id,
      amount: 1500,
      balance_before: 5000,
      balance_after: 3500,
      type: 'debit',
      source: 'data_purchase',
      status: 'completed',
      reference: `TEST-TXN-REF-${suffix}`,
    });

    // 5. Admin user
    adminUser = await User.create({
      name: `Admin Ref Test ${suffix}`,
      email: `admin_ref_${suffix}@test.com`,
      phone: `084${String(suffix).slice(-8)}`,
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser.id }, secret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    const userIds = [referrerA?.id, referee1?.id, referee2?.id, referee3?.id, adminUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      await Transaction.destroy({ where: { userId: userIds }, force: true }).catch(() => {});
      await Referral.destroy({ where: { referrerId: referrerA.id }, force: true }).catch(() => {});
      await Referral.destroy({ where: { referredUserId: userIds }, force: true }).catch(() => {});
      await Wallet.destroy({ where: { userId: userIds }, force: true }).catch(() => {});
      await User.destroy({ where: { id: userIds }, force: true }).catch(() => {});
    }
  });

  it('syncReferralRecords discovers and links all referees registered with referred_by in Users table', async () => {
    const syncRes = await referralService.syncReferralRecords({ force: true });
    expect(syncRes.synced).toBe(true);

    // Verify referrals table now has records for referrerA
    const records = await Referral.findAll({
      where: { referrerId: referrerA.id },
      raw: true
    });

    expect(records.length).toBeGreaterThanOrEqual(3);
    const refereeIds = records.map(r => String(r.referredUserId));
    expect(refereeIds).toContain(String(referee1.id));
    expect(refereeIds).toContain(String(referee2.id));
    expect(refereeIds).toContain(String(referee3.id));

    // Referee 3 completed a transaction, so its status should be qualified
    const ref3Record = records.find(r => String(r.referredUserId) === String(referee3.id));
    expect(['qualified', 'rewarded']).toContain(ref3Record.status);
  });

  it('GET /api/users/leaderboard?category=referrals returns actual referral counts from database', async () => {
    const res = await request(app)
      .get('/api/users/leaderboard?category=referrals&period=all_time')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category).toBe('referrals');
    expect(Array.isArray(res.body.leaderboard)).toBe(true);

    // Referrer A should appear with score >= 3
    const myItem = res.body.leaderboard.find(item => item.isCurrentUser);
    expect(myItem).toBeDefined();
    expect(myItem.score).toBeGreaterThanOrEqual(3);
    expect(myItem.totalReferrals).toBeGreaterThanOrEqual(3);
    expect(myItem.qualifiedReferrals).toBeGreaterThanOrEqual(1);

    // myStats should match
    expect(res.body.myStats).toBeDefined();
    expect(res.body.myStats.score).toBeGreaterThanOrEqual(3);
    expect(res.body.myStats.totalReferrals).toBeGreaterThanOrEqual(3);
    expect(res.body.myStats.rank).not.toBe('-');
  });

  it('GET /api/admin/leaderboard?category=referrals returns accurate database records for admin', async () => {
    const res = await request(app)
      .get('/api/admin/leaderboard?category=referrals&period=all_time')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category).toBe('referrals');

    const adminItem = res.body.leaderboard.find(u => String(u.id) === String(referrerA.id));
    expect(adminItem).toBeDefined();
    expect(adminItem.totalReferrals).toBeGreaterThanOrEqual(3);
    expect(adminItem.transactingReferrals).toBeGreaterThanOrEqual(1);
    expect(adminItem.totalReferralTransactions).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/referrals/user/:userId/list fetches all actual referees registered under this user', async () => {
    const res = await request(app)
      .get(`/api/admin/referrals/user/${referrerA.id}/list`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.total).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(data.referrals)).toBe(true);

    const ids = data.referrals.map(r => String(r.id));
    expect(ids).toContain(String(referee1.id));
    expect(ids).toContain(String(referee2.id));
    expect(ids).toContain(String(referee3.id));
  });
});
