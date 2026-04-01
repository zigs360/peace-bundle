const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const { Wallet, Notification } = require('../models');

describe('Virtual account pipeline', () => {
  beforeAll(async () => {
    await connectDB();
    const notificationService = require('../services/notificationService');
    if (notificationService.sendTransactionNotification && typeof notificationService.sendTransactionNotification.mockRestore === 'function') {
      notificationService.sendTransactionNotification.mockRestore();
    }
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'local', 'string', 'api');
    await SystemSetting.set('local_virtual_account_prefix', '901', 'string', 'api');
    await SystemSetting.set('local_virtual_account_bank', 'Peace Bundlle', 'string', 'api');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('marks new users as pending and auto-creates wallet', async () => {
    const user = await User.create({
      name: 'Pipeline User',
      email: `pipeline_${Date.now()}@test.com`,
      phone: '08011009900',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const updated = await User.findByPk(user.id);
    expect(updated.metadata.va_status).toBe('pending');

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(wallet).toBeTruthy();
  });

  it('allows requesting a local virtual account without BVN and creates an in-app notification', async () => {
    const user = await User.create({
      name: 'Pipeline User 2',
      email: `pipeline2_${Date.now()}@test.com`,
      phone: '08011009901',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const res = await request(app).post('/api/users/virtual-account/request').set('Authorization', `Bearer ${token}`).send({});

    expect(res.statusCode).toBe(200);

    const updated = await User.findByPk(user.id);
    expect(updated.virtual_account_number).toBeTruthy();

    const notif = await Notification.findOne({ where: { userId: user.id, title: 'Virtual account activated' } });
    expect(notif).toBeTruthy();
  });
});
