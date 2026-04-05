const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, WalletTransaction } = require('../config/db');

describe('Admin Bulk SMS History', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('GET /api/admin/bulk-sms returns history and user details for admin', async () => {
    const email = `admin-sms-${Date.now()}@test.com`;
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Admin SMS Tester',
      email,
      password: 'password123',
      phone: `080${Date.now().toString().slice(-8)}`,
    });
    expect(regRes.statusCode).toBe(201);
    const token = regRes.body.token;
    expect(token).toBeTruthy();

    const user = await User.findOne({ where: { email } });
    await user.update({ role: 'admin' });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await Transaction.create({
      userId: user.id,
      walletId: wallet.id,
      type: 'debit',
      amount: 50,
      balance_before: 100,
      balance_after: 50,
      source: 'bulk_sms_payment',
      reference: `BULK-${Date.now()}`,
      status: 'completed',
      description: 'Admin bulk SMS',
      metadata: { recipients: 2 },
    });

    const res = await request(app)
      .get('/api/admin/bulk-sms?page=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);

    const first = res.body.history[0];
    expect(first.User || first.user).toBeTruthy();
    const u = first.User || first.user;
    expect(u.email).toBe(email);
  });
});

