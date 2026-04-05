const request = require('supertest');
const app = require('../server');
const { connectDB, User, Wallet, WalletTransaction, Transaction, DataPlan } = require('../config/db');
const { Op } = require('sequelize');
const smeplugService = require('../services/smeplugService');

describe('Data purchase endpoint', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await DataPlan.destroy({ where: {}, force: true });
    await User.destroy({ where: { email: { [Op.like]: '%@test.com' } }, force: true });
  });

  it('POST /api/users/data/purchase calls SMEPlug with correct signature', async () => {
    const email = `data-${Date.now()}@test.com`;
    const phone = `080${Date.now().toString().slice(-8)}`;

    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Data Buyer',
      email,
      password: 'password123',
      phone,
    });
    expect(regRes.statusCode).toBe(201);
    const token = regRes.body.token;
    expect(token).toBeTruthy();

    const user = await User.findOne({ where: { email } });
    expect(user).toBeTruthy();

    const [wallet] = await Wallet.findOrCreate({ where: { userId: user.id }, defaults: { balance: 0 } });
    await wallet.update({ balance: 2000 });

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB Test Plan',
      size: '1GB',
      size_mb: 1024,
      validity: '30 Days',
      admin_price: 300,
      api_cost: 250,
      is_active: true,
      smeplug_plan_id: 'MTN_1GB',
    });

    const res = await request(app)
      .post('/api/users/data/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan_id: plan.id, recipient_phone: '08100000000' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.status).toBe('completed');

    expect(smeplugService.purchaseData).toHaveBeenCalled();
    const lastCall = smeplugService.purchaseData.mock.calls.at(-1);
    expect(lastCall[0]).toBe('mtn');
    expect(lastCall[1]).toBe('08100000000');
    expect(lastCall[2]).toBe('MTN_1GB');
    expect(lastCall[3]).toBe('wallet');
    expect(lastCall[4]).toEqual({});
  });
});
