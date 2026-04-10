const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../services/ogdamsService', () => ({
  purchaseData: jest.fn(),
  checkTransactionStatus: jest.fn(),
}));

const ogdamsService = require('../services/ogdamsService');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const Sim = require('../models/Sim');
const DataPlan = require('../models/DataPlan');
const AdminOgdamsDataPurchase = require('../models/AdminOgdamsDataPurchase');

describe('Admin Ogdams data purchase', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    process.env.OGDAMS_DATA_VERIFY_DELAY_MS = '10';
    process.env.OGDAMS_DATA_VERIFY_MAX_ATTEMPTS = '2';
  });

  beforeEach(async () => {
    await AdminOgdamsDataPurchase.destroy({ where: {} });
    ogdamsService.purchaseData.mockReset();
    ogdamsService.checkTransactionStatus.mockReset();
  });

  it('creates a purchase, reserves sim funds, and completes after verification', async () => {
    ogdamsService.purchaseData.mockResolvedValue({ status: 'success', reference: 'OGD-REF-1' });
    ogdamsService.checkTransactionStatus.mockResolvedValue({ status: 'success' });

    const adminUser = await User.create({
      name: 'Admin',
      email: `admin_${Date.now()}@test.com`,
      phone: `0901${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });
    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const targetUser = await User.create({
      name: 'Target',
      email: `target_${Date.now()}@test.com`,
      phone: `0902${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const sim = await Sim.create({
      userId: adminUser.id,
      phoneNumber: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      provider: 'mtn',
      type: 'sim_system',
      status: 'active',
      connectionStatus: 'connected',
      airtimeBalance: 1000,
      reservedAirtime: 0,
      iccid: '12345678901234567890',
    });

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 200,
      is_active: true,
      ogdams_sku: 'OGD-1GB',
    });

    const res = await request(app)
      .post('/api/admin/ogdams/data-purchase')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({
        userId: targetUser.id,
        recipientPhone: targetUser.phone,
        dataPlanId: plan.id,
        simId: sim.id,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference).toBeDefined();
    expect(ogdamsService.purchaseData).toHaveBeenCalled();

    const updatedSim = await Sim.findByPk(sim.id);
    expect(Number(updatedSim.airtimeBalance)).toBe(800);
    expect(Number(updatedSim.reservedAirtime)).toBe(0);

    await new Promise((r) => setTimeout(r, 50));
    const p = await AdminOgdamsDataPurchase.findOne({ where: { reference: res.body.data.reference } });
    expect(p.status).toBe('completed');
  });

  it('rejects if sim available balance is insufficient', async () => {
    ogdamsService.purchaseData.mockResolvedValue({ status: 'success', reference: 'OGD-REF-2' });

    const adminUser = await User.create({
      name: 'Admin2',
      email: `admin2_${Date.now()}@test.com`,
      phone: `0903${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });
    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const targetUser = await User.create({
      name: 'Target2',
      email: `target2_${Date.now()}@test.com`,
      phone: `0904${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const sim = await Sim.create({
      userId: adminUser.id,
      phoneNumber: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      provider: 'mtn',
      type: 'sim_system',
      status: 'active',
      connectionStatus: 'connected',
      airtimeBalance: 100,
      reservedAirtime: 0,
    });

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 200,
      is_active: true,
      ogdams_sku: 'OGD-1GB',
    });

    const res = await request(app)
      .post('/api/admin/ogdams/data-purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: targetUser.id,
        recipientPhone: targetUser.phone,
        dataPlanId: plan.id,
        simId: sim.id,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message).toLowerCase()).toContain('insufficient');
  });

  it('rolls back reservation if provider fails', async () => {
    ogdamsService.purchaseData.mockRejectedValue(new Error('provider down'));

    const adminUser = await User.create({
      name: 'Admin3',
      email: `admin3_${Date.now()}@test.com`,
      phone: `0905${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });
    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const targetUser = await User.create({
      name: 'Target3',
      email: `target3_${Date.now()}@test.com`,
      phone: `0906${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const sim = await Sim.create({
      userId: adminUser.id,
      phoneNumber: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      provider: 'mtn',
      type: 'sim_system',
      status: 'active',
      connectionStatus: 'connected',
      airtimeBalance: 1000,
      reservedAirtime: 0,
    });

    const plan = await DataPlan.create({
      provider: 'mtn',
      category: 'sme',
      name: '1GB',
      size: '1GB',
      size_mb: 1024,
      validity: '30 days',
      admin_price: 100,
      api_cost: 200,
      is_active: true,
      ogdams_sku: 'OGD-1GB',
    });

    const res = await request(app)
      .post('/api/admin/ogdams/data-purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: targetUser.id,
        recipientPhone: targetUser.phone,
        dataPlanId: plan.id,
        simId: sim.id,
      });

    expect(res.statusCode).toBe(502);

    const updatedSim = await Sim.findByPk(sim.id);
    expect(Number(updatedSim.airtimeBalance)).toBe(1000);
    expect(Number(updatedSim.reservedAirtime)).toBe(0);
  });
});
