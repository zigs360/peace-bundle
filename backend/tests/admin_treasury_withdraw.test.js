const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');

jest.mock('../services/smeplugService', () => ({
  resolveAccount: jest.fn(),
  sendTransfer: jest.fn(),
  getBanks: jest.fn(),
}));

jest.mock('../services/billstackTransferService', () => ({
  initiateTransfer: jest.fn(),
}));

const billstackTransferService = require('../services/billstackTransferService');

describe('Admin treasury settlement withdrawal', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.SETTLEMENT_TRANSFER_FEE_NGN = '50';
    process.env.SETTLEMENT_BANK_CODE = '50515';
  });

  beforeEach(async () => {
    await TreasuryLedgerEntry.destroy({ where: {} });
    await TreasuryBalance.destroy({ where: {} });
    await SystemSetting.set('treasury_last_sync_at', new Date(Date.now() - 1000).toISOString(), 'string', 'treasury');

    billstackTransferService.initiateTransfer.mockResolvedValue({
      success: true,
      reference: 'BILLSTACK-TRF-1',
      data: { status: true, data: { reference: 'BILLSTACK-TRF-1' } },
    });
  });

  it('withdraws treasury balance to settlement', async () => {
    const adminUser = await User.create({
      name: 'Admin',
      email: `admin_${Date.now()}@test.com`,
      phone: `0801${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    await TreasuryBalance.create({ balance: 100, currency: 'NGN' });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const balRes1 = await request(app)
      .get('/api/admin/treasury/balance')
      .set('Authorization', `Bearer ${token}`);
    expect(balRes1.statusCode).toBe(200);
    expect(balRes1.body.balance).toBe(100);

    const wdRes = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 40, description: 'Settlement payout' });
    expect(wdRes.statusCode).toBe(200);
    expect(wdRes.body.success).toBe(true);
    expect(billstackTransferService.initiateTransfer).toHaveBeenCalled();
    expect(billstackTransferService.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        bankCode: '50515',
        accountNumber: '8035446865',
        amount: 40,
      })
    );

    const balRow = await TreasuryBalance.findOne();
    expect(parseFloat(balRow.balance)).toBe(10);

    const ledgers = await TreasuryLedgerEntry.findAll({ order: [['createdAt', 'ASC']] });
    expect(ledgers.some((l) => l.source === 'settlement_withdrawal' && l.type === 'debit')).toBe(true);
  });

  it('rejects withdrawal if treasury balance is insufficient', async () => {
    const adminUser = await User.create({
      name: 'Admin2',
      email: `admin2_${Date.now()}@test.com`,
      phone: `0803${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });
    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const wdRes = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1 });
    expect(wdRes.statusCode).toBe(400);
  });

  it('rolls back treasury deduction if provider transfer fails', async () => {
    billstackTransferService.initiateTransfer.mockResolvedValue({ success: false, error: 'provider down' });

    const adminUser = await User.create({
      name: 'Admin3',
      email: `admin3_${Date.now()}@test.com`,
      phone: `0804${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    await TreasuryBalance.create({ balance: 100, currency: 'NGN' });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const before = await TreasuryBalance.findOne();
    const beforeBal = parseFloat(before.balance);

    const wdRes = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 40 });
    expect(wdRes.statusCode).toBeGreaterThanOrEqual(400);

    const after = await TreasuryBalance.findOne();
    expect(parseFloat(after.balance)).toBe(beforeBal);
  });

  it('is idempotent when Idempotency-Key is provided', async () => {
    const adminUser = await User.create({
      name: 'Admin4',
      email: `admin4_${Date.now()}@test.com`,
      phone: `0806${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    await TreasuryBalance.create({ balance: 100, currency: 'NGN' });

    const idKey = `wd-${Date.now()}-idempotent`;
    const res1 = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idKey)
      .send({ amount: 40 });
    expect(res1.statusCode).toBe(200);

    const bal1 = await TreasuryBalance.findOne();
    const after1 = parseFloat(bal1.balance);

    const res2 = await request(app)
      .post('/api/admin/treasury/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idKey)
      .send({ amount: 40 });
    expect([200, 409]).toContain(res2.statusCode);

    const bal2 = await TreasuryBalance.findOne();
    expect(parseFloat(bal2.balance)).toBe(after1);
    expect(billstackTransferService.initiateTransfer).toHaveBeenCalledTimes(1);
  });
});
