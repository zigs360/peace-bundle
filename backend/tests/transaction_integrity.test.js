const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const DataPlan = require('../models/DataPlan');
const Transaction = require('../models/Transaction');
const Sim = require('../models/Sim');
const TransactionIntegrityAudit = require('../models/TransactionIntegrityAudit');
const SystemSetting = require('../models/SystemSetting');
const ogdamsService = require('../services/ogdamsService');
const smeplugService = require('../services/smeplugService');
const walletService = require('../services/walletService');
const transactionIntegrityService = require('../services/transactionIntegrityService');

describe('Transaction integrity safeguards', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.AIRTIME_PRIMARY_ROUTE = 'ogdams';
    process.env.SIM_POOL_ENABLED = 'false';
    process.env.SIM_POOL_ALLOW_WALLET_FALLBACK = 'false';
  });

  beforeEach(async () => {
    await SystemSetting.destroy({ where: { key: ['transaction_limits_user_daily_transactions', 'transaction_limits_user_hourly_transactions', 'transaction_limits_user_daily_value_limit', 'transaction_limits_admin_daily_transactions', 'transaction_limits_admin_hourly_transactions', 'transaction_limits_admin_daily_value_limit'] } });
    await TransactionIntegrityAudit.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await Sim.destroy({ where: {}, force: true });
    await DataPlan.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {}, force: true });
    jest.restoreAllMocks();
  });

  const createUserWithToken = async ({ balance = 0, prefix = 'user' } = {}) => {
    const unique = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const password = await bcrypt.hash('password123', 4);
    const user = await User.create({
      name: unique,
      email: `${unique}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password,
      role: 'admin',
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return {
      user,
      token: jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' }),
    };
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

  it('locks airtime purchases to a single route and auto-refunds on hard provider failure', async () => {
    const { user, token } = await createUserWithToken({ balance: 1000, prefix: 'airtime' });
    const pinToken = await createTransactionPinSession(token);
    await Sim.create({
      userId: user.id,
      provider: 'mtn',
      phoneNumber: '08111111111',
      status: 'active',
      type: 'device_based',
      airtimeBalance: 5000,
    });

    jest.spyOn(ogdamsService, 'purchaseAirtime').mockRejectedValueOnce(new Error('OGDAMS down'));
    const smeplugSpy = jest.spyOn(smeplugService, 'purchaseVTU');

    const res = await request(app)
      .post('/api/transactions/airtime')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({ network: 'mtn', phone: '08133333333', amount: 100, reference: 'AIRTIME-INTEGRITY-001' });

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(smeplugSpy).not.toHaveBeenCalled();

    const debitTxn = await Transaction.findOne({ where: { reference: 'AIRTIME-INTEGRITY-001' } });
    expect(debitTxn).toBeTruthy();
    expect(debitTxn.payment_channel).toBe('ogdams_wallet');
    expect(debitTxn.fulfillment_route).toBe('ogdams_api');
    expect(debitTxn.status).toBe('refunded');
    expect(debitTxn.refund_reference).toBeTruthy();

    const refundTxn = await Transaction.findOne({ where: { reference: debitTxn.refund_reference } });
    expect(refundTxn.source).toBe('refund');

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(1000, 2);
  });

  it('keeps airtime on the Ogdams wallet route even when the preferred SIM is Ogdams-linked', () => {
    const route = transactionIntegrityService.selectAirtimeRoute({
      network: 'mtn',
      preferredSim: { id: 'sim-1', ogdamsLinked: true },
    });

    expect(route).toEqual({
      paymentChannel: 'ogdams_wallet',
      fulfillmentRoute: 'ogdams_api',
      provider: 'mtn',
    });
  });

  it('auto-refunds failed data purchases instead of leaving the user debited', async () => {
    const { user, token } = await createUserWithToken({ balance: 5000, prefix: 'data' });
    const pinToken = await createTransactionPinSession(token);

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'gifting',
      name: '1GB [GIFTING]',
      size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      admin_price: 475,
      api_cost: 500,
      available_sim: false,
      available_wallet: true,
      smeplug_plan_id: '20002',
      is_active: true,
    });

    jest.spyOn(smeplugService, 'purchaseData').mockResolvedValueOnce({ success: false, error: 'Provider failed' });

    const res = await request(app)
      .post('/api/transactions/data')
      .set('Authorization', `Bearer ${token}`)
      .set('x-transaction-pin-token', pinToken)
      .send({
        network: 'mtn',
        planId: plan.id,
        phone: '08031234567',
        amount: 475,
        reference: 'DATA-INTEGRITY-001',
      });

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '').toLowerCase()).toMatch(/failed|reversed/);

    const debitTxn = await Transaction.findOne({ where: { reference: 'DATA-INTEGRITY-001' } });
    expect(debitTxn.fulfillment_route).toBe('smeplug_api');
    expect(debitTxn.status).toBe('refunded');
    expect(debitTxn.refund_reference).toBeTruthy();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(5000, 2);
  });

  it('creates wallet transactions with explicit insert fields so old schemas do not receive integrity defaults', async () => {
    const { user } = await createUserWithToken({ balance: 1000, prefix: 'safe-fields' });
    const createSpy = jest.spyOn(Transaction, 'create');

    await walletService.debit(user, 100, 'airtime_purchase', 'Safe field debit', {
      reference: 'SAFE-FIELDS-001',
    });

    const [, options] = createSpy.mock.calls.at(-1);
    expect(options.fields).toEqual(expect.arrayContaining([
      'id',
      'walletId',
      'userId',
      'type',
      'amount',
      'balance_before',
      'balance_after',
      'source',
      'reference',
      'description',
      'metadata',
      'status',
      'completed_at',
    ]));
    expect(options.fields).not.toEqual(expect.arrayContaining([
      'payment_channel',
      'fulfillment_route',
      'route_lock_key',
      'delivery_status',
      'integrity_status',
      'refund_reference',
      'anomaly_flag',
    ]));
  });

  it('automatically reverses duplicate charges discovered by the monitor', async () => {
    const { user } = await createUserWithToken({ balance: 1000, prefix: 'dup' });
    const fingerprint = transactionIntegrityService.buildFingerprint({
      userId: user.id,
      source: 'airtime_purchase',
      recipientPhone: '08030000000',
      amount: 100,
      network: 'mtn',
      faceValue: 100,
    });

    await walletService.debit(user, 100, 'airtime_purchase', 'First debit', {
      reference: 'DUP-TXN-001',
      client_reference: 'DUP-CLIENT-001',
      transaction_fingerprint: fingerprint,
    });
    await walletService.debit(user, 100, 'airtime_purchase', 'Second debit', {
      reference: 'DUP-TXN-002',
      client_reference: 'DUP-CLIENT-001',
      transaction_fingerprint: fingerprint,
    });

    const result = await transactionIntegrityService.monitorAndRepair({ limit: 50 });
    expect(result.duplicateRefunds).toBeGreaterThanOrEqual(1);

    const duplicate = await Transaction.findOne({ where: { reference: 'DUP-TXN-002' } });
    expect(duplicate.status).toBe('refunded');
    expect(duplicate.refund_reference).toBeTruthy();

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBeCloseTo(900, 2);
  });

  it('automatically rolls back stale undelivered debits and writes integrity audits', async () => {
    const { user } = await createUserWithToken({ balance: 1000, prefix: 'stale' });
    const debitTxn = await walletService.debit(user, 150, 'data_purchase', 'Stale data debit', {
      reference: 'STALE-TXN-001',
      client_reference: 'STALE-CLIENT-001',
      transaction_fingerprint: 'STALE-FINGERPRINT-001',
    });
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000);
    await debitTxn.update({
      status: 'processing',
      fulfillment_route: 'smeplug_api',
      payment_channel: 'smeplug_wallet',
      delivery_status: 'pending',
      integrity_status: 'route_locked',
      metadata: {
        ...(debitTxn.metadata || {}),
        integrity: {
          ...((debitTxn.metadata || {}).integrity || {}),
          createdAt: staleTimestamp.toISOString(),
          routeLock: {
            paymentChannel: 'smeplug_wallet',
            fulfillmentRoute: 'smeplug_api',
            provider: 'mtn',
            simId: null,
            lockedAt: staleTimestamp.toISOString(),
          },
        },
      },
    });

    const result = await transactionIntegrityService.monitorAndRepair({ limit: 50 });
    expect(result.staleTransactionsResolved).toBeGreaterThanOrEqual(1);

    const freshTxn = await Transaction.findOne({ where: { reference: 'STALE-TXN-001' } });
    expect(freshTxn.status).toBe('refunded');
    expect(freshTxn.refund_reference).toBeTruthy();

    const audits = await TransactionIntegrityAudit.findAll({ where: { transactionId: freshTxn.id } });
    expect(audits.some((item) => item.eventType === 'stale_transaction_rolled_back')).toBe(true);
    expect(audits.some((item) => item.eventType === 'auto_refund_completed')).toBe(true);
  });
});
