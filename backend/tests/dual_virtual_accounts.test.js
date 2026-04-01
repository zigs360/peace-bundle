const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const payvesselService = require('../services/payvesselService');

describe('Dual virtual accounts (BillStack + PayVessel)', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ok for both providers when both succeed', async () => {
    const user = await User.create({
      name: 'Dual VA User',
      email: `dual_va_${Date.now()}@test.com`,
      phone: `095${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '0000000000',
      bankName: 'PALMPAY',
      accountName: 'Alias-Dual VA User',
      trackingReference: 'R-TEST-BS',
    });
    jest.spyOn(payvesselService, 'createVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '1111111111',
      bankName: 'Palmpay',
      accountName: 'DUAL VA USER',
      trackingReference: 'PV-TEST',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 0 } });

    expect(res.statusCode).toBe(200);
    expect(res.body.overallStatus).toBe('ok');
    expect(res.body.results.billstack.status).toBe('ok');
    expect(res.body.results.payvessel.status).toBe('ok');
    expect(res.body.results.billstack.account.accountNumberMasked).toBe('******0000');
    expect(res.body.results.payvessel.account.accountNumberMasked).toBe('******1111');
  });

  it('returns partial when one provider fails', async () => {
    const user = await User.create({
      name: 'Dual VA Partial',
      email: `dual_va_partial_${Date.now()}@test.com`,
      phone: `090${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId').mockRejectedValue(new Error('BillStack down'));
    jest.spyOn(payvesselService, 'createVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '2222222222',
      bankName: 'Palmpay',
      accountName: 'DUAL VA PARTIAL',
      trackingReference: 'PV-TEST-2',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 0 } });

    expect(res.statusCode).toBe(200);
    expect(res.body.overallStatus).toBe('partial');
    expect(res.body.results.billstack.status).toBe('error');
    expect(res.body.results.payvessel.status).toBe('ok');
  });

  it('returns 502 when both providers fail', async () => {
    const user = await User.create({
      name: 'Dual VA Failed',
      email: `dual_va_failed_${Date.now()}@test.com`,
      phone: `091${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId').mockRejectedValue(new Error('BillStack down'));
    jest.spyOn(payvesselService, 'createVirtualAccountForUserId').mockRejectedValue(new Error('PayVessel down'));

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 0 } });

    expect(res.statusCode).toBe(502);
    expect(res.body.overallStatus).toBe('failed');
    expect(res.body.success).toBe(false);
  });

  it('is idempotent: second call reuses stored provider accounts', async () => {
    const user = await User.create({
      name: 'Dual VA Idem',
      email: `dual_va_idem_${Date.now()}@test.com`,
      phone: `092${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const bsSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '3333333333',
      bankName: 'PALMPAY',
      accountName: 'Alias-Dual VA Idem',
      trackingReference: 'R-TEST-IDEM',
    });
    const pvSpy = jest.spyOn(payvesselService, 'createVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '4444444444',
      bankName: 'Palmpay',
      accountName: 'DUAL VA IDEM',
      trackingReference: 'PV-IDEM',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res1 = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 0 } });
    expect(res1.statusCode).toBe(200);

    const res2 = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 0 } });
    expect(res2.statusCode).toBe(200);

    expect(bsSpy).toHaveBeenCalledTimes(1);
    expect(pvSpy).toHaveBeenCalledTimes(1);
  });

  it('retries transient failure and succeeds', async () => {
    const user = await User.create({
      name: 'Dual VA Retry',
      email: `dual_va_retry_${Date.now()}@test.com`,
      phone: `093${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const bsSpy = jest
      .spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        accountNumber: '5555555555',
        bankName: 'PALMPAY',
        accountName: 'Alias-Dual VA Retry',
        trackingReference: 'R-TEST-RETRY',
      });

    jest.spyOn(payvesselService, 'createVirtualAccountForUserId').mockResolvedValue({
      accountNumber: '6666666666',
      bankName: 'Palmpay',
      accountName: 'DUAL VA RETRY',
      trackingReference: 'PV-RETRY',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 50, retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 5 } });

    expect(res.statusCode).toBe(200);
    expect(res.body.overallStatus).toBe('ok');
    expect(bsSpy).toHaveBeenCalledTimes(2);
  });

  it('GET snapshot returns stored data without calling providers', async () => {
    const user = await User.create({
      name: 'Dual VA Snapshot',
      email: `dual_va_snapshot_${Date.now()}@test.com`,
      phone: `094${String(Date.now()).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      metadata: {
        dual_virtual_accounts: {
          accounts: {
            billstack: { accountNumber: '7777777777', bankName: 'PALMPAY', accountName: 'Alias-Snapshot', reference: 'R-SNAP' },
            payvessel: { accountNumber: '8888888888', bankName: 'Palmpay', accountName: 'SNAPSHOT', reference: 'PV-SNAP' }
          }
        }
      }
    });

    const bsSpy = jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountForUserId');
    const pvSpy = jest.spyOn(payvesselService, 'createVirtualAccountForUserId');

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/users/virtual-accounts/dual')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.overallStatus).toBe('ok');
    expect(res.body.results.billstack.status).toBe('ok');
    expect(res.body.results.payvessel.status).toBe('ok');
    expect(bsSpy).toHaveBeenCalledTimes(0);
    expect(pvSpy).toHaveBeenCalledTimes(0);
  });
});
