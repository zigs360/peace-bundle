const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const CallPlan = require('../models/CallPlan');

describe('Call sub Airtel purchase flow', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.CALL_SUB_AIRTEL_MODE = 'mock';
  });

  beforeEach(async () => {
    await VoiceBundlePurchase.destroy({ where: {} });
    await CallPlan.destroy({ where: { api_plan_id: { [Op.like]: 'ATM-LEGACY-%' } } });
  });

  const makeUserWithBalance = async (balance) => {
    const user = await User.create({
      name: 'Call Sub User',
      email: `callsub_${Date.now()}@test.com`,
      phone: `0802${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return user;
  };

  it('lists call sub providers', async () => {
    const res = await request(app).get('/api/callplans/call-sub/providers');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'airtel',
          label: 'Airtel',
        }),
      ])
    );
  });

  it('lists Airtel call sub bundles', async () => {
    const res = await request(app).get('/api/callplans/call-sub/airtel/bundles');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data.every((bundle) => Number(bundle.minutes) > 0)).toBe(true);
    expect(res.body.data.find((bundle) => Number(bundle.minutes) === 10)?.validityDays).toBe(3);
    expect(res.body.data.find((bundle) => Number(bundle.minutes) === 20)?.validityDays).toBe(7);
    expect(res.body.data.find((bundle) => Number(bundle.minutes) === 30)?.validityDays).toBe(7);
    expect(res.body.data.find((bundle) => Number(bundle.minutes) === 50)?.validityDays).toBe(14);
    expect(res.body.data.find((bundle) => Number(bundle.minutes) === 150)?.validityDays).toBe(30);
  });

  it('legacy voice bundle endpoint exposes only unified minute offerings', async () => {
    const res = await request(app).get('/api/callplans/voice-bundles').query({ network: 'airtel', status: 'active' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    expect(res.body.every((bundle) => Number(bundle.minutes) > 0)).toBe(true);
    expect(res.body.some((bundle) => String(bundle.plan_name).toLowerCase().includes('validity'))).toBe(false);
  });

  it('purchases an Airtel bundle and records history', async () => {
    const user = await makeUserWithBalance(10000);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/call-sub/airtel/bundles');
    const bundle = bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/call-sub/airtel/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '08081234567' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference).toBeTruthy();

    const history = await request(app)
      .get('/api/callplans/call-sub/airtel/history')
      .set('Authorization', `Bearer ${token}`);

    expect(history.statusCode).toBe(200);
    expect(history.body.success).toBe(true);
    expect(history.body.rows.length).toBeGreaterThan(0);
    expect(history.body.rows[0].status).toBe('completed');
    expect(history.body.rows[0].bundleCategory).toBe('minute');
    expect(history.body.rows[0].expiresAt).toBeTruthy();
  });

  it('rejects invalid phone number', async () => {
    const user = await makeUserWithBalance(10000);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/call-sub/airtel/bundles');
    const bundle = bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/call-sub/airtel/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '123' });

    expect(res.statusCode).toBe(400);
  });

  it('rejects purchase when wallet is insufficient', async () => {
    const user = await makeUserWithBalance(10);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/call-sub/airtel/bundles');
    const bundle = bundles.body.data.find((item) => Number(item.price) >= 100) || bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/call-sub/airtel/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '08081234567' });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message).toLowerCase()).toContain('insufficient');
  });

  it('blocks any new legacy validity-bundle purchase attempts', async () => {
    const user = await makeUserWithBalance(10000);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const legacyPlan = await CallPlan.create({
      name: 'Legacy Validity Plan',
      provider: 'airtel',
      price: 100,
      minutes: 0,
      validityDays: 3,
      status: 'active',
      type: 'voice',
      api_plan_id: `ATM-LEGACY-${Date.now()}`,
    });

    const res = await request(app)
      .post(`/api/callplans/call-sub/airtel/${legacyPlan.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '08081234567' });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message).toLowerCase()).toContain('legacy validity');
  });
});
