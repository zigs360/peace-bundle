const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');

describe('BillStack webhook', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.BILLSTACK_WEBHOOK_SECRET = 'test_billstack_webhook_secret';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.BILLSTACK_WEBHOOK_SECRET = 'test_billstack_webhook_secret';
    delete process.env.MOCK_BVN_ALLOWED;
    delete process.env.MOCK_BVN_FUNDING_CAP_NGN;
    delete process.env.MOCK_BVN_MAX_EVENTS_24H;
  });

  it('credits wallet by virtual account number and is idempotent by reference', async () => {
    const user = await User.create({
      name: 'Webhook VA User',
      email: `webhook_va_${Date.now()}@test.com`,
      phone: '08011007700',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530575',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA User',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const payload = {
      event: 'PAYMENT_NOTIFIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        merchant_reference: 'PB-REF',
        wiaxy_ref: 'INTERBANK-REF',
        amount: '1500',
        created_at: new Date().toISOString(),
        account: {
          account_number: '6634530575',
          account_name: 'Webhook VA User',
          bank_name: 'PALMPAY',
          created_at: new Date().toISOString(),
        },
        payer: {
          account_number: '0001112223',
          first_name: 'Pay',
          last_name: 'Er',
          createdAt: new Date().toISOString(),
        },
      },
    };

    const signature = crypto.createHmac('sha256', process.env.BILLSTACK_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');

    const res1 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res1.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    const afterBalance = parseFloat(walletAfter.balance);
    expect(afterBalance).toBe(beforeBalance + 1500);

    const txn = await Transaction.findOne({ where: { reference: payload.data.reference } });
    expect(txn).toBeTruthy();

    const res2 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res2.statusCode).toBe(200);

    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    const afterBalance2 = parseFloat(walletAfter2.balance);
    expect(afterBalance2).toBe(afterBalance);
  });

  it('accepts signature via x-wiaxy-signature header', async () => {
    const user = await User.create({
      name: 'Webhook VA User 2',
      email: `webhook_va2_${Date.now()}@test.com`,
      phone: '08011007703',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530588',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA User 2',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const payload = {
      event: 'PAYMENT_NOTIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        amount: 500,
        account: { account_number: '6634530588' }
      }
    };

    const signature = crypto
      .createHmac('sha256', process.env.BILLSTACK_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res = await request(app).post('/api/webhooks/billstack').set('x-wiaxy-signature', signature).send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 500);
  });

  it('credits wallet when account number exists in dual virtual account metadata', async () => {
    const accountNumber = '6634530599';
    const user = await User.create({
      name: 'Dual VA User',
      email: `dual_va_${Date.now()}@test.com`,
      phone: '08011007702',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      metadata: {
        dual_virtual_accounts: {
          accounts: {
            billstack: { accountNumber, bankName: 'PALMPAY', accountName: 'Dual VA User' }
          }
        }
      }
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const payload = {
      event: 'PAYMENT_NOTIFIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        amount: '500',
        account: { account_number: accountNumber }
      }
    };

    const signature = crypto.createHmac('sha256', process.env.BILLSTACK_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
    const res = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 500);
  });

  it('rejects invalid signature when secret is set', async () => {
    const payload = {
      event: 'PAYMENT_NOTIFIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        amount: '100',
        account: { account_number: '0000000000' }
      }
    };

    const res = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', 'bad').send(payload);
    expect(res.statusCode).toBe(400);
  });

  it('rejects webhook in production when secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BILLSTACK_WEBHOOK_SECRET;

    const payload = {
      event: 'PAYMENT_NOTIFIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        amount: '100',
        account: { account_number: '0000000000' }
      }
    };

    const res = await request(app).post('/api/webhooks/billstack').send(payload);
    expect(res.statusCode).toBe(500);
  });

  it('holds funding for review for mock-bvn users when cap is exceeded', async () => {
    process.env.MOCK_BVN_ALLOWED = 'true';
    process.env.MOCK_BVN_FUNDING_CAP_NGN = '1000';

    const user = await User.create({
      name: 'MockBVN User',
      email: `mockbvn_va_${Date.now()}@test.com`,
      phone: '08011007701',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530576',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'MockBVN User',
      metadata: { mock_bvn_status: 'mock' }
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const payload = {
      event: 'PAYMENT_NOTIFIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `BILLSTACK-TXN-${Date.now()}`,
        amount: '1500',
        account: { account_number: '6634530576' }
      }
    };

    const signature = crypto.createHmac('sha256', process.env.BILLSTACK_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
    const res = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    const afterBalance = parseFloat(walletAfter.balance);
    expect(afterBalance).toBe(beforeBalance);

    const txn = await Transaction.findOne({ where: { reference: payload.data.reference } });
    expect(txn).toBeTruthy();
    expect(txn.status).toBe('pending');
    expect(txn.metadata.review_status).toBe('pending_review');
  });
});
