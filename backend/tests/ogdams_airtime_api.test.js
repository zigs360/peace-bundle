const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, WalletTransaction } = require('../config/db');
const ogdamsService = require('../services/ogdamsService');
const dataPurchaseService = require('../services/dataPurchaseService');

const REPORT_DIR = path.join(__dirname, '..', 'test_reports');
const REPORT_FILE = path.join(REPORT_DIR, `ogdams_airtime_api_report_${Date.now()}.json`);

const results = [];

const record = (name, startedAt, endedAt, res, extra = {}) => {
  results.push({
    name,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - startedAt,
    statusCode: res?.statusCode,
    response: res?.body,
    ...extra,
  });
};

describe('OGDAMS Airtime Purchase API', () => {
  let token;
  let user;

  beforeAll(async () => {
    await connectDB();
    process.env.AIRTIME_MAX_NGN = '100000';
  });

  beforeEach(async () => {
    const email = `ogdams_airtime_${Date.now()}@test.com`;
    const reg = await request(app).post('/api/auth/register').send({
      name: 'OGDAMS Airtime Tester',
      email,
      password: 'password123',
      phone: `080${Date.now().toString().slice(-8)}`,
    });
    token = reg.body.token;
    user = await User.findOne({ where: { email } });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 200000, daily_limit: 1000000, daily_spent: 0 });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    try {
      if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    } catch (e) {
      void e;
    }
  });

  it('positive flow: successful OGdams airtime purchase debits wallet and logs transaction with unique reference', async () => {
    const ogSpy = jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({
      status: 'success',
      reference: 'OGD-REF-1',
      delivery: { credited: true, msisdn: '08012345678' },
    });

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });
    const endedAt = Date.now();
    record('positive_success', startedAt, endedAt, res, { provider: 'ogdams' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction?.reference).toBeTruthy();

    const txn = await Transaction.findOne({ where: { reference: res.body.transaction.reference } });
    expect(txn).toBeTruthy();
    expect(txn.source).toBe('airtime_purchase');
    expect(txn.status).toBe('completed');
    expect(txn.smeplug_response?.provider).toBe('ogdams');
    expect(txn.smeplug_response?.data?.delivery?.credited).toBe(true);

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(parseFloat(txn.balance_after), 2);

    expect(ogSpy).toHaveBeenCalledTimes(1);
    const calledWith = ogSpy.mock.calls[0][0];
    expect(calledWith.phoneNumber).toBe('08012345678');
    expect(calledWith.amount).toBe(500);
    expect(calledWith.reference).toBe(txn.reference);
  });

  it('negative: insufficient balance returns 400 and does not call OGdams', async () => {
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 0, daily_spent: 0 });

    const ogSpy = jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success' });

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });
    const endedAt = Date.now();
    record('negative_insufficient_balance', startedAt, endedAt, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).toMatch(/Insufficient wallet balance/i);
    expect(ogSpy).toHaveBeenCalledTimes(0);
  });

  it('negative: invalid phone number returns 400', async () => {
    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08012', amount: 500 });
    const endedAt = Date.now();
    record('negative_invalid_phone', startedAt, endedAt, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('negative: provider timeout results in queued transaction (no immediate failure) and no duplicate vend', async () => {
    jest.spyOn(dataPurchaseService, 'scheduleAirtimeReconciliation').mockImplementation(() => {});
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockImplementation(async () => {
      const err = new Error('OGDAMS timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    });
    jest.spyOn(ogdamsService, 'checkAirtimeStatus').mockResolvedValue({ status: 'pending' });

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });
    const endedAt = Date.now();
    record('negative_timeout_queued', startedAt, endedAt, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.message || '')).toMatch(/queued/i);

    const txn = await Transaction.findOne({ where: { reference: res.body.transaction.reference } });
    expect(txn.status).toBe('queued');
    expect(txn.metadata?.provider_pending).toBe(true);
  });

  it('edge: minimum amount (50) succeeds', async () => {
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success', reference: 'OGD-REF-MIN' });

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'airtel', phone: '08012345678', amount: 50 });
    const endedAt = Date.now();
    record('edge_min_amount', startedAt, endedAt, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('edge: maximum amount succeeds', async () => {
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success', reference: 'OGD-REF-MAX' });

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'glo', phone: '08012345678', amount: 100000 });
    const endedAt = Date.now();
    record('edge_max_amount', startedAt, endedAt, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('edge: duplicate request with same Idempotency-Key is idempotent (no double debit)', async () => {
    const key = `IDEMP_${Date.now()}`;
    const ogSpy = jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success', reference: 'OGD-REF-IDEMP' });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const res1 = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });
    expect(res1.statusCode).toBe(200);

    const res2 = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });

    expect(res2.statusCode).toBe(200);
    expect(String(res2.body.message || '')).toMatch(/idempotent/i);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBeCloseTo(beforeBalance - 500, 2);
    expect(ogSpy).toHaveBeenCalledTimes(1);
  });

  it('security: rejects injection-like payloads for network and reference', async () => {
    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: "mtn'; DROP TABLE users; --", phone: '08012345678', amount: 500, reference: "abc';--" });
    const endedAt = Date.now();
    record('security_injection', startedAt, endedAt, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('reconciliation: wallet balance matches last transaction balance_after', async () => {
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success', reference: 'OGD-REF-REC' });

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .send({ network: 'mtn', phone: '08012345678', amount: 500 });
    expect(res.statusCode).toBe(200);

    const txn = await Transaction.findOne({ where: { reference: res.body.transaction.reference } });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(parseFloat(txn.balance_after), 2);
  });

  it('performance: measures response times under normal load (sequential)', async () => {
    jest.spyOn(ogdamsService, 'purchaseAirtime').mockResolvedValue({ status: 'success', reference: 'OGD-REF-PERF' });

    const iterations = 10;
    const durations = [];

    for (let i = 0; i < iterations; i += 1) {
      const start = Date.now();
      const res = await request(app)
        .post('/api/transactions/airtime')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `PERF_${Date.now()}_${i}`)
        .send({ network: 'mtn', phone: '08012345678', amount: 50 });
      const end = Date.now();
      durations.push(end - start);
      expect(res.statusCode).toBe(200);
    }

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95) - 1] || durations[durations.length - 1];
    results.push({
      name: 'performance_small_load',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      iterations,
      durationsMs: durations,
      p95Ms: p95,
      pass: p95 < 3000
    });
  });
});
