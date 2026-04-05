const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, Transaction, WalletTransaction } = require('../config/db');

describe('Admin Reports Stats', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('GET /api/reports/stats returns data for admin user', async () => {
    const email = `admin-${Date.now()}@test.com`;
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Admin Tester',
      email,
      password: 'password123',
      phone: `080${Date.now().toString().slice(-8)}`,
    });
    expect(regRes.statusCode).toBe(201);
    const token = regRes.body.token;
    expect(token).toBeTruthy();

    const user = await User.findOne({ where: { email } });
    await user.update({ role: 'admin' });

    const res = await request(app)
      .get('/api/reports/stats?timeRange=7d')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('totalTransactions');
    expect(res.body).toHaveProperty('successRate');
    expect(res.body).toHaveProperty('totalVolume');
    expect(res.body).toHaveProperty('totalProfit');
    expect(res.body).toHaveProperty('activeUsers');
    expect(res.body).toHaveProperty('avgResponseTime');
  });
});

