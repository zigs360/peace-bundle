const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, Referral, SystemSetting } = require('../config/db');
const jwt = require('jsonwebtoken');
const referralService = require('../services/referralService');
const walletService = require('../services/walletService');
const adminReferralAnalyticsService = require('../services/adminReferralAnalyticsService');

describe('Transaction-Gated Referral System & Admin Oversight Suite', () => {
  let referrerUser, refereeUser, adminUser;
  let referrerWallet, refereeWallet;
  let adminToken, referrerToken;
  const suffix = Date.now();
  const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';

  beforeAll(async () => {
    await connectDB();

    // 1. Create Referrer
    referrerUser = await User.create({
      name: `Referrer Master ${suffix}`,
      email: `referrer_master_${suffix}@test.com`,
      phone: `0803${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
      referral_code: `GATE${suffix}`
    });
    referrerWallet = await walletService.ensureWallet(referrerUser);
    referrerToken = jwt.sign({ id: referrerUser.id }, secret, { expiresIn: '1h' });

    // 2. Create Admin
    adminUser = await User.create({
      name: `Admin Oversight ${suffix}`,
      email: `admin_oversight_${suffix}@test.com`,
      phone: `0809${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser.id }, secret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Clean up
  });

  describe('1. Registration & Locked Bonus Lifecycle', () => {
    let referralRecord;

    it('should create referral with status "pending" and bonus_status "locked" on signup', async () => {
      refereeUser = await User.create({
        name: `Referee One ${suffix}`,
        email: `referee_one_${suffix}@test.com`,
        phone: `0805${String(suffix).slice(-7)}`,
        password: 'password123',
        role: 'user',
        referred_by: `GATE${suffix}`
      });
      refereeWallet = await walletService.ensureWallet(refereeUser);

      // Record referral signup
      const result = await referralService.recordReferralSignup(referrerUser, refereeUser);
      expect(result.recorded).toBe(true);

      referralRecord = await Referral.findOne({ where: { referredUserId: refereeUser.id } });
      expect(referralRecord).toBeDefined();
      expect(referralRecord.status).toBe('pending');
      expect(referralRecord.bonus_status).toBe('locked');
      expect(referralRecord.referrer_signup_bonus_awarded_at).toBeNull();

      // Referrer wallet bonus balance must still be 0 (locked)
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance || 0)).toBe(0);
    });

    it('should detect and prevent self-referral (same phone, email, or user)', async () => {
      const res = await referralService.recordReferralSignup(referrerUser, referrerUser);
      expect(res.recorded).toBe(false);
      expect(res.reason).toBe('self_referral_disallowed');
    });
  });

  describe('2. Transaction-Gating & Automated Bonus Crediting', () => {
    it('should NOT credit referral bonus upon wallet funding deposit', async () => {
      // Referee funds wallet with ₦10,000
      await walletService.credit(refereeUser, 10000, 'funding', 'Initial wallet funding');

      const referral = await Referral.findOne({ where: { referredUserId: refereeUser.id } });
      expect(referral.bonus_status).toBe('locked');
      expect(referral.referrer_signup_bonus_awarded_at).toBeNull();

      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance || 0)).toBe(0);
    });

    it('should NOT credit referral bonus for VTU transaction below threshold (< ₦100)', async () => {
      // Create a small debit transaction of ₦50
      const smallTx = await walletService.debit(refereeUser, 50, 'airtime_purchase', 'Small airtime');
      const rewardResult = await referralService.checkAndRewardQualifyingVTU(refereeUser, smallTx);

      expect(rewardResult.rewarded).toBe(false);
      expect(rewardResult.reason).toBe('below_qualifying_threshold');

      const referral = await Referral.findOne({ where: { referredUserId: refereeUser.id } });
      expect(referral.bonus_status).toBe('locked');
    });

    it('should atomically credit referral bonus upon first qualifying VTU purchase (>= ₦100)', async () => {
      // Referee completes qualifying data purchase of ₦500
      const vtuTx = await walletService.debit(refereeUser, 500, 'data_purchase', '500MB Data Plan');
      const rewardResult = await referralService.checkAndRewardQualifyingVTU(refereeUser, vtuTx);

      expect(rewardResult.rewarded).toBe(true);
      expect(rewardResult.referrerBonusAmount).toBe(100);

      // Verify referral record transitioned to credited
      const referral = await Referral.findOne({ where: { referredUserId: refereeUser.id } });
      expect(referral.status).toBe('credited');
      expect(referral.bonus_status).toBe('credited');
      expect(referral.referrer_signup_bonus_awarded_at).not.toBeNull();
      expect(parseFloat(referral.qualifying_transaction_amount)).toBe(500);

      // Verify Referrer wallet bonus balance was credited with ₦100
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance)).toBe(100);

      // Verify transaction record was created for referrer
      const bonusTx = await Transaction.findOne({
        where: { userId: referrerUser.id, source: 'bonus', status: 'completed' }
      });
      expect(bonusTx).toBeDefined();
      expect(parseFloat(bonusTx.amount)).toBe(100);
      expect(bonusTx.description).toContain('Referral bonus');
    });

    it('should enforce idempotency and NOT double-credit on subsequent VTU purchases', async () => {
      // Second VTU purchase
      const secondVtuTx = await walletService.debit(refereeUser, 1000, 'airtime_purchase', '₦1000 Airtime');
      const rewardResult = await referralService.checkAndRewardQualifyingVTU(refereeUser, secondVtuTx);

      expect(rewardResult.rewarded).toBe(false);
      expect(rewardResult.reason).toBe('no_pending_qualifying_referral');

      // Referrer bonus balance should remain ₦100, not ₦200
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance)).toBe(100);
    });
  });

  describe('3. Admin Oversight & Checkmate Controls', () => {
    let secondReferee, secondReferral;

    beforeAll(async () => {
      secondReferee = await User.create({
        name: `Referee Two ${suffix}`,
        email: `referee_two_${suffix}@test.com`,
        phone: `0806${String(suffix).slice(-7)}`,
        password: 'password123',
        role: 'user',
        referred_by: `GATE${suffix}`
      });
      await walletService.ensureWallet(secondReferee);
      await referralService.recordReferralSignup(referrerUser, secondReferee);
      secondReferral = await Referral.findOne({ where: { referredUserId: secondReferee.id } });
    });

    it('GET /api/admin/referrals should return global referral directory with metrics', async () => {
      const res = await request(app)
        .get('/api/admin/referrals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics).toBeDefined();
      expect(res.body.data.metrics.totalReferrals).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(res.body.data.referrals)).toBe(true);
    });

    it('POST /api/admin/referrals/:id/flag should flag referral and halt automated rewards', async () => {
      const res = await request(app)
        .post(`/api/admin/referrals/${secondReferral.id}/flag`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Suspicious IP proxy detected',
          notes: 'Device fingerprint matched multiple signups'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Referral.findByPk(secondReferral.id);
      expect(updated.status).toBe('flagged');
      expect(updated.bonus_status).toBe('flagged');
      expect(updated.flag_reason).toBe('Suspicious IP proxy detected');

      // Fund secondReferee wallet so they can perform VTU purchase
      await walletService.credit(secondReferee, 2000, 'funding');

      // An attempt to award qualifying VTU should now be halted
      const vtuTx = await walletService.debit(secondReferee, 300, 'airtime_purchase', 'Airtime purchase');
      const rewardRes = await referralService.checkAndRewardQualifyingVTU(secondReferee, vtuTx);
      expect(rewardRes.rewarded).toBe(false);
      expect(rewardRes.reason).toBe('referral_flagged');
    });

    it('POST /api/admin/referrals/:id/approve should manually approve and credit flagged referral', async () => {
      const res = await request(app)
        .post(`/api/admin/referrals/${secondReferral.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          notes: 'Verified KYC manually by compliance team',
          bonusAmount: 150
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Referral.findByPk(secondReferral.id);
      expect(updated.status).toBe('credited');
      expect(updated.bonus_status).toBe('credited');

      // Referrer bonus balance should now be 100 + 150 = 250
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance)).toBe(250);
    });

    it('POST /api/admin/referrals/:id/reverse should clawback wallet balance and mark referral reversed', async () => {
      const res = await request(app)
        .post(`/api/admin/referrals/${secondReferral.id}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Chargeback on referee payment card',
          notes: 'Clawed back bonus'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clawbackAmount).toBe(150);

      const updated = await Referral.findByPk(secondReferral.id);
      expect(updated.status).toBe('reversed');
      expect(updated.bonus_status).toBe('reversed');
      expect(updated.reversal_reason).toBe('Chargeback on referee payment card');

      // Referrer bonus balance was clawed back by 150: 250 - 150 = 100
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance)).toBe(100);

      // Verify debit reversal transaction record was created
      const revTx = await Transaction.findOne({
        where: { userId: referrerUser.id, source: 'bonus_reversal' }
      });
      expect(revTx).toBeDefined();
      expect(parseFloat(revTx.amount)).toBe(150);
      expect(revTx.type).toBe('debit');
    });
  });

  describe('4. Batch Tiered Performance Rewards', () => {
    it('POST /api/admin/leaderboard/tier-rewards should batch reward top referrers', async () => {
      const res = await request(app)
        .post('/api/admin/leaderboard/tier-rewards')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          period: 'all_time',
          tiers: [
            { rankStart: 1, rankEnd: 5, rewardAmount: 2000, title: 'Top Performer Bonus' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.awardedCount).toBeGreaterThanOrEqual(1);

      // Referrer should have received ₦2000 tier reward
      await referrerWallet.reload();
      expect(parseFloat(referrerWallet.bonus_balance)).toBeGreaterThanOrEqual(2100);
    });
  });
});
