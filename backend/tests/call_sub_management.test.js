const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const { sequelize } = require('../config/db');
const Wallet = require('../models/Wallet');
const CallPlan = require('../models/CallPlan');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const VoiceBundlePurchaseAudit = require('../models/VoiceBundlePurchaseAudit');
const Transaction = require('../models/Transaction');
const {
  TALKMORE_GIFTING_BUNDLES,
  buildTalkMorePlanPayload,
  syncTalkMorePortfolio,
} = require('../services/callSubscriptionPortfolioService');
const {
  decrementPlanStock,
  normalizeCallPlanPayload,
  calculateProratedCommission,
  validateCallPlanBusinessRules,
} = require('../services/callSubscriptionManagementService');

describe('Call subscription management module', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.CALL_SUB_AIRTEL_MODE = 'mock';
  });

  beforeEach(async () => {
    await VoiceBundlePurchaseAudit.destroy({ where: {} });
    await VoiceBundlePurchase.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await CallPlan.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  const createUser = async ({ role = 'user', balance = 0, prefix = 'user' } = {}) => {
    const unique = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const user = await User.create({
      name: unique,
      email: `${unique}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: 'password123',
      role,
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (wallet) {
      await wallet.update({ balance, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    }
    return user;
  };

  const tokenFor = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET);

  it('creates a TalkMore gifting plan with locked 30 day validity', async () => {
    const admin = await createUser({ role: 'admin', prefix: 'admin-create' });
    const token = tokenFor(admin);

    const res = await request(app)
      .post('/api/callplans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Airtel TalkMore Gifting N3,000',
        provider: 'airtel',
        customerPrice: 3000,
        dealerCommission: 150,
        shortCode: '50101',
        internalSequenceNumber: 9,
        bundleClass: 'talkmore_gifting',
        portfolio: 'talkmore',
        stockLimit: 10,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.validityDays).toBe(30);
    expect(res.body.data.shortCode).toBe('50101');
    expect(res.body.data.dealerCommission).toBe(150);
    expect(res.body.data.stockRemaining).toBe(10);
  });

  it('rejects duplicate short codes', async () => {
    const admin = await createUser({ role: 'admin', prefix: 'admin-duplicate' });
    const token = tokenFor(admin);

    await CallPlan.create({
      name: 'Existing TalkMore N100',
      provider: 'airtel',
      customerPrice: 100,
      price: 100,
      dealerCommission: 5,
      minutes: 0,
      validityDays: 30,
      status: 'active',
      type: 'voice',
      shortCode: '50093',
      api_plan_id: '50093',
      internalSequenceNumber: 1,
      portfolio: 'talkmore',
      bundleClass: 'talkmore_gifting',
    });

    const res = await request(app)
      .post('/api/callplans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Duplicate TalkMore N200',
        provider: 'airtel',
        customerPrice: 200,
        dealerCommission: 10,
        validityDays: 30,
        shortCode: '50093',
        internalSequenceNumber: 2,
        bundleClass: 'talkmore_gifting',
        portfolio: 'talkmore',
      });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message).toLowerCase()).toContain('short code');
  });

  it('rejects commission above 5 percent of customer price', async () => {
    const admin = await createUser({ role: 'admin', prefix: 'admin-commission' });
    const token = tokenFor(admin);

    const res = await request(app)
      .post('/api/callplans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid TalkMore N500',
        provider: 'airtel',
        customerPrice: 500,
        dealerCommission: 30,
        validityDays: 30,
        shortCode: '60001',
        internalSequenceNumber: 10,
        bundleClass: 'talkmore_gifting',
        portfolio: 'talkmore',
      });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message)).toMatch(/5%/i);
  });

  it('enforces RBAC for admin stock endpoint', async () => {
    const user = await createUser({ role: 'user', prefix: 'user-rbac' });
    const token = tokenFor(user);

    const res = await request(app)
      .get('/api/callplans/admin/call-sub/airtel/stock')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });

  it('returns the exact seeded TalkMore Airtel portfolio in admin plan listing', async () => {
    await Promise.all(
      TALKMORE_GIFTING_BUNDLES.map((bundle) =>
        CallPlan.create({
          name: bundle.name,
          provider: 'airtel',
          customerPrice: bundle.customerPrice,
          price: bundle.price,
          dealerCommission: bundle.dealerCommission,
          minutes: 0,
          validityDays: bundle.validityDays,
          status: 'active',
          type: 'voice',
          shortCode: bundle.shortCode,
          api_plan_id: bundle.shortCode,
          internalSequenceNumber: bundle.internalSequenceNumber,
          portfolio: 'talkmore',
          bundleClass: 'talkmore_gifting',
          metadata: { ussdMapping: `*312*${bundle.shortCode}#` },
        }),
      ),
    );
    const admin = await createUser({ role: 'admin', prefix: 'admin-list' });
    const token = tokenFor(admin);

    const res = await request(app)
      .get('/api/callplans/admin/call-sub/airtel/plans')
      .query({ portfolio: 'talkmore' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(23);
    expect(res.body.items.map((item) => item.shortCode).sort()).toEqual(
      TALKMORE_GIFTING_BUNDLES.map((bundle) => bundle.shortCode).sort()
    );
  });

  it('calculates prorated commission for partial month activation', async () => {
    const admin = await createUser({ role: 'admin', prefix: 'admin-prorate' });
    const token = tokenFor(admin);

    const res = await request(app)
      .post('/api/callplans/admin/call-sub/airtel/commission/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerPrice: 1000,
        dealerCommission: 50,
        activationDate: '2026-05-16T00:00:00.000Z',
        cycleDays: 31,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.remainingDays).toBe(16);
    expect(res.body.data.proratedCommission).toBeCloseTo(25.81, 2);
  });

  it('prevents repeated stock deduction from overselling a TalkMore bundle', async () => {
    const plan = await CallPlan.create({
      name: 'Airtel TalkMore Gifting N100',
      provider: 'airtel',
      customerPrice: 100,
      price: 100,
      dealerCommission: 5,
      minutes: 0,
      validityDays: 30,
      status: 'active',
      type: 'voice',
      shortCode: '50093',
      api_plan_id: '50093',
      internalSequenceNumber: 1,
      portfolio: 'talkmore',
      bundleClass: 'talkmore_gifting',
      stockLimit: 1,
      stockRemaining: 1,
      metadata: { ussdMapping: '*312*50093#' },
    });

    const first = await sequelize.transaction(async (transaction) =>
      decrementPlanStock(CallPlan, { planId: plan.id, transaction }),
    );
    expect(first.stockRemaining).toBe(0);

    await expect(
      sequelize.transaction(async (transaction) =>
        decrementPlanStock(CallPlan, { planId: plan.id, transaction }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const updatedPlan = await CallPlan.findByPk(plan.id);
    expect(updatedPlan.stockRemaining).toBe(0);
  });

  it('normalizes TalkMore payloads and locks validity to 30 days', () => {
    const normalized = normalizeCallPlanPayload({
      provider: 'AIRTEL',
      customerPrice: '1000',
      dealerCommission: '50',
      bundleClass: 'TALKMORE_GIFTING',
      portfolio: 'custom',
      shortCode: '50097',
      internalSequenceNumber: '5',
      stockLimit: '9',
      stockRemaining: '8',
    });

    expect(normalized.provider).toBe('airtel');
    expect(normalized.customerPrice).toBe(1000);
    expect(normalized.dealerCommission).toBe(50);
    expect(normalized.validityDays).toBe(30);
    expect(normalized.portfolio).toBe('talkmore');
    expect(normalized.type).toBe('voice');
    expect(normalized.api_plan_id).toBe('50097');
    expect(normalized.stockLimit).toBe(9);
    expect(normalized.stockRemaining).toBe(8);
  });

  it('validates business rule errors for bad pricing and locked TalkMore validity', async () => {
    const errors = await validateCallPlanBusinessRules(
      CallPlan,
      {
        name: '',
        provider: 'airtel',
        customerPrice: 100,
        dealerCommission: 7,
        validityDays: 14,
        shortCode: '50093',
        bundleClass: 'talkmore_gifting',
      },
      {},
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        'Plan name is required',
        'Dealer commission cannot exceed 5% of customer price',
      ]),
    );
  });

  it('builds and syncs the exact TalkMore portfolio payloads', async () => {
    const bundlePayload = buildTalkMorePlanPayload(TALKMORE_GIFTING_BUNDLES[0]);
    expect(bundlePayload.shortCode).toBe('50093');
    expect(bundlePayload.validityDays).toBe(30);
    expect(bundlePayload.metadata.ussdMapping).toBe('*312*50093#');

    await syncTalkMorePortfolio(CallPlan);
    const plans = await CallPlan.findAll({
      where: { portfolio: 'talkmore', bundleClass: 'talkmore_gifting' },
      order: [['internalSequenceNumber', 'ASC']],
    });

    expect(plans).toHaveLength(23);
    expect(plans.map((plan) => plan.shortCode)).toEqual(TALKMORE_GIFTING_BUNDLES.map((bundle) => bundle.shortCode));
  });

  it('preserves existing stock settings when syncing TalkMore portfolio', async () => {
    const existing = await CallPlan.create({
      ...buildTalkMorePlanPayload(TALKMORE_GIFTING_BUNDLES[0]),
      stockLimit: 3,
      stockRemaining: 2,
    });

    await syncTalkMorePortfolio(CallPlan);
    const fresh = await CallPlan.findByPk(existing.id);

    expect(fresh.stockLimit).toBe(3);
    expect(fresh.stockRemaining).toBe(2);
  });

  it('throws on invalid commission activation date and missing stock bundle', async () => {
    expect(() =>
      calculateProratedCommission({
        customerPrice: 100,
        dealerCommission: 5,
        activatedAt: 'not-a-date',
      }),
    ).toThrow('Invalid activation date');

    await expect(
      sequelize.transaction(async (transaction) =>
        decrementPlanStock(CallPlan, { planId: 'missing-id', transaction }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('enforces model-level stock and commission constraints', async () => {
    await expect(
      CallPlan.create({
        name: 'Invalid commission',
        provider: 'airtel',
        customerPrice: 500,
        price: 500,
        dealerCommission: 26,
        minutes: 0,
        validityDays: 30,
        status: 'active',
        type: 'voice',
        shortCode: '61000',
        internalSequenceNumber: 40,
        portfolio: 'talkmore',
        bundleClass: 'talkmore_gifting',
      }),
    ).rejects.toThrow(/5%/i);

    await expect(
      CallPlan.create({
        name: 'Invalid stock',
        provider: 'airtel',
        customerPrice: 500,
        price: 500,
        dealerCommission: 25,
        minutes: 0,
        validityDays: 30,
        status: 'active',
        type: 'voice',
        shortCode: '61001',
        internalSequenceNumber: 41,
        portfolio: 'talkmore',
        bundleClass: 'talkmore_gifting',
        stockLimit: 1,
        stockRemaining: 2,
      }),
    ).rejects.toThrow(/stock remaining cannot exceed the stock limit/i);
  });
});
