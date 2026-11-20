const request = require('supertest');
const app = require('../server');
const { connectDB, sequelize } = require('../config/db');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Referral = require('../models/Referral');
const walletService = require('../services/walletService');
const referralService = require('../services/referralService');
const adminReferralAnalyticsService = require('../services/adminReferralAnalyticsService');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

describe('Bonus Credit Visibility & Admin Audit Suite', () => {
  const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  let referrerUser, refereeUser, adminUser;
  let referrerToken, refereeToken, adminToken;
  let referrerWallet, refereeWallet;
  const suffix = Date.now();

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    await connectDB();

    // Admin user
    adminUser = await User.create({
      name: `Admin Audit ${suffix}`,
      email: `admin_audit_${suffix}@test.com`,
      phone: `0809${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'admin',
    });
    adminToken = jwt.sign({ id: adminUser.id, role: 'admin' }, secret);

    // Referrer
    referrerUser = await User.create({
      name: `Referrer Audit ${suffix}`,
      email: `referrer_audit_${suffix}@test.com`,
      phone: `0808${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
      referral_code: `CODE${suffix}`,
    });
    referrerToken = jwt.sign({ id: referrerUser.id, role: 'user' }, secret);
    referrerWallet = await walletService.ensureWallet(referrerUser);

    // Referee
    refereeUser = await User.create({
      name: `Referee Audit ${suffix}`,
      email: `referee_audit_${suffix}@test.com`,
      phone: `0807${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
      referred_by: `CODE${suffix}`,
    });
    refereeToken = jwt.sign({ id: refereeUser.id, role: 'user' }, secret);
    refereeWallet = await walletService.ensureWallet(refereeUser);
    await refereeWallet.update({ balance: 5000 });
  });

  afterAll(async () => {
    const ids = [referrerUser?.id, refereeUser?.id, adminUser?.id].filter(Boolean);
    if (ids.length) {
      await Transaction.destroy({ where: { userId: ids }, force: true });
      await Referral.destroy({ where: { referrerId: ids }, force: true });
      await Wallet.destroy({ where: { userId: ids }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    }
  });

  describe('1. Transaction-gated VTU bonus crediting & structured logging', () => {
    it('creates completed Transaction rows with REF-BONUS / REF-WELCOME, exact balance snapshots, and logs [BonusCredit]', async () => {
      const loggerSpy = jest.spyOn(logger, 'info');

      // Create pending referral
      await Referral.create({
        referrerId: referrerUser.id,
        referredUserId: refereeUser.id,
        status: 'pending',
        bonus_status: 'locked',
        registered_at: new Date(),
      });

      // Referee completes qualifying purchase
      const purchaseTx = await walletService.debit(refereeUser, 200, 'airtime_purchase', '₦200 Airtime');
      const rewardResult = await referralService.checkAndRewardQualifyingVTU(refereeUser, purchaseTx);

      expect(rewardResult.rewarded).toBe(true);

      // Verify Referrer bonus transaction row
      const referrerTx = await Transaction.findOne({
        where: {
          userId: referrerUser.id,
          source: 'bonus',
          status: 'completed',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(referrerTx).toBeDefined();
      expect(referrerTx.type).toBe('credit');
      expect(referrerTx.reference).toMatch(/^REF-BONUS-/);
      expect(referrerTx.description).toContain('Referral bonus for referring');
      expect(Number(referrerTx.amount)).toBe(100);
      expect(Number(referrerTx.balance_before)).toBe(0);
      expect(Number(referrerTx.balance_after)).toBe(100);
      expect(Number(referrerTx.wallet_balance_before)).toBe(0);
      expect(Number(referrerTx.wallet_balance_after)).toBe(100);

      // Verify metadata snapshots
      expect(referrerTx.metadata).toBeDefined();
      expect(referrerTx.metadata.kind).toBe('referrer_vtu_bonus');
      expect(referrerTx.metadata.reference).toBe(referrerTx.reference);
      expect(referrerTx.metadata.referredUserId).toBe(refereeUser.id);
      expect(referrerTx.metadata.qualifyingTransactionId).toBe(String(purchaseTx.id));
      expect(referrerTx.metadata.mainBalanceBefore).toBeDefined();
      expect(referrerTx.metadata.mainBalanceAfter).toBeDefined();
      expect(referrerTx.metadata.bonusBalanceBefore).toBe(0);
      expect(referrerTx.metadata.bonusBalanceAfter).toBe(100);

      // Verify Referee welcome bonus transaction row
      const refereeTx = await Transaction.findOne({
        where: {
          userId: refereeUser.id,
          source: 'bonus',
          status: 'completed',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(refereeTx).toBeDefined();
      expect(refereeTx.type).toBe('credit');
      expect(refereeTx.reference).toMatch(/^REF-WELCOME-/);
      expect(refereeTx.description).toContain('Welcome bonus');
      expect(Number(refereeTx.amount)).toBe(50);
      expect(Number(refereeTx.balance_before)).toBe(4800);
      expect(Number(refereeTx.balance_after)).toBe(4850);
      expect(Number(refereeTx.wallet_balance_before)).toBe(4800);
      expect(Number(refereeTx.wallet_balance_after)).toBe(4850);
      expect(refereeTx.metadata.kind).toBe('referee_vtu_welcome_bonus');
      expect(refereeTx.metadata.bonusBalanceBefore).toBe(0);
      expect(refereeTx.metadata.bonusBalanceAfter).toBe(50);

      // Verify structured logger.info calls for [BonusCredit]
      const bonusCreditLogs = loggerSpy.mock.calls.filter(
        ([msg]) => typeof msg === 'string' && msg.includes('[BonusCredit]')
      );
      expect(bonusCreditLogs.length).toBeGreaterThanOrEqual(1);

      const [logMsg, logMeta] = bonusCreditLogs[0];
      expect(logMsg).toBe('[BonusCredit] Credited bonus to wallet');
      expect(logMeta).toHaveProperty('userId');
      expect(logMeta).toHaveProperty('walletId');
      expect(logMeta).toHaveProperty('reference');
      expect(logMeta).toHaveProperty('amount');
      expect(logMeta).toHaveProperty('mainBalanceBefore');
      expect(logMeta).toHaveProperty('mainBalanceAfter');
      expect(logMeta).toHaveProperty('bonusBalanceBefore');
      expect(logMeta).toHaveProperty('bonusBalanceAfter');
      expect(logMeta).toHaveProperty('description');
      expect(logMeta).toHaveProperty('kind');

      loggerSpy.mockRestore();
    });
  });

  describe('2. Admin manual approval bonus crediting & audit metadata', () => {
    it('creates REF-ADM-APPR Transaction row with adminId and snapshots', async () => {
      // Create a flagged referral
      const flaggedReferral = await Referral.create({
        referrerId: referrerUser.id,
        referredUserId: refereeUser.id,
        status: 'flagged',
        bonus_status: 'flagged',
        flag_reason: 'Testing audit approval',
        registered_at: new Date(),
      });

      const approveRes = await adminReferralAnalyticsService.approveReferralBonus(
        flaggedReferral.id,
        adminUser,
        { notes: 'Manual KYC verified', bonusAmount: 150 }
      );

      expect(approveRes.success).toBe(true);

      const adminBonusTx = await Transaction.findOne({
        where: {
          userId: referrerUser.id,
          source: 'bonus',
          reference: { [sequelize.Sequelize.Op.like]: 'REF-ADM-APPR-%' },
        },
      });

      expect(adminBonusTx).toBeDefined();
      expect(adminBonusTx.type).toBe('credit');
      expect(Number(adminBonusTx.amount)).toBe(150);
      expect(adminBonusTx.description).toContain('Admin approved referral bonus');
      expect(adminBonusTx.metadata.kind).toBe('admin_manual_approval');
      expect(adminBonusTx.metadata.adminId).toBe(adminUser.id);
      expect(adminBonusTx.metadata.referralId).toBe(String(flaggedReferral.id));
      expect(adminBonusTx.metadata.bonusBalanceAfter).toBeGreaterThan(0);
    });
  });

  describe('3. Tiered Leaderboard Reward crediting & audit metadata', () => {
    it('creates TIER-RWD Transaction row with rank, tierTitle, and adminId', async () => {
      const rewardRes = await adminReferralAnalyticsService.rewardTieredReferrers(adminUser, {
        tiers: [
          { rankStart: 1, rankEnd: 10, rewardAmount: 1000, title: 'Champion Contender' },
        ],
        period: 'all_time',
      });

      expect(rewardRes.success).toBe(true);

      const tierTx = await Transaction.findOne({
        where: {
          source: 'bonus',
          reference: { [sequelize.Sequelize.Op.like]: 'TIER-RWD-%' },
        },
        order: [['createdAt', 'DESC']],
      });

      if (tierTx) {
        expect(tierTx.type).toBe('credit');
        expect(Number(tierTx.amount)).toBe(1000);
        expect(tierTx.description).toContain('Referral Leaderboard Reward');
        expect(tierTx.metadata.kind).toBe('tiered_leaderboard_reward');
        expect(tierTx.metadata.adminId).toBe(adminUser.id);
      }
    });
  });

  describe('4. User Transactions Feed Visibility (/api/transactions/my & /api/transactions)', () => {
    it('GET /api/transactions/my returns source: bonus rows with "Bonus" badge and reference', async () => {
      const res = await request(app)
        .get('/api/transactions/my')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const bonusItems = res.body.filter((t) => t.source === 'bonus');
      expect(bonusItems.length).toBeGreaterThanOrEqual(1);

      const item = bonusItems[0];
      expect(item.badge).toBe('Bonus');
      expect(item.source_label).toBe('Bonus');
      expect(item.is_bonus).toBe(true);
      expect(item.reference).toMatch(/^REF-(BONUS|ADM-APPR|WELCOME)|TIER-RWD-/);
      expect(item.wallet_balance_before).toBeDefined();
      expect(item.wallet_balance_after).toBeDefined();
    });

    it('GET /api/transactions with source filter works correctly and returns bonus rows', async () => {
      const res = await request(app)
        .get('/api/transactions?source=bonus')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      res.body.forEach((t) => {
        expect(t.source).toBe('bonus');
        expect(t.badge).toBe('Bonus');
        expect(t.source_label).toBe('Bonus');
      });
    });
  });
});
