const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, WalletTransaction, Transaction, Sim, sequelize } = require('../config/db');
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
  const email = `airtime-${Date.now()}@test.com`;
  const phone = `080${Date.now().toString().slice(-8)}`;

  const regRes = await request(app).post('/api/auth/register').send({
    name: 'Airtime Tester',
    email,
    password: 'password123',
    phone,
  });
  expect(regRes.statusCode).toBe(201);
  const token = regRes.body.token;
  expect(token).toBeTruthy();

  const user = await User.findOne({ where: { email } });
  expect(user).toBeTruthy();

  const [wallet] = await Wallet.findOrCreate({
    where: { userId: user.id },
    defaults: { balance: 0 },
  });
  await wallet.update({ balance });

  return { user, token };
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
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Sim.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('POST /api/transactions/airtime attempts Ogdams first (even when SIM exists)', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });

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

  it('POST /api/transactions/airtime falls back to SMEPlug SIM route when Ogdams fails and SIM exists', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });

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
      .send({ network: 'mtn', phone: '08133333333', amount: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.smeplug_reference).toBe('MOCK-VTU-REF');
    expect(res.body.transaction.smeplug_response.provider).toBe('smeplug');
    expect(res.body.transaction.metadata.service_provider).toBe('smeplug');
    expect(res.body.transaction.metadata.provider_switch).toBeTruthy();

    expect(smeplugService.purchaseVTU).toHaveBeenCalled();
    const lastCall = smeplugService.purchaseVTU.mock.calls.at(-1);
    expect(lastCall[0]).toBe('mtn');
    expect(lastCall[1]).toBe('08133333333');
    expect(lastCall[2]).toBe(100);
    expect(lastCall[3]).toEqual({ mode: 'device_based', sim_number: '08111111111' });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
  });

  it('POST /api/transactions/airtime falls back to SMEPlug API when Ogdams fails and no SIM exists', async () => {
    const { user, token } = await seedUserWithBalance({ balance: 1000 });

    ogdamsService.purchaseAirtime.mockResolvedValueOnce({ status: 'failed', message: 'temporary error' });

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08144444444', amount: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.smeplug_reference).toBe('MOCK-VTU-REF');
    expect(res.body.transaction.smeplug_response.provider).toBe('smeplug');

    expect(smeplugService.purchaseVTU).toHaveBeenCalled();
    const lastCall = smeplugService.purchaseVTU.mock.calls.at(-1);
    expect(lastCall[0]).toBe('mtn');
    expect(lastCall[1]).toBe('08144444444');
    expect(lastCall[2]).toBe(100);
    expect(lastCall[3]).toBeUndefined();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
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

    const res = await request(app)
      .post('/api/purchase/unified')
      .set('Authorization', `Bearer ${token}`)
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

    ogdamsService.purchaseAirtime.mockImplementationOnce(() => new Promise(() => {}));
    ogdamsService.checkAirtimeStatus.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
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
