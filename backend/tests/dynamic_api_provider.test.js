const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const ApiProvider = require('../models/ApiProvider');
const dynamicProviderService = require('../services/dynamicProviderService');

describe('Dynamic API Provider Orchestration', () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('password123', salt);

    const admin = await User.create({
      name: 'Admin Provider Test',
      email: `admin_prov_${Date.now()}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role: 'admin',
      account_status: 'active',
    });
    adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const regularUser = await User.create({
      name: 'Regular User',
      email: `reg_prov_${Date.now()}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role: 'user',
      account_status: 'active',
    });
    userToken = jwt.sign({ id: regularUser.id }, process.env.JWT_SECRET);
  });

  it('blocks non-admin users from accessing provider configuration', async () => {
    const res = await request(app)
      .get('/api/admin/providers')
      .set('Authorization', `Bearer ${userToken}`);

    expect([401, 403]).toContain(res.statusCode);
  });

  it('lists default providers and seeds them if missing', async () => {
    const res = await request(app)
      .get('/api/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(1);
  });

  it('creates a new custom provider (QuicklySIM) with endpoints and capabilities', async () => {
    const newProviderPayload = {
      name: 'QuicklySIM Test Provider',
      slug: `quicklysim_test_${Date.now()}`,
      service_type: 'all',
      base_url: 'https://www.quicklysim.com/api',
      api_key: 'qsim_key_live_test',
      secret_key: 'qsim_secret_live_test',
      capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting', 'ussd'],
      endpoint_map: {
        devices: '/devices',
        data_purchase: '/data',
        airtime_purchase: '/airtime',
        balance: '/balance',
        ussd: '/devices/:id/ussd',
      },
      is_active: true,
      is_primary: false,
    };

    const res = await request(app)
      .post('/api/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newProviderPayload);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.provider.name).toBe('QuicklySIM Test Provider');
    expect(res.body.provider.capabilities).toContain('sim_hosting');

    const providerId = res.body.provider.id;

    // Now activate this provider as the primary active provider
    const activateRes = await request(app)
      .post(`/api/admin/providers/${providerId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.body.success).toBe(true);
    expect(activateRes.body.provider.is_primary).toBe(true);

    // Verify in database that it is the active primary provider
    const primary = await dynamicProviderService.getPrimaryProvider();
    expect(primary).toBeTruthy();
    expect(primary.id).toBe(providerId);

    // Update credentials
    const updateRes = await request(app)
      .put(`/api/admin/providers/${providerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ api_key: 'updated_qsim_key' });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.provider.api_key).toBe('updated_qsim_key');

    // Test sync-sims for QuicklySIM does not fail with 404 route /devices
    const syncRes = await request(app)
      .post(`/api/admin/providers/${providerId}/sync-sims`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(syncRes.statusCode).toBe(200);
    expect(syncRes.body.success).toBe(true);

    // Clean up
    const deleteRes = await request(app)
      .delete(`/api/admin/providers/${providerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });

  it('correctly populates dynamic providers in getPlanFilters and allows creating plans with dynamic provider source', async () => {
    const transactionIntegrityService = require('../services/transactionIntegrityService');
    const DataPlan = require('../models/DataPlan');

    // 1. Check getPlanFilters endpoint
    const filterRes = await request(app)
      .get('/api/admin/plans/filters')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(filterRes.statusCode).toBe(200);
    expect(filterRes.body.success).toBe(true);
    expect(filterRes.body.sources).toContain('quicklysim');

    // 2. Create plan with source = 'quicklysim'
    const planPayload = {
      name: 'QuicklySIM 1GB Test Plan',
      source: 'quicklysim',
      provider: 'mtn',
      plan_id: 'qsim_1gb_01',
      price: 250,
      admin_price: 250,
      api_cost: 210,
      validity: '30 Days',
      size: '1GB',
      data_size: '1GB',
      is_active: true,
      category: 'sme',
      category_name: 'SME',
    };

    const createPlanRes = await request(app)
      .post('/api/admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(planPayload);

    expect(createPlanRes.statusCode).toBe(201);
    expect(createPlanRes.body.success).toBe(true);
    expect(createPlanRes.body.plan.source).toBe('quicklysim');

    const createdPlan = await DataPlan.findByPk(createPlanRes.body.plan.id);
    expect(createdPlan.source).toBe('quicklysim');

    // 3. Test selectDataRoute routes to quicklysim_api
    const route = transactionIntegrityService.selectDataRoute({ plan: createdPlan });
    expect(route.fulfillmentRoute).toBe('quicklysim_api');
    expect(route.paymentChannel).toBe('quicklysim_wallet');

    // Cleanup plan
    await createdPlan.destroy();
  });

  it('sanitizes headers against trailing newlines or whitespace', () => {
    const providerWithDirtyKey = {
      name: 'Dirty Key Provider',
      slug: 'dirty_prov',
      base_url: 'https://api.example.com',
      api_key: 'my_secret_key_123\r\n',
      secret_key: 'secret_key_456\n',
    };

    const client = dynamicProviderService.getHttpClient(providerWithDirtyKey);
    expect(client.defaults.headers['Authorization']).toBe('Bearer my_secret_key_123');
    expect(client.defaults.headers['x-api-key']).toBe('my_secret_key_123');
    expect(client.defaults.headers['x-secret-key']).toBe('secret_key_456');
  });
});
