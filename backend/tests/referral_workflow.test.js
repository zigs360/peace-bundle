const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const app = require('../server');
const sequelize = require('../config/database');
require('../config/db');

const { User, Wallet, Referral, Commission, Transaction } = require('../models');
const affiliateService = require('../services/affiliateService');

async function createUser(overrides = {}) {
  const password = await bcrypt.hash('password123', 4);
  return User.create({
    name: overrides.name || `User ${Date.now()}`,
    email: overrides.email || `user-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`,
    phone: overrides.phone || `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    password,
    role: overrides.role || 'user',
    account_status: 'active',
    referral_code: overrides.referral_code,
    referred_by: overrides.referred_by,
    transaction_pin_hash: overrides.transaction_pin_hash || null,
  });
}

describe('Referral workflow', () => {
  beforeEach(async () => {
    await sequelize.sync({ force: true });
  });

  afterEach(async () => {
    await Commission.destroy({ where: {}, force: true });
    await Referral.destroy({ where: {}, force: true });
    await Transaction.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('creates a referral record, credits signup bonus, pays funding commission, and keeps user/admin stats consistent', async () => {
    const pinHash = await bcrypt.hash('1994', 4);
    const admin = await createUser({
      name: 'Admin User',
      email: 'admin-referral@test.com',
      phone: '08099990001',
      role: 'admin',
      referral_code: 'ADM0001',
      transaction_pin_hash: pinHash,
    });
    const referrer = await createUser({
      name: 'Referrer User',
      email: 'referrer@test.com',
      phone: '08099990002',
      referral_code: 'REF1234',
      transaction_pin_hash: pinHash,
    });

    const referrerToken = jwt.sign({ id: referrer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const clickRes = await request(app)
      .post('/api/auth/referral/click')
      .send({
        referralCode: 'REF1234',
        clickToken: 'clk_test123',
        landingPath: '/register?ref=REF1234',
        source: 'direct'
      });
    expect(clickRes.statusCode).toBe(202);

    const referredAgent = request.agent(app);
    const registerRes = await referredAgent.post('/api/auth/register').send({
      fullName: 'Referred User',
      email: 'referred@test.com',
      phone: '08099990003',
      password: 'password123',
      referralCode: 'REF1234',
      referralClickToken: 'clk_test123',
    });

    expect(registerRes.statusCode).toBe(201);

    const referredUser = await User.findOne({ where: { email: 'referred@test.com' } });
    
    // Wait for the background trackReferral transaction to complete
    let referralRecord = null;
    for (let i = 0; i < 20; i++) {
      referralRecord = await Referral.findOne({ where: { referredUserId: referredUser.id } });
      if (referralRecord) {
        // Wait a tiny bit more to ensure transaction commit completes
        await new Promise(resolve => setTimeout(resolve, 50));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(referralRecord).toBeTruthy();

    await referredUser.update({ transaction_pin_hash: pinHash });

    const referredToken = jwt.sign({ id: referredUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const pinRes = await referredAgent
      .post('/api/auth/transaction-pin/session')
      .set('Authorization', `Bearer ${referredToken}`)
      .send({ pin: '1994', scope: 'financial' });

    expect(pinRes.statusCode).toBe(200);

    const fundRes = await referredAgent
      .post('/api/transactions/fund')
      .set('Authorization', `Bearer ${referredToken}`)
      .send({ amount: 1000, reference: 'REF-FUND-001' });

    expect(fundRes.statusCode).toBe(200);

    const referrerStatsRes = await request(app)
      .get('/api/users/affiliate-stats')
      .set('Authorization', `Bearer ${referrerToken}`);
    const adminStatsRes = await request(app)
      .get('/api/admin/referrals/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(referrerStatsRes.statusCode).toBe(200);
    expect(adminStatsRes.statusCode).toBe(200);

    const referralRows = await Referral.findAll();
    const commissionRows = await Commission.findAll();
    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    const bonusTxn = await Transaction.findOne({ where: { userId: referrer.id, source: 'bonus' } });

    expect(referredUser.referred_by).toBe('REF1234');
    expect(referralRows).toHaveLength(1);
    expect(referralRows[0].referrerId).toBe(referrer.id);
    expect(referralRows[0].referredUserId).toBe(referredUser.id);
    expect(parseFloat(referralRows[0].total_commissions_earned)).toBeCloseTo(125, 2);
    expect(referralRows[0].total_transactions).toBe(1);

    expect(commissionRows).toHaveLength(1);
    expect(commissionRows[0].type).toBe('funding');
    expect(commissionRows[0].status).toBe('paid');
    expect(parseFloat(commissionRows[0].amount)).toBeCloseTo(25, 2);

    expect(parseFloat(referrerWallet.bonus_balance)).toBeCloseTo(100, 2);
    expect(parseFloat(referrerWallet.commission_balance)).toBeCloseTo(25, 2);
    expect(bonusTxn).toBeTruthy();
    expect(parseFloat(bonusTxn.amount)).toBeCloseTo(100, 2);

    expect(referrerStatsRes.body.referredUsersCount).toBe(1);
    expect(parseFloat(referrerStatsRes.body.totalEarnings)).toBeCloseTo(125, 2);
    expect(parseFloat(referrerStatsRes.body.pendingPayout)).toBeCloseTo(0, 2);
    expect(referrerStatsRes.body.totalClicks).toBe(1);
    expect(referrerStatsRes.body.totalConvertedClicks).toBe(1);
    expect(referrerStatsRes.body.conversionRate).toBe(100);
    expect(referrerStatsRes.body.recentReferrals).toHaveLength(1);
    expect(parseFloat(referrerStatsRes.body.recentReferrals[0].commission)).toBeCloseTo(125, 2);

    expect(adminStatsRes.body.totalReferrals).toBe(1);
    expect(adminStatsRes.body.totalClicks).toBe(1);
    expect(adminStatsRes.body.totalConvertedClicks).toBe(1);
    expect(adminStatsRes.body.conversionRate).toBe(100);
    expect(String(adminStatsRes.body.topReferrers[0].referral_code)).toBe('REF1234');
    expect(Number(adminStatsRes.body.topReferrers[0].referral_count)).toBe(1);
    expect(parseFloat(adminStatsRes.body.topReferrers[0].total_earnings)).toBeCloseTo(125, 2);
  });

  it('records transaction commission correctly when a referred user completes a commissionable transaction', async () => {
    const referrer = await createUser({
      name: 'Txn Referrer',
      email: 'txn-referrer@test.com',
      phone: '08099990011',
      referral_code: 'TXN1234',
    });
    const referred = await createUser({
      name: 'Txn Referred',
      email: 'txn-referred@test.com',
      phone: '08099990012',
      referred_by: 'TXN1234',
    });

    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    const referredWallet = await Wallet.findOne({ where: { userId: referred.id } });
    await Referral.create({
      referrerId: referrer.id,
      referredUserId: referred.id,
      total_commissions_earned: 100,
      total_transactions: 0,
    });

    const commissionableTransaction = await Transaction.create({
      userId: referred.id,
      walletId: referredWallet.id,
      type: 'debit',
      amount: 1000,
      balance_before: 1000,
      balance_after: 0,
      source: 'data_purchase',
      reference: 'TXN-COMM-001',
      description: 'Commissionable transaction',
      status: 'completed',
      completed_at: new Date(),
    });

    await affiliateService.processTransactionCommission(referred, commissionableTransaction);

    const updatedReferrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    const referral = await Referral.findOne({ where: { referrerId: referrer.id, referredUserId: referred.id } });
    const commission = await Commission.findOne({ where: { commissionableId: commissionableTransaction.id } });

    expect(parseFloat(updatedReferrerWallet.commission_balance)).toBeCloseTo(10, 2);
    expect(parseFloat(referral.total_commissions_earned)).toBeCloseTo(110, 2);
    expect(referral.total_transactions).toBe(1);
    expect(commission).toBeTruthy();
    expect(commission.type).toBe('transaction');
    expect(commission.status).toBe('paid');
    expect(parseFloat(commission.source_amount)).toBeCloseTo(1000, 2);
    expect(parseFloat(commission.commission_rate)).toBeCloseTo(1, 2);
  });
});

