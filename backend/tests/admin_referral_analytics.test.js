const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, Referral } = require('../config/db');

describe('Admin Referral Analytics and Ranking Module', () => {
  let adminUser;
  let referrerUser;
  let activeReferee;
  let inactiveReferee;
  let newReferee;
  let regularUser;
  let adminToken;
  let regularToken;
  let activeWallet;
  let inactiveWallet;

  async function getOrCreateWallet(userId, balance = 0) {
    let w = await Wallet.findOne({ where: { userId } });
    if (w) {
      await w.update({ balance });
    } else {
      w = await Wallet.create({ userId, balance });
    }
    return w;
  }

  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';

    const timestamp = Date.now();

    // 1. Admin user
    adminUser = await User.create({
      name: `Admin Referral ${timestamp}`,
      email: `admin_ref_${timestamp}@test.com`,
      phone: `080${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    // 2. Referrer user
    referrerUser = await User.create({
      name: `Top Referrer ${timestamp}`,
      email: `referrer_${timestamp}@test.com`,
      phone: `081${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      referral_code: `REF${timestamp}`
    });
    await getOrCreateWallet(referrerUser.id, 5000);

    // 3. Active referee (made purchases recently)
    activeReferee = await User.create({
      name: `Alpha Active ${timestamp}`,
      email: `alpha_active_${timestamp}@test.com`,
      phone: `082${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    });
    activeWallet = await getOrCreateWallet(activeReferee.id, 2000);

    // 4. Inactive referee (registered 40 days ago, last tx 35 days ago)
    inactiveReferee = await User.create({
      name: `Beta Inactive ${timestamp}`,
      email: `beta_inactive_${timestamp}@test.com`,
      phone: `083${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    });
    inactiveWallet = await getOrCreateWallet(inactiveReferee.id, 500);

    // 5. New referee (joined 2 days ago, 0 tx)
    newReferee = await User.create({
      name: `New Referee ${timestamp}`,
      email: `new_ref_${timestamp}@test.com`,
      phone: `084${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    });
    await getOrCreateWallet(newReferee.id, 0);

    // 6. Regular user without admin privileges
    regularUser = await User.create({
      name: `Regular User ${timestamp}`,
      email: `regular_${timestamp}@test.com`,
      phone: `085${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    adminToken = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    regularToken = jwt.sign({ id: regularUser.id }, process.env.JWT_SECRET);

    // Create Referral Records
    await Referral.create({
      referrerId: referrerUser.id,
      referredUserId: activeReferee.id,
      registered_at: activeReferee.createdAt,
      status: 'active',
      referrer_signup_bonus_amount: 100,
      total_commissions_earned: 50,
      qualifying_deposit_amount: 1000,
      qualifying_deposit_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    });

    await Referral.create({
      referrerId: referrerUser.id,
      referredUserId: inactiveReferee.id,
      registered_at: inactiveReferee.createdAt,
      status: 'active',
      referrer_signup_bonus_amount: 100,
      total_commissions_earned: 20,
      qualifying_deposit_amount: 500,
      qualifying_deposit_at: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000)
    });

    await Referral.create({
      referrerId: referrerUser.id,
      referredUserId: newReferee.id,
      registered_at: newReferee.createdAt,
      status: 'active',
      referrer_signup_bonus_amount: 0,
      total_commissions_earned: 0,
      qualifying_deposit_amount: 0,
    });

    // Create Transactions for Active Referee
    // Funding transaction
    await Transaction.create({
      userId: activeReferee.id,
      walletId: activeWallet.id,
      type: 'credit',
      amount: 3000,
      balance_before: 0,
      balance_after: 3000,
      status: 'completed',
      source: 'funding',
      reference: `FUND_ACT_${timestamp}`,
      description: 'Wallet Funding via Monnify',
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    });

    // Service Data purchase transaction (recent, within 5 days)
    await Transaction.create({
      userId: activeReferee.id,
      walletId: activeWallet.id,
      type: 'debit',
      amount: 1200,
      balance_before: 3000,
      balance_after: 1800,
      status: 'completed',
      source: 'data_purchase',
      reference: `DATA_ACT_${timestamp}`,
      description: 'MTN 2.5GB Data Purchase',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    });

    // Service Airtime purchase transaction
    await Transaction.create({
      userId: activeReferee.id,
      walletId: activeWallet.id,
      type: 'debit',
      amount: 500,
      balance_before: 1800,
      balance_after: 1300,
      status: 'completed',
      source: 'airtime_purchase',
      reference: `AIR_ACT_${timestamp}`,
      description: 'Airtel Airtime Purchase',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    });

    // Create Old Transaction for Inactive Referee (35 days ago)
    await Transaction.create({
      userId: inactiveReferee.id,
      walletId: inactiveWallet.id,
      type: 'debit',
      amount: 800,
      balance_before: 1300,
      balance_after: 500,
      status: 'completed',
      source: 'data_purchase',
      reference: `DATA_INACT_${timestamp}`,
      description: 'Glo 1GB Data Purchase',
      createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    });
  });

  afterAll(async () => {
    try {
      await Referral.destroy({ where: { referrerId: referrerUser.id } });
      await Transaction.destroy({
        where: {
          userId: [activeReferee.id, inactiveReferee.id]
        }
      });
      await Wallet.destroy({
        where: {
          userId: [adminUser.id, referrerUser.id, activeReferee.id, inactiveReferee.id, newReferee.id, regularUser.id]
        }
      });
      await User.destroy({
        where: {
          id: [adminUser.id, referrerUser.id, activeReferee.id, inactiveReferee.id, newReferee.id, regularUser.id]
        }
      });
    } catch (e) {
      // Ignore cleanup error
    }
  });

  describe('Leaderboard Endpoint with Referrals Category', () => {
    it('should return referral rankings with conversion rate, active counts and spend metrics', async () => {
      const res = await request(app)
        .get('/api/admin/leaderboard?category=referrals&sort=conversion_rate&inactivityDays=30')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.category).toBe('referrals');
      expect(Array.isArray(res.body.leaderboard)).toBe(true);

      const targetEntry = res.body.leaderboard.find(u => u.id === referrerUser.id);
      expect(targetEntry).toBeDefined();
      expect(targetEntry.totalReferrals).toBe(3);
      expect(targetEntry.activeReferrals).toBe(1); // activeReferee is within 30d
      expect(targetEntry.inactiveReferrals).toBe(2); // inactiveReferee (>30d) and newReferee (0 tx)
      expect(targetEntry.transactingReferrals).toBe(2); // activeReferee and inactiveReferee have txs
      expect(targetEntry.conversionRate).toBeGreaterThan(0);
      expect(targetEntry.totalReferralVolume).toBe(2500); // 1200 + 500 + 800 (excludes 3000 funding!)
      expect(targetEntry.totalBonusEarned).toBe(270); // 100+50 + 100+20 + 0
    });

    it('should deny non-admin users from accessing referral leaderboard', async () => {
      const res = await request(app)
        .get('/api/admin/leaderboard?category=referrals')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('User Referral Analytics Summary Endpoint', () => {
    it('should return comprehensive referral metrics for the selected user', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/summary?inactivityDays=30`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const { user, metrics } = res.body.data;
      expect(user.id).toBe(referrerUser.id);
      expect(user.name).toBe(referrerUser.name);
      expect(metrics.totalReferrals).toBe(3);
      expect(metrics.activeReferrals).toBe(1);
      expect(metrics.transactingReferrals).toBe(2);
      expect(metrics.conversionRate).toBe(66.7);
      expect(metrics.totalQualifyingVolume).toBe(2500);
      expect(metrics.totalFundingVolume).toBe(3000);
      expect(metrics.totalBonusEarned).toBe(270);

      // Verify service breakdown
      expect(metrics.serviceBreakdown.data.amount).toBe(2000); // 1200 + 800
      expect(metrics.serviceBreakdown.airtime.amount).toBe(500);
      expect(metrics.activityBreakdown.active).toBe(1);
      expect(metrics.activityBreakdown.new).toBe(1);
      expect(metrics.activityBreakdown.inactive).toBe(1);
    });

    it('should return 404 if user does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/admin/referrals/user/${fakeId}/summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('User Referrals Paginated Directory Endpoint', () => {
    it('should return paginated referrals list with engagement and financial status', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/list?page=1&limit=10&inactivityDays=30`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.referrals.length).toBe(3);

      const activeRef = res.body.data.referrals.find(r => r.id === activeReferee.id);
      expect(activeRef).toBeDefined();
      expect(activeRef.activityStatus).toBe('active');
      expect(activeRef.funding.amount).toBe(3000);
      expect(activeRef.transactions.successfulVolume).toBe(1700); // 1200 data + 500 airtime
      expect(activeRef.bonusGenerated).toBe(150); // 100 signup + 50 commission

      const newRef = res.body.data.referrals.find(r => r.id === newReferee.id);
      expect(newRef).toBeDefined();
      expect(newRef.activityStatus).toBe('new');
    });

    it('should filter referrals by activity status', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/list?status=active&inactivityDays=30`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.referrals[0].id).toBe(activeReferee.id);
    });

    it('should filter referrals by search keyword', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/list?search=${activeReferee.email}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.referrals[0].id).toBe(activeReferee.id);
    });
  });

  describe('User Referrals CSV Export Endpoint', () => {
    it('should export referral records as CSV with correct content type and headers', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/export?inactivityDays=30`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');
      expect(res.text).toContain('Referral ID,Full Name,Email,Phone,Registration Date');
      expect(res.text).toContain('Activity Status');
      expect(res.text).toContain(activeReferee.email);
      expect(res.text).toContain('active');
    });

    it('should deny non-admin users from exporting CSV', async () => {
      const res = await request(app)
        .get(`/api/admin/referrals/user/${referrerUser.id}/export`)
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(403);
    });
  });
});
