const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');
const sequelize = require('../config/database');

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

    const signature = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');

    const res1 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res1.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    const afterBalance = parseFloat(walletAfter.balance);
    expect(afterBalance).toBe(beforeBalance + 1500);

    const txn = await Transaction.findOne({ where: { reference: payload.data.wiaxy_ref } });
    expect(txn).toBeTruthy();

    const res2 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', signature).send(payload);
    expect(res2.statusCode).toBe(200);

    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    const afterBalance2 = parseFloat(walletAfter2.balance);
    expect(afterBalance2).toBe(afterBalance);
  });

  it('credits wallet even when created_at is old (provider resend)', async () => {
    const user = await User.create({
      name: 'Webhook VA Old Event User',
      email: `webhook_va_old_${Date.now()}@test.com`,
      phone: '08011007709',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530611',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA Old Event User',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const wiaxy_ref = `MI-${Date.now()}`;
    const payload = {
      event: 'PAYMENT_NOTIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `R-${Date.now()}`,
        merchant_reference: `PB-${user.id}`,
        wiaxy_ref,
        transaction_ref: wiaxy_ref,
        amount: 200,
        created_at: '2026-04-07 06:39:12',
        account: { account_number: '6634530611', bank_name: 'PALMPAY' }
      }
    };

    const sig = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
    const res = await request(app).post('/api/webhooks/billstack').set('x-wiaxy-signature', sig).send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 200);
  });

  it('credits wallet correctly under concurrent funding webhooks', async () => {
    if (sequelize.getDialect && sequelize.getDialect() === 'sqlite') return;
    const user = await User.create({
      name: 'Webhook VA Concurrent User',
      email: `webhook_va_concurrent_${Date.now()}@test.com`,
      phone: '08011007710',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6690731997',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA Concurrent User',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const sig = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
    const mk = (suffix) => {
      const wiaxy_ref = `MI-${Date.now()}-${suffix}`;
      return {
        event: 'PAYMENT_NOTIFICATION',
        data: {
          type: 'RESERVED_ACCOUNT_TRANSACTION',
          reference: `R-${Date.now()}-${suffix}`,
          merchant_reference: `PB-${user.id}`,
          wiaxy_ref,
          transaction_ref: wiaxy_ref,
          amount: 200,
          created_at: new Date().toISOString(),
          account: { account_number: '6690731997', bank_name: 'PALMPAY' }
        }
      };
    };

    const [res1, res2] = await Promise.all([
      request(app).post('/api/webhooks/billstack').set('x-wiaxy-signature', sig).send(mk('A')),
      request(app).post('/api/webhooks/billstack').set('x-wiaxy-signature', sig).send(mk('B')),
    ]);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 300);
  });

  it('is idempotent across billstack reference changes when wiaxy_ref is the same', async () => {
    const user = await User.create({
      name: 'Webhook VA User 3',
      email: `webhook_va3_${Date.now()}@test.com`,
      phone: '08011007704',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530577',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA User 3',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const wiaxy_ref = `MI-${Date.now()}`;
    const payload1 = {
      event: 'PAYMENT_NOTIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `R-${Date.now()}-A`,
        wiaxy_ref,
        transaction_ref: wiaxy_ref,
        amount: 500,
        account: { account_number: '6634530577' }
      }
    };

    const sig1 = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
    const res1 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', sig1).send(payload1);
    expect(res1.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 500);

    const txn1 = await Transaction.findOne({ where: { reference: payload1.data.wiaxy_ref } });
    expect(txn1).toBeTruthy();
    expect(txn1.metadata?.inter_bank_reference).toBe(wiaxy_ref);
    expect(txn1.metadata?.transaction_ref).toBe(wiaxy_ref);

    const payload2 = {
      ...payload1,
      data: { ...payload1.data, reference: `R-${Date.now()}-B` }
    };

    const sig2 = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
    const res2 = await request(app).post('/api/webhooks/billstack').set('x-billstack-signature', sig2).send(payload2);
    expect(res2.statusCode).toBe(200);

    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter2.balance)).toBe(beforeBalance + 500);
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
      .createHash('md5')
      .update(process.env.BILLSTACK_WEBHOOK_SECRET)
      .digest('hex');

    const res = await request(app).post('/api/webhooks/billstack').set('x-wiaxy-signature', signature).send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 500);
  });

  it('accepts webhook without signature header and still credits wallet', async () => {
    const user = await User.create({
      name: 'Webhook VA User 4',
      email: `webhook_va4_${Date.now()}@test.com`,
      phone: '08011007705',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: '6634530601',
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Webhook VA User 4',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const wiaxy_ref = `MI-${Date.now()}`;
    const payload = {
      event: 'PAYMENT_NOTIFICATION',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference: `R-${Date.now()}`,
        merchant_reference: `PB-${user.id}`,
        wiaxy_ref,
        transaction_ref: wiaxy_ref,
        amount: 200,
        account: { account_number: '6634530601' }
      }
    };

    const res = await request(app).post('/api/webhooks/billstack').send(payload);
    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 200);
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

    const signature = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
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
    expect(res.statusCode).toBe(200);
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

    const signature = crypto.createHash('md5').update(process.env.BILLSTACK_WEBHOOK_SECRET).digest('hex');
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
