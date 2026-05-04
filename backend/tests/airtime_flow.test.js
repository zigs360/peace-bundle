const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { connectDB, User, Wallet, WalletTransaction, Transaction, Sim, sequelize } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
const ogdamsService = require('../services/ogdamsService');

/**
 * Integration Test for Airtime Purchase Flow
 * 
 * Scenarios:
 * 1. Success via Local SIM
 * 2. Fallback to API when SIM is unavailable
 * 3. Atomic failure (insufficient balance)
 */

const seedUserWithBalance = async ({ balance }) => {
  const unique = `airtime-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = await bcrypt.hash('password123', 4);
  const user = await User.create({
    name: 'Airtime Tester',
    email: `${unique}@test.com`,
    password,
    phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    role: 'admin',
    account_status: 'active',
  });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'test_jwt_secret', { expiresIn: '1h' });
  expect(token).toBeTruthy();

  const [wallet] = await Wallet.findOrCreate({
    where: { userId: user.id },
    defaults: { balance: 0 },
  });
  await wallet.update({ balance, daily_limit: 99999999, daily_spent: 0, status: 'active' });

  return { user, token };
};

const createTransactionPinSession = async (token) => {
  await request(app)
    .post('/api/auth/transaction-pin')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

  const sessionRes = await request(app)
    .post('/api/auth/transaction-pin/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ pin: '4826', scope: 'financial' });

  expect(sessionRes.statusCode).toBe(200);
  return sessionRes.body?.data?.token;
};

describe('Airtime Purchase Flow', () => {
  beforeAll(async () => {
    await connectDB();
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockImplementation(async ({ reference }) => {
      return { status: 'success', reference: reference || 'MOCK-OGDAMS-REF' };
    });
    jest.spyOn(ogdamsService, 'checkAirtimeStatus').mockResolvedValue(null);
  });

  afterEach(async () => {
    await SystemSetting.destroy({ where: { key: ['transaction_limits_user_daily_transactions', 'transaction_limits_user_hourly_transactions', 'transaction_limits_user_daily_value_limit', 'transaction_limits_admin_daily_transactions', 'transaction_limits_admin_hourly_transactions', 'transaction_limits_admin_daily_value_limit'] } });
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Sim.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('POST /api/transactions/airtime attempts Ogdams first (even when SIM exists)', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });
    const pinToken = await createTransactionPinSession(token);

    await Sim.create({
      userId: user.id,
      provider: 'mtn',
      phoneNumber: '08111111111',
      status: 'active',
      type: 'device_based',
      airtimeBalance: 5000,
    });

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({ network: 'mtn', phone: '08122222222', amount: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.smeplug_response.provider).toBe('ogdams');
    expect(res.body.transaction.metadata.service_provider).toBe('ogdams');
    expect(ogdamsService.purchaseAirtime).toHaveBeenCalled();
    expect(smeplugService.purchaseVTU).not.toHaveBeenCalled();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
  });

  it('POST /api/transactions/airtime auto-refunds and does not switch routes when Ogdams fails and a SIM exists', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });
    const pinToken = await createTransactionPinSession(token);

    await Sim.create({
      userId: user.id,
      provider: 'mtn',
      phoneNumber: '08111111111',
      status: 'active',
      type: 'device_based',
      airtimeBalance: 5000,
    });

    ogdamsService.purchaseAirtime.mockRejectedValueOnce(new Error('OGDAMS down'));

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({ network: 'mtn', phone: '08133333333', amount: 100 });

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.status).toBe('refunded');
    expect(String(res.body.message || '').toLowerCase()).toMatch(/reversed|refund/);

    expect(smeplugService.purchaseVTU).not.toHaveBeenCalled();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(1000, 2);
  });

  it('POST /api/transactions/airtime auto-refunds and does not switch routes when Ogdams fails and no SIM exists', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });
    const pinToken = await createTransactionPinSession(token);

    ogdamsService.purchaseAirtime.mockResolvedValueOnce({ status: 'failed', message: 'temporary error' });

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({ network: 'mtn', phone: '08144444444', amount: 100 });

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.status).toBe('refunded');

    expect(smeplugService.purchaseVTU).not.toHaveBeenCalled();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(1000, 2);
  });

  it('wallet debit is atomic when insufficient balance', async () => {
    const { user } = await seedUserWithBalance({ balance: 50 });

    const t = await sequelize.transaction();
    try {
      await walletService.debit(user, 100, 'airtime_purchase', 'Test Airtime', {}, t);
      await t.commit();
      throw new Error('Debit should have failed');
    } catch (e) {
      await t.rollback();
    }

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(50, 2);
  });

  it('POST /api/purchase/unified airtime works with +234 format and debits full amount', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });
    const pinToken = await createTransactionPinSession(token);

    const res = await request(app)
      .post('/api/purchase/unified')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({
        phone: '+2348133333333',
        serviceType: 'airtime',
        amount: 100,
        network: 'mtn',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.smeplug_response.provider).toBe('ogdams');
    expect(res.body.transaction.metadata.service_provider).toBe('ogdams');

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
  });

  it('does not fall back immediately when Ogdams times out (queues for verification)', async () => {
    const originalTimeout = process.env.OGDAMS_TIMEOUT_MS;
    process.env.OGDAMS_TIMEOUT_MS = '5';

    const { user, token } = await seedUserWithBalance({ balance: 1000 });
    const pinToken = await createTransactionPinSession(token);

    ogdamsService.purchaseAirtime.mockImplementationOnce(() => new Promise(() => {}));
    ogdamsService.checkAirtimeStatus.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({ network: 'mtn', phone: '08155555555', amount: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.message || '').toLowerCase()).toContain('queued');
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.status).toBe('queued');
    expect(res.body.transaction.metadata?.reconcile_scheduled).toBe(true);

    expect(smeplugService.purchaseVTU).not.toHaveBeenCalled();

    process.env.OGDAMS_TIMEOUT_MS = originalTimeout;

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
  });
});
