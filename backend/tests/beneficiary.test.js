const request = require('supertest');
const app = require('../server');
const { sequelize, connectDB } = require('../config/db');
const User = require('../models/User');
const Beneficiary = require('../models/Beneficiary');

describe('Beneficiary Endpoints', () => {
  let token;
  let userId;

  beforeAll(async () => {
    await connectDB();
    // Create a test user
    const testUser = {
      name: 'Beneficiary Test User',
      email: `beneficiary${Date.now()}@test.com`,
      password: 'password123',
      phone: `070${Date.now().toString().slice(-8)}`
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    token = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    if (userId) {
        await Beneficiary.destroy({ where: { userId } });
        await User.destroy({ where: { id: userId } });
    }
    await sequelize.close();
  });

  it('POST /api/beneficiaries - should create a new beneficiary', async () => {
    const res = await request(app)
      .post('/api/beneficiaries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mom',
        phoneNumber: '08012345678',
        network: 'MTN'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toEqual('Mom');
  });

  it('GET /api/beneficiaries - should get user beneficiaries', async () => {
    const res = await request(app)
      .get('/api/beneficiaries')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].name).toEqual('Mom');
  });

  it('DELETE /api/beneficiaries/:id - should delete beneficiary', async () => {
    // Get the beneficiary first
    const listRes = await request(app)
        .get('/api/beneficiaries')
        .set('Authorization', `Bearer ${token}`);
    
    const beneficiaryId = listRes.body[0].id;

    const res = await request(app)
      .delete(`/api/beneficiaries/${beneficiaryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Beneficiary removed');
  });
});
