const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const billStackService = require('../services/billStackService');

describe('Bill payments provider integration', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
    await SystemSetting.set('bill_payment_provider', 'billstack', 'string', 'api');
  });

  it('validate-customer uses BillStack when configured', async () => {
    jest.spyOn(billStackService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(billStackService, 'validateCableCustomer').mockResolvedValue({
      success: true,
      data: { customer_name: 'Test Customer' },
    });

    const user = await User.create({
      name: 'Bill User',
      email: `bill_user_${Date.now()}@test.com`,
      phone: '08011008800',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/api/transactions/validate-customer')
      .set('Authorization', `Bearer ${token}`)
      .query({ billType: 'cable', provider: 'DSTV', account: '1234567890' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.name).toBe('Test Customer');
  });

  it('bill payment debits wallet and saves provider response on success', async () => {
    jest.spyOn(billStackService, 'isConfigured').mockReturnValue(true);
    jest.spyOn(billStackService, 'payCable').mockResolvedValue({
      success: true,
      data: { reference: 'BILLSTACK-REF-1', status: 'success' },
    });

    const user = await User.create({
      name: 'Bill Pay User',
      email: `bill_pay_${Date.now()}@test.com`,
      phone: '08011008801',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    await walletService.credit(user, 2000, 'funding', 'Seed', {}, null);

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/transactions/bill')
      .set('Authorization', `Bearer ${token}`)
      .send({
        billType: 'cable',
        provider: 'DSTV',
        smartCardNumber: '1234567890',
        amount: 500,
        phone: '08011008801',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.smeplug_response).toBeTruthy();
    expect(res.body.transaction.smeplug_reference).toBe('BILLSTACK-REF-1');
  });
});

