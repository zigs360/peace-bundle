const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const DataPlan = require('../models/DataPlan');
const PlanPriceHistory = require('../models/PlanPriceHistory');
const Wallet = require('../models/Wallet');

describe('Admin plan management', () => {
  let token;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    const unique = Date.now();
    const admin = await User.create({
      name: 'Plans Admin',
      email: `plans-admin-${unique}@test.com`,
      password: 'password123',
      phone: `0803${String(unique).slice(-7)}`,
      role: 'admin',
    });
    token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterEach(async () => {
    await PlanPriceHistory.destroy({ where: {}, force: true });
    await DataPlan.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: { email: { [require('sequelize').Op.like]: 'plans-admin-%@test.com' } }, force: true });
  });

  it('updates a plan and writes audit history entries', async () => {
    const plan = await DataPlan.create({
      source: 'smeplug',
      provider: 'mtn',
      category: 'gifting',
      name: '1GB [GIFTING]',
      size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      data_size: '1GB',
      plan_id: '20002',
      original_price: 500,
      your_price: 475,
      wallet_price: 495,
      admin_price: 475,
      api_cost: 495,
      available_sim: true,
      available_wallet: true,
      is_active: true,
    });

    const res = await request(app)
      .put(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        your_price: 490,
        wallet_price: 510,
        available_wallet: false,
        reason: 'Vendor adjustment',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.item.your_price).toBe(490);
    expect(res.body.item.wallet_price).toBe(510);
    expect(res.body.item.available_wallet).toBe(false);

    const history = await PlanPriceHistory.findAll({
      where: { planIdRef: plan.id },
      order: [['changed_at', 'ASC']],
    });
    expect(history.map((row) => row.field_name)).toEqual(['your_price', 'wallet_price', 'available_wallet']);
    expect(history[0].reason).toBe('Vendor adjustment');
  });

  it('previews and applies a bulk update for filtered plans', async () => {
    await DataPlan.bulkCreate([
      {
        source: 'ogdams',
        provider: 'mtn',
        category: 'gifting',
        name: '500MB [GIFTING]',
        size: '500MB',
        size_mb: 500,
        validity: '1 Day',
        data_size: '500MB',
        plan_id: '20001',
        original_price: 300,
        your_price: 285,
        wallet_price: 300,
        admin_price: 285,
        api_cost: 300,
        is_active: true,
      },
      {
        source: 'ogdams',
        provider: 'mtn',
        category: 'gifting',
        name: '1GB [GIFTING]',
        size: '1GB',
        size_mb: 1024,
        validity: '1 Day',
        data_size: '1GB',
        plan_id: '20002',
        original_price: 500,
        your_price: 475,
        wallet_price: 495,
        admin_price: 475,
        api_cost: 495,
        is_active: true,
      },
    ]);

    const preview = await request(app)
      .post('/api/admin/plans/bulk-update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filters: { source: 'ogdams', network: 'mtn' },
        operation: 'increase_percentage',
        field: 'your_price',
        value: 10,
        preview: true,
        reason: 'Quarterly adjustment',
      });

    expect(preview.statusCode).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.count).toBe(2);

    const apply = await request(app)
      .post('/api/admin/plans/bulk-update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filters: { source: 'ogdams', network: 'mtn' },
        operation: 'increase_percentage',
        field: 'your_price',
        value: 10,
        reason: 'Quarterly adjustment',
      });

    expect(apply.statusCode).toBe(200);
    expect(apply.body.count).toBe(2);

    const updated = await DataPlan.findAll({ where: { source: 'ogdams', provider: 'mtn' }, order: [['plan_id', 'ASC']] });
    expect(Number(updated[0].your_price)).toBeCloseTo(313.5, 2);
    expect(Number(updated[1].your_price)).toBeCloseTo(522.5, 2);

    const historyCount = await PlanPriceHistory.count({ where: { reason: 'Quarterly adjustment' } });
    expect(historyCount).toBe(2);
  });
});
