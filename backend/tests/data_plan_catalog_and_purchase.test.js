const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const DataPlan = require('../models/DataPlan');
const Transaction = require('../models/Transaction');
const WalletTransaction = require('../models/WalletTransaction');
const smeplugService = require('../services/smeplugService');

describe('Data plan catalog and purchase flow', () => {
  let token;
  let user;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    const unique = Date.now();
    user = await User.create({
      name: 'Bundle Buyer',
      email: `bundle-buyer-${unique}@test.com`,
      password: 'password123',
      phone: `0803${String(unique).slice(-7)}`,
      role: 'user',
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({
      balance: 5000,
      status: 'active',
    });

    token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterEach(async () => {
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await DataPlan.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: { email: { [require('sequelize').Op.like]: 'bundle-buyer-%@test.com' } }, force: true });
    jest.clearAllMocks();
  });

  it('GET /api/plans hides invalid teleco prices and sorts by network, validity, then price', async () => {
    await DataPlan.bulkCreate([
      {
        provider: 'glo',
        category: 'gifting',
        name: '10GB [GIFTING]',
        size: '10GB',
        size_mb: 10240,
        validity: '30 Days',
        admin_price: 4700,
        api_cost: 4200,
        smeplug_plan_id: 'GLO-10GB',
        is_active: true,
      },
      {
        provider: 'mtn',
        category: 'gifting',
        name: '1GB [GIFTING]',
        size: '1GB',
        size_mb: 1024,
        validity: '1 Day',
        admin_price: 475,
        api_cost: 500,
        smeplug_plan_id: '20002',
        is_active: true,
      },
      {
        provider: 'mtn',
        category: 'gifting',
        name: '110MB [GIFTING]',
        size: '110MB',
        size_mb: 110,
        validity: '1 Day',
        admin_price: 95,
        api_cost: 100,
        smeplug_plan_id: '20001',
        is_active: true,
      },
      {
        provider: 'airtel',
        category: 'gifting',
        name: '2GB [GIFTING]',
        size: '2GB',
        size_mb: 2048,
        validity: '7 Days',
        admin_price: 980,
        api_cost: 900,
        smeplug_plan_id: 'AIRTEL-2GB',
        is_active: true,
      },
      {
        provider: 'glo',
        category: 'gifting',
        name: 'Broken Plan',
        size: '500MB',
        size_mb: 500,
        validity: '1 Day',
        admin_price: 50,
        api_cost: 0,
        smeplug_plan_id: 'GLO-BROKEN',
        is_active: true,
      },
      {
        provider: 'mtn',
        category: 'gifting',
        name: 'NaN Plan',
        size: '2GB',
        size_mb: 2048,
        validity: '2 Days',
        admin_price: 700,
        api_cost: 'NaN',
        smeplug_plan_id: 'MTN-NAN',
        is_active: true,
      },
    ]);

    const res = await request(app)
      .get('/api/plans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.map((plan) => plan.name)).toEqual([
      '110MB [GIFTING]',
      '1GB [GIFTING]',
      '2GB [GIFTING]',
      '10GB [GIFTING]',
    ]);
    expect(res.body[0].plan_id).toBe('20001');
    expect(res.body[0].network).toBe('mtn');
    expect(res.body[0].our_price).toBeGreaterThan(0);
    expect(res.body.some((plan) => plan.name === 'Broken Plan')).toBe(false);
    expect(res.body.some((plan) => plan.name === 'NaN Plan')).toBe(false);
  });

  it('GET /api/plans/catalog merges MTN plans, classifies categories, and returns nested catalog data', async () => {
    await DataPlan.bulkCreate([
      {
        source: 'ogdams',
        provider: 'mtn',
        category: 'gifting',
        name: '1GB [GIFTING] + 25 minutes',
        size: '1GB',
        size_mb: 1024,
        validity: '1 Day',
        data_size: '1GB',
        plan_id: 'MTN-GIFT-1GB-A',
        original_price: 500,
        your_price: 475,
        wallet_price: 500,
        admin_price: 475,
        api_cost: 500,
        is_active: true,
      },
      {
        source: 'smeplug',
        provider: 'mtn',
        category: 'gifting',
        name: '1GB [GIFTING]',
        size: '1GB',
        size_mb: 1024,
        validity: '1 Day',
        data_size: '1GB',
        plan_id: 'MTN-GIFT-1GB-B',
        original_price: 500,
        your_price: 475,
        wallet_price: 500,
        admin_price: 475,
        api_cost: 500,
        is_active: true,
      },
      {
        source: 'smeplug',
        provider: 'airtel',
        category: 'social',
        name: 'Airtel Social 1GB',
        size: '1GB',
        size_mb: 1024,
        validity: '7 Days',
        data_size: '1GB',
        plan_id: 'AIRTEL-SOCIAL-1GB',
        original_price: 500,
        your_price: 480,
        wallet_price: 500,
        admin_price: 480,
        api_cost: 500,
        is_active: true,
      },
      {
        source: 'smeplug',
        provider: 'glo',
        category: 'voice',
        name: 'Talk More - 10MINS',
        size: '10MINS',
        size_mb: 0,
        validity: '3 Days',
        data_size: null,
        plan_id: 'GLO-VOICE-10',
        original_price: 100,
        your_price: 98,
        wallet_price: 100,
        admin_price: 98,
        api_cost: 100,
        is_active: true,
      },
    ]);

    const res = await request(app)
      .get('/api/plans/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(Array.isArray(res.body.networks)).toBe(true);
    expect(res.body.networks[0].code).toBe('mtn');
    expect(res.body.catalog.MTN.GIFTING).toHaveLength(1);
    expect(res.body.catalog.MTN.GIFTING[0].plan_id).toBe('MTN-GIFT-1GB-A');
    expect(res.body.catalog.MTN.GIFTING[0].bonus_text).toMatch(/\+ 25 min/i);
    expect(res.body.catalog.Airtel.SOCIAL[0].plan_id).toBe('AIRTEL-SOCIAL-1GB');
    expect(res.body.catalog.GLO.VOICE_COMBO[0].display_title).toBe('10 MINS Voice');
    expect(res.body.items.some((plan) => plan.plan_id === 'MTN-GIFT-1GB-B')).toBe(false);
  });

  it('POST /api/transactions/data rejects phone numbers with the wrong network prefix', async () => {
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'gifting',
      name: '1GB [GIFTING]',
      size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      admin_price: 475,
      api_cost: 500,
      smeplug_plan_id: '20002',
      is_active: true,
    });

    const res = await request(app)
      .post('/api/transactions/data')
      .set('Authorization', `Bearer ${token}`)
      .send({
        network: 'mtn',
        planId: plan.id,
        phone: '08021234567',
        amount: 475,
        reference: 'DATA-WRONG-PREFIX',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/prefix/i);
  });

  it('POST /api/transactions/data replays duplicate requests idempotently', async () => {
    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'gifting',
      name: '1GB [GIFTING]',
      size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      admin_price: 475,
      api_cost: 500,
      smeplug_plan_id: '20002',
      is_active: true,
    });

    const payload = {
      network: 'mtn',
      planId: plan.id,
      phone: '08031234567',
      amount: 475,
      reference: 'DATA-IDEMPOTENT-001',
    };

    const first = await request(app)
      .post('/api/transactions/data')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', payload.reference)
      .send(payload);

    const second = await request(app)
      .post('/api/transactions/data')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', payload.reference)
      .send(payload);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.body.transaction.reference).toBe(payload.reference);
    expect(second.body.transaction.reference).toBe(payload.reference);
    expect(second.body.message).toMatch(/duplicate request/i);
    expect(smeplugService.purchaseData).toHaveBeenCalledTimes(1);
  });
});
