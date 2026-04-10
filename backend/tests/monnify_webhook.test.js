const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');

describe('Monnify webhook', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.MONNIFY_SECRET_KEY = 'test_monnify_secret';
    process.env.FUNDING_FLAT_FEE_NGN = '50';
  });

  it('credits wallet by customer email and is idempotent by transactionReference', async () => {
    const user = await User.create({
      name: 'Monnify User',
      email: `monnify_${Date.now()}@test.com`,
      phone: '08011007712',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const transactionReference = `MN-${Date.now()}`;
    const payload = {
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference,
        amountPaid: 500,
        currencyCode: 'NGN',
        paymentStatus: 'PAID',
        customerDTO: { email: user.email },
      },
    };

    const signature = crypto
      .createHmac('sha512', process.env.MONNIFY_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res1 = await request(app).post('/api/webhooks/monnify').set('monnify-signature', signature).send(payload);
    expect(res1.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 450);

    const txn = await Transaction.findOne({ where: { reference: transactionReference } });
    expect(txn).toBeTruthy();

    const res2 = await request(app).post('/api/webhooks/monnify').set('monnify-signature', signature).send(payload);
    expect(res2.statusCode).toBe(200);

    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter2.balance)).toBe(beforeBalance + 450);
  });
});
