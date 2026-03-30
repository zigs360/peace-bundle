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
});

