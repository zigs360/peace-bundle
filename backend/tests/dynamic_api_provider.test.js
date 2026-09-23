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

    // Clean up
    const deleteRes = await request(app)
      .delete(`/api/admin/providers/${providerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });
});
