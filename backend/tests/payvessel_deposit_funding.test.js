const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction, VirtualAccount } = require('../models');
const payvesselService = require('../services/payvesselService');

describe('PayVessel Webhook Deposit Funding', () => {
  const secretKey = 'pv_secret_test_key_123';

  beforeAll(async () => {
    await connectDB();
    process.env.PAYVESSEL_SECRET_KEY = secretKey;
    payvesselService.secretKey = secretKey;
  });

  const makeUserWithVirtualAccount = async (accountNumber) => {
    const user = await User.create({
      name: 'PayVessel Test User',
      email: `pv_user_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      virtual_account_number: accountNumber || null,
      virtual_account_bank: accountNumber ? '9Payment Service Bank' : null,
      virtual_account_name: accountNumber ? 'PayVessel Test User' : null,
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (wallet) {
      await wallet.update({ balance: 1000 });
    }

    return user;
  };

  const signPayload = (payload) => {
    const raw = Buffer.from(JSON.stringify(payload));
    return crypto.createHmac('sha512', secretKey).update(raw).digest('hex');
  };

  it('credits user wallet matching by virtual settlement account number', async () => {
    const accNum = `99${Date.now().toString().slice(-8)}`;
    const user = await makeUserWithVirtualAccount(accNum);
    const reference = `PV-REF-ACC-${Date.now()}`;

    const payload = {
      order: {
        reference,
        amount: 2500,
        settlement_amount: 2450,
        fee: 50,
        currency: 'NGN',
        settlement_account: accNum,
        description: 'Bank transfer deposit',
      },
      customer: {
        email: 'different_email@somewhere.com', // different email, should resolve by account number!
        phone: '08000000000',
      },
    };

    const sig = signPayload(payload);

    const res = await request(app)
      .post('/api/webhooks/payvessel')
      .set('payvessel-http-signature', sig) // lowercase hyphenated header
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBe(3450); // 1000 + 2450 settlement amount

    const txn = await Transaction.findOne({ where: { reference } });
    expect(txn).toBeTruthy();
    expect(txn.metadata?.gateway).toBe('payvessel');
  });

  it('credits user wallet matching by case-insensitive email fallback', async () => {
    const user = await makeUserWithVirtualAccount(null);
    const reference = `PV-REF-EMAIL-${Date.now()}`;

    const payload = {
      order: {
        reference,
        amount: 5000,
        settlement_amount: 5000,
        currency: 'NGN',
      },
      customer: {
        email: user.email.toUpperCase(), // Uppercase to test case-insensitivity
      },
    };

    const sig = signPayload(payload);

    const res = await request(app)
      .post('/api/webhooks/payvessel')
      .set('x-payvessel-signature', sig)
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet.balance)).toBe(6000); // 1000 + 5000
  });

  it('rejects invalid signature with 400', async () => {
    const payload = {
      order: { reference: `PV-INVALID-${Date.now()}`, amount: 1000 },
      customer: { email: 'fake@example.com' },
    };

    const res = await request(app)
      .post('/api/webhooks/payvessel')
      .set('http_payvessel_http_signature', 'bad_signature_hash')
      .send(payload);

    expect(res.statusCode).toBe(400);
  });

  it('handles duplicate transaction reference idempotently without double-crediting', async () => {
    const accNum = `88${Date.now().toString().slice(-8)}`;
    const user = await makeUserWithVirtualAccount(accNum);
    const reference = `PV-REF-DUP-${Date.now()}`;

    const payload = {
      order: {
        reference,
        amount: 1500,
        settlement_amount: 1500,
        settlement_account: accNum,
      },
      customer: { email: user.email },
    };

    const sig = signPayload(payload);

    // First call
    const res1 = await request(app)
      .post('/api/webhooks/payvessel')
      .set('payvessel_http_signature', sig)
      .send(payload);
    expect(res1.statusCode).toBe(200);

    const wallet1 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet1.balance)).toBe(2500);

    // Duplicate call
    const res2 = await request(app)
      .post('/api/webhooks/payvessel')
      .set('payvessel_http_signature', sig)
      .send(payload);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.message).toContain('already exist');

    // Balance remains 2500 and is not double-credited
    const wallet2 = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(wallet2.balance)).toBe(2500);
  });
});
