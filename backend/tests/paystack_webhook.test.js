const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');

describe('Paystack webhook', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.PAYSTACK_SECRET_KEY = 'test_paystack_secret';
    process.env.FUNDING_FLAT_FEE_NGN = '50';
  });

  it('credits wallet by customer email and is idempotent by reference', async () => {
    const user = await User.create({
      name: 'Paystack User',
      email: `paystack_${Date.now()}@test.com`,
      phone: '08011007711',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
    const beforeBalance = parseFloat(walletBefore.balance);

    const reference = `PS-${Date.now()}`;
    const payload = {
      event: 'charge.success',
      data: {
        reference,
        amount: 50000,
        currency: 'NGN',
        status: 'success',
        customer: { email: user.email },
      },
    };

    const signature = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res1 = await request(app).post('/api/webhooks/paystack').set('x-paystack-signature', signature).send(payload);
    expect(res1.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(beforeBalance + 450);

    const txn = await Transaction.findOne({ where: { reference } });
    expect(txn).toBeTruthy();

    const res2 = await request(app).post('/api/webhooks/paystack').set('x-paystack-signature', signature).send(payload);
    expect(res2.statusCode).toBe(200);

    const walletAfter2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter2.balance)).toBe(beforeBalance + 450);
  });
});
