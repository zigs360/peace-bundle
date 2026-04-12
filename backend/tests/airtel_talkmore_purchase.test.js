const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');

describe('Airtel Talk More purchase flow', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.AIRTEL_TALKMORE_MODE = 'mock';
  });

  beforeEach(async () => {
    await VoiceBundlePurchase.destroy({ where: {} });
  });

  const makeUserWithBalance = async (balance) => {
    const user = await User.create({
      name: 'TalkMore User',
      email: `talkmore_${Date.now()}@test.com`,
      phone: `0802${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return user;
  };

  it('lists Airtel Talk More bundles', async () => {
    const res = await request(app).get('/api/callplans/airtel-talk-more/bundles');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('purchases a bundle and records purchase history', async () => {
    const user = await makeUserWithBalance(10000);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/airtel-talk-more/bundles');
    const bundle = bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/airtel-talk-more/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '08081234567' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference).toBeTruthy();

    const history = await request(app)
      .get('/api/callplans/airtel-talk-more/history')
      .set('Authorization', `Bearer ${token}`);

    expect(history.statusCode).toBe(200);
    expect(history.body.success).toBe(true);
    expect(history.body.rows.length).toBeGreaterThan(0);
    expect(history.body.rows[0].status).toBe('completed');
  });

  it('rejects invalid phone number', async () => {
    const user = await makeUserWithBalance(10000);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/airtel-talk-more/bundles');
    const bundle = bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/airtel-talk-more/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '123' });

    expect(res.statusCode).toBe(400);
  });

  it('rejects purchase when wallet is insufficient', async () => {
    const user = await makeUserWithBalance(10);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const bundles = await request(app).get('/api/callplans/airtel-talk-more/bundles');
    const bundle = bundles.body.data.find((b) => Number(b.price) >= 100) || bundles.body.data[0];

    const res = await request(app)
      .post(`/api/callplans/airtel-talk-more/${bundle.id}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientPhoneNumber: '08081234567' });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message).toLowerCase()).toContain('insufficient');
  });
});

