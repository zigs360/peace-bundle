const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const DataPlan = require('../models/DataPlan');
const PlanPriceHistory = require('../models/PlanPriceHistory');
const PlanDeletionAudit = require('../models/PlanDeletionAudit');
const Transaction = require('../models/Transaction');
const ResellerPlanPricing = require('../models/ResellerPlanPricing');
const PricingRule = require('../models/PricingRule');
const PricingTier = require('../models/PricingTier');
const Wallet = require('../models/Wallet');

describe('Admin Plan Creation & Instant Status Toggle', () => {
  let token;
  const jwtSecret = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    await connectDB();
  });

  beforeEach(async () => {
    const unique = Date.now();
    const admin = await User.create({
      name: 'Plan Test Admin',
      email: `plan-test-admin-${unique}@test.com`,
      password: 'password123',
      phone: `0803${String(unique).slice(-7)}`,
      role: 'admin',
    });
    token = jwt.sign({ id: admin.id }, jwtSecret, { expiresIn: '1h' });
  });

  afterEach(async () => {
    await PricingRule.destroy({ where: {}, force: true });
    await PricingTier.destroy({ where: {}, force: true });
    await Transaction.destroy({ where: {}, force: true });
    await ResellerPlanPricing.destroy({ where: {}, force: true });
    await PlanDeletionAudit.destroy({ where: {}, force: true });
    await PlanPriceHistory.destroy({ where: {}, force: true });
    await DataPlan.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({
      where: {
        email: { [Op.like]: 'plan-test-admin-%@test.com' },
      },
      force: true,
    });
  });

  it('successfully creates plan when user enters name: SME and size_mb: 2048 without data_size', async () => {
    // Exact scenario from user uploaded screenshot:
    // Category: Data Share, Plan ID: 336, Plan Name: SME, Size (MB): 2048, Validity: 30 Days
    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'smeplug',
        network: 'mtn',
        category: 'data_share',
        plan_id: '336',
        name: 'SME',
        size_mb: 2048,
        data_size: '',
        validity: '30 Days',
        original_price: '500',
        your_price: '550',
        wallet_price: '500',
        available_sim: true,
        available_wallet: true,
        is_active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.name).toBe('SME');
    expect(res.body.item.size).toBe('2GB');
    expect(res.body.item.data_size).toBe('2GB');
    expect(res.body.item.size_mb).toBe(2048);

    // Verify persisted in database
    const dbPlan = await DataPlan.findByPk(res.body.item.id);
    expect(dbPlan).not.toBeNull();
    expect(dbPlan.size).toBe('2GB');
    expect(dbPlan.size_mb).toBe(2048);
  });

  it('auto-computes size_mb and name when only data_size is provided', async () => {
    const res = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'quicklysim',
        network: 'glo',
        category: 'gifting',
        data_size: '5GB',
        name: '',
        validity: '30 Days',
        original_price: '1200',
        your_price: '1300',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.item.size).toBe('5GB');
    expect(res.body.item.size_mb).toBe(5120);
    expect(res.body.item.name).toBe('5GB GIFTING');
  });

  it('instantly toggles plan active status via PUT /api/admin/plans/:id/toggle-status', async () => {
    const plan = await DataPlan.create({
      source: 'smeplug',
      provider: 'airtel',
      category: 'corporate_gifting',
      name: '1GB Corporate Gifting',
      size: '1GB',
      size_mb: 1024,
      validity: '30 Days',
      is_active: true,
    });

    expect(plan.is_active).toBe(true);

    // Deactivate
    const resDeactivate = await request(app)
      .put(`/api/admin/plans/${plan.id}/toggle-status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(resDeactivate.status).toBe(200);
    expect(resDeactivate.body.success).toBe(true);
    expect(resDeactivate.body.item.is_active).toBe(false);

    // Verify in database
    await plan.reload();
    expect(plan.is_active).toBe(false);

    // Reactivate
    const resActivate = await request(app)
      .put(`/api/admin/plans/${plan.id}/toggle-status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: true });

    expect(resActivate.status).toBe(200);
    expect(resActivate.body.success).toBe(true);
    expect(resActivate.body.item.is_active).toBe(true);

    await plan.reload();
    expect(plan.is_active).toBe(true);
  });
});
