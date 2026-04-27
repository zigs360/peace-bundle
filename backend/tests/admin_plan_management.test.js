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
        [Op.or]: [
          { email: { [Op.like]: 'plans-admin-%@test.com' } },
          { email: { [Op.like]: 'plans-user-%@test.com' } },
        ],
      },
      force: true,
    });
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

  it('imports plans from an uploaded csv file', async () => {
    const csv = [
      'Plan Name,Plan ID,Validity,Teleco Price,Our Price,Wallet Price,Network,Source,Service Name,Category Name,Subcategory Name',
      '2GB [GIFTING],30002,7 Days,900,855,880,Airtel,ogdams,Data Plans,Gifting Plans,Weekly Plans',
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/plans/import')
      .set('Authorization', `Bearer ${token}`)
      .field('dryRun', 'false')
      .attach('file', Buffer.from(csv, 'utf8'), 'airtel-plans.csv');

    expect(res.statusCode).toBe(200);
    expect(res.body.summary.created).toBe(1);

    const imported = await DataPlan.findOne({
      where: {
        provider: 'airtel',
        plan_id: '30002',
      },
    });
    expect(imported).toBeTruthy();
    expect(imported.source).toBe('ogdams');
    expect(Number(imported.your_price)).toBe(855);
    expect(Number(imported.wallet_price)).toBe(880);
    expect(imported.service_name).toBe('Data Plans');
    expect(imported.category_name).toBe('Gifting Plans');
    expect(imported.subcategory_name).toBe('Weekly Plans');
  });

  it('rejects plan deletion for non-admin users', async () => {
    const unique = `${Date.now()}-user`;
    const user = await User.create({
      name: 'Plans User',
      email: `plans-user-${unique}@test.com`,
      password: 'password123',
      phone: `0804${String(Date.now()).slice(-7)}`,
      role: 'user',
    });
    const userToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const plan = await DataPlan.create({
      source: 'smeplug',
      provider: 'mtn',
      category: 'gifting',
      name: 'Restricted delete plan',
      size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      data_size: '1GB',
      plan_id: '40101',
      original_price: 500,
      your_price: 480,
      wallet_price: 490,
      admin_price: 480,
      api_cost: 490,
      is_active: true,
    });

    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'Should be blocked' });

    expect(res.statusCode).toBe(403);
    const existing = await DataPlan.findByPk(plan.id);
    expect(existing).toBeTruthy();
    expect(await PlanDeletionAudit.count()).toBe(0);
  });

  it('hard deletes unreferenced plans and cascades dependent pricing data', async () => {
    const plan = await DataPlan.create({
      source: 'smeplug',
      provider: 'airtel',
      category: 'gifting',
      name: 'Disposable plan',
      size: '2GB',
      size_mb: 2048,
      validity: '2 Days',
      data_size: '2GB',
      plan_id: '50101',
      original_price: 900,
      your_price: 860,
      wallet_price: 880,
      admin_price: 860,
      api_cost: 880,
      is_active: true,
    });

    await ResellerPlanPricing.create({ dataPlanId: plan.id, custom_price: 845 });
    const tier = await PricingTier.create({ name: `Tier ${Date.now()}` });
    await PricingRule.create({
      tierId: tier.id,
      product_type: 'data',
      provider: 'airtel',
      dataPlanId: plan.id,
      markup_percent: 5,
      is_active: true,
    });
    await PlanPriceHistory.create({
      planIdRef: plan.id,
      field_name: 'your_price',
      old_value: '850',
      new_value: '860',
      changed_by: 'seed@test.com',
      reason: 'Seed history',
    });

    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Product cleanup' });

    expect(res.statusCode).toBe(200);
    expect(res.body.deletionMode).toBe('hard');

    const deletedPlan = await DataPlan.findByPk(plan.id, { paranoid: false });
    expect(deletedPlan).toBeNull();
    expect(await ResellerPlanPricing.count({ where: { dataPlanId: plan.id } })).toBe(0);
    expect(await PlanPriceHistory.count({ where: { planIdRef: plan.id } })).toBe(0);
    expect(await PricingRule.count({ where: { dataPlanId: plan.id } })).toBe(0);

    const audit = await PlanDeletionAudit.findOne({ where: { planIdRef: plan.id } });
    expect(audit).toBeTruthy();
    expect(audit.deletion_mode).toBe('hard');
    expect(audit.reason).toBe('Product cleanup');
    expect(audit.related_counts.pricingRuleCount).toBe(1);
  });

  it('soft deletes referenced plans and preserves billing history', async () => {
    const unique = `${Date.now()}-txn`;
    const plan = await DataPlan.create({
      source: 'ogdams',
      provider: 'glo',
      category: 'gifting',
      name: 'Referenced plan',
      size: '1.5GB',
      size_mb: 1536,
      validity: '7 Days',
      data_size: '1.5GB',
      plan_id: '60101',
      original_price: 700,
      your_price: 670,
      wallet_price: 690,
      admin_price: 670,
      api_cost: 690,
      is_active: true,
      available_sim: true,
      available_wallet: true,
    });

    await Transaction.create({
      type: 'debit',
      amount: 690,
      balance_before: 2000,
      balance_after: 1310,
      source: 'data_purchase',
      provider: 'glo',
      reference: `txn-${unique}`,
      status: 'completed',
      dataPlanId: plan.id,
    });
    const tier = await PricingTier.create({ name: `Tier ${Date.now()} soft` });
    await PricingRule.create({
      tierId: tier.id,
      product_type: 'data',
      provider: 'glo',
      dataPlanId: plan.id,
      markup_percent: 7.5,
      is_active: true,
    });

    const res = await request(app)
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Retire but retain history' });

    expect(res.statusCode).toBe(200);
    expect(res.body.deletionMode).toBe('soft');

    const softDeletedPlan = await DataPlan.findByPk(plan.id, { paranoid: false });
    expect(softDeletedPlan).toBeTruthy();
    expect(softDeletedPlan.deletedAt).toBeTruthy();
    expect(softDeletedPlan.is_active).toBe(false);
    expect(softDeletedPlan.available_sim).toBe(false);
    expect(softDeletedPlan.available_wallet).toBe(false);
    expect(softDeletedPlan.deletion_reason).toBe('Retire but retain history');

    expect(await Transaction.count({ where: { dataPlanId: plan.id } })).toBe(1);
    const retainedRule = await PricingRule.findOne({ where: { dataPlanId: plan.id } });
    expect(retainedRule).toBeTruthy();
    expect(retainedRule.is_active).toBe(false);
    expect(retainedRule.ends_at).toBeTruthy();

    const audit = await PlanDeletionAudit.findOne({ where: { planIdRef: plan.id } });
    expect(audit).toBeTruthy();
    expect(audit.deletion_mode).toBe('soft');
    expect(audit.related_counts.transactionCount).toBe(1);
    expect(audit.related_counts.pricingRuleCount).toBe(1);
  });
});
