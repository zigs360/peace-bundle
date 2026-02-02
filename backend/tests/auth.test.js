const request = require('supertest');
const app = require('../server');
const { sequelize, connectDB } = require('../config/db');
const { Op } = require('sequelize');
const User = require('../models/User');

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  afterEach(async () => {
    // Clean up users created during tests
    await User.destroy({ where: { email: { [Op.like]: '%@test.com' } } });
  });

  const testUser = {
    name: 'Test User',
    email: `test${Date.now()}@test.com`,
    password: 'password123',
    phone: `080${Date.now().toString().slice(-8)}`
  };

  let token;

  it('POST /api/auth/register - should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', testUser.email);
    token = res.body.token; // Save token for later if needed
  });

  it('POST /api/auth/login - should login user and return token', async () => {
    // Register first (or rely on previous test, but better to be independent or sequential)
    // Since we cleanup afterEach, we need to register again or use beforeAll for setup.
    // Let's just register a fresh user for this test.
    
    const loginUser = {
      name: 'Login User',
      email: `login${Date.now()}@test.com`,
      password: 'password123',
      phone: `081${Date.now().toString().slice(-8)}`
    };

    await request(app).post('/api/auth/register').send(loginUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrPhone: loginUser.email,
        password: loginUser.password
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });

  it('GET /api/auth/me - should return user profile', async () => {
    // Create user and get token
    const meUser = {
      name: 'Me User',
      email: `me${Date.now()}@test.com`,
      password: 'password123',
      phone: `082${Date.now().toString().slice(-8)}`
    };

    const regRes = await request(app).post('/api/auth/register').send(meUser);
    const userToken = regRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('email', meUser.email);
  });

  it('POST /api/auth/login - should fail with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrPhone: 'nonexistent@test.com',
        password: 'wrongpassword'
      });

    expect(res.statusCode).toEqual(400); // Should be 400 as per controller implementation for invalid creds
  });
});
