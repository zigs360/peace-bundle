const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');
const virtualAccountService = require('../services/virtualAccountService');
const payvesselService = require('../services/payvesselService');
const notificationRealtimeService = require('../services/notificationRealtimeService');

const treasuryService = require('../services/treasuryService');

describe('Virtual Account Instant Funding & NUBAN Variations', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.BILLSTACK_WEBHOOK_SECRET = 'test_billstack_secret';
    process.env.PAYVESSEL_SECRET_KEY = 'test_payvessel_secret';
    jest.spyOn(notificationRealtimeService, 'sendToUser').mockResolvedValue({});
    jest.spyOn(treasuryService, 'scheduleAutoSync').mockResolvedValue();
    jest.spyOn(treasuryService, 'runAutoSync').mockResolvedValue();
  });

  afterEach(async () => {
    delete process.env.MOCK_BVN_ALLOWED;
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('resolves user by 9-digit NUBAN when DB has 10-digit with leading zero and vice-versa', async () => {
    const paddedAcc = '0812345678';
    const unpaddedAcc = '812345678';

    const user = await User.create({
      name: 'Nuban User',
      email: `nuban_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: paddedAcc,
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Nuban User',
    });

    // 1. Finding with unpadded 9-digit should find the user
    const foundByUnpadded = await virtualAccountService.findUserByAccountNumber(unpaddedAcc);
    expect(foundByUnpadded).toBeTruthy();
    expect(foundByUnpadded.id).toBe(user.id);

    // 2. Finding with padded 10-digit should find the user
    const foundByPadded = await virtualAccountService.findUserByAccountNumber(paddedAcc);
    expect(foundByPadded).toBeTruthy();
    expect(foundByPadded.id).toBe(user.id);

    // 3. Finding with formatting (spaces/dashes)
    const foundByFormatted = await virtualAccountService.findUserByAccountNumber(' 081-234-5678 ');
    expect(foundByFormatted).toBeTruthy();
    expect(foundByFormatted.id).toBe(user.id);
  });

  it('resolves user when account is stored under dual_virtual_accounts.accounts.palmpay or 9psb', async () => {
    const palmPayAcc = '9911223344';
    const ninePsbAcc = '8811223344';

    const user = await User.create({
      name: 'Dual VA User',
      email: `dual_va_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: '1100223344',
      virtual_account_bank: 'PROVIDUS',
      virtual_account_name: 'Dual VA User',
      metadata: {
        dual_virtual_accounts: {
          accounts: {
            palmpay: {
              accountNumber: palmPayAcc,
              bankName: 'PALMPAY',
              accountName: 'Dual VA User',
            },
            '9psb': {
              accountNumber: ninePsbAcc,
              bankName: '9PSB',
              accountName: 'Dual VA User',
            },
          },
        },
      },
    });

    const foundPalmPay = await virtualAccountService.findUserByAccountNumber(palmPayAcc);
    expect(foundPalmPay).toBeTruthy();
    expect(foundPalmPay.id).toBe(user.id);

    const found9psb = await virtualAccountService.findUserByAccountNumber(ninePsbAcc);
    expect(found9psb).toBeTruthy();
    expect(found9psb.id).toBe(user.id);
  });

  it('credits wallet via PayVessel webhook using account ownership fallback when signature is omitted', async () => {
    const accNum = `98${Date.now().toString().slice(-8)}`;
    const user = await User.create({
      name: 'PV Ownership User',
      email: `pv_owner_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: accNum,
      virtual_account_bank: '9PSB',
      virtual_account_name: 'PV Ownership User',
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const reference = `PV-OWN-${Date.now()}`;
    const payload = {
      order: {
        reference,
        amount: 3000,
        settlement_amount: 3000,
        currency: 'NGN',
        settlement_account: accNum,
        description: 'Bank transfer credit',
      },
      customer: {
        email: 'some_unrelated_payer@bank.com', // different email
      },
    };

    // Send WITHOUT signature header
    const res = await request(app)
      .post('/api/webhooks/payvessel')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(initialBalance + 3000);

    const txn = await Transaction.findOne({ where: { reference } });
    expect(txn).toBeTruthy();
    expect(parseFloat(txn.amount)).toBe(3000);
  });

  it('credits wallet via Monnify webhook by matching destination virtual account number', async () => {
    const monnifyAcc = `55${Date.now().toString().slice(-8)}`;
    const user = await User.create({
      name: 'Monnify VA User',
      email: `monnify_va_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: monnifyAcc,
      virtual_account_bank: 'WEMA',
      virtual_account_name: 'Monnify VA User',
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const reference = `MNFY-REF-${Date.now()}`;
    const payload = {
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: reference,
        paymentStatus: 'PAID',
        amountPaid: 4500,
        currencyCode: 'NGN',
        destinationAccountInformation: {
          accountNumber: monnifyAcc,
          bankCode: '035',
        },
        customerDTO: {
          email: 'payer_different@otherbank.ng', // does not match user.email
          name: 'Transfer Payer',
        },
      },
    };

    const res = await request(app)
      .post('/api/webhooks/monnify')
      .send(payload);

    expect(res.statusCode).toBe(200);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(initialBalance + 4500);

    const txn = await Transaction.findOne({ where: { reference } });
    expect(txn).toBeTruthy();
    expect(parseFloat(txn.amount)).toBe(4500);
  });

  it('credits wallet via BillStack webhook when account number has missing leading zero in payload', async () => {
    const randDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    const paddedAcc = `0${randDigits}`;
    const unpaddedAcc = randDigits;

    const user = await User.create({
      name: 'Billstack Zero User',
      email: `bs_zero_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`,
      phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'password123',
      virtual_account_number: paddedAcc,
      virtual_account_bank: 'PALMPAY',
      virtual_account_name: 'Billstack Zero User',
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const initialBalance = parseFloat(wallet.balance);

    const reference = `BS-ZERO-${Date.now()}`;
    const payload = {
      event: 'COLLECTION.SUCCESS',
      data: {
        type: 'RESERVED_ACCOUNT_TRANSACTION',
        reference,
        amount: 2000,
        wiaxy_ref: `WIAXY-ZERO-${Date.now()}`,
        virtual_account: {
          account_number: unpaddedAcc, // Unpadded!
          bank_name: 'PALMPAY',
        },
      },
    };

    const signature = crypto.createHash('md5').update('test_billstack_secret').digest('hex');

    const res = await request(app)
      .post('/api/webhooks/billstack')
      .set('x-billstack-signature', signature)
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(initialBalance + 2000);
  });
});
