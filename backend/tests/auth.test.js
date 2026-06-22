const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { sequelize, connectDB } = require('../config/db');
const { Op } = require('sequelize');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    await connectDB();
  });

  afterAll(async () => {
    // await sequelize.close();
  });

  afterEach(async () => {
    // Clean up users created during tests
    await User.destroy({ where: { email: { [Op.like]: '%@test.com' } } });
  });

  const testUser = {
    name: 'Al-Amin',
    email: `al-amin${Date.now()}@test.com`,
    password: 'password123',
    phone: `080${Date.now().toString().slice(-8)}`
  };
  it('POST /api/auth/register - should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.statusCode).toEqual(201);
    expect(Array.isArray(res.headers['set-cookie'])).toBe(true);
    expect(res.headers['set-cookie'].some((value) => value.includes('pb_access_token='))).toBe(true);
    expect(res.headers['set-cookie'].some((value) => value.includes('pb_refresh_token='))).toBe(true);
    expect(res.body.user).toHaveProperty('email', testUser.email);
  });

  it('POST /api/auth/login - should login user and set auth cookies', async () => {
    // Register first (or rely on previous test, but better to be independent or sequential)
    // Since we cleanup afterEach, we need to register again or use beforeAll for setup.
    // Let's just register a fresh user for this test.
    
    const loginUser = {
      name: 'Al-Amin Login',
      email: `al-amin-login${Date.now()}@test.com`,
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
    expect(Array.isArray(res.headers['set-cookie'])).toBe(true);
    expect(res.headers['set-cookie'].some((value) => value.includes('pb_access_token='))).toBe(true);
    expect(res.headers['set-cookie'].some((value) => value.includes('pb_refresh_token='))).toBe(true);
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
    const createdUser = await User.findOne({ where: { email: meUser.email } });
    const userToken = jwt.sign({ id: createdUser.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('email', meUser.email);
  });

  it('POST /api/auth/login - recreates a missing wallet for an existing user', async () => {
    const walletUser = {
      name: 'Wallet Recovery User',
      email: `wallet-recovery${Date.now()}@test.com`,
      password: 'password123',
      phone: `083${Date.now().toString().slice(-8)}`
    };

    await request(app).post('/api/auth/register').send(walletUser);
    const createdUser = await User.findOne({ where: { email: walletUser.email } });
    await Wallet.destroy({ where: { userId: createdUser.id } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrPhone: walletUser.email,
        password: walletUser.password
      });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.headers['set-cookie'])).toBe(true);
    expect(res.headers['set-cookie'].some((value) => value.includes('pb_access_token='))).toBe(true);
    expect(Number(res.body.user.balance)).toEqual(0);

    const recreatedWallet = await Wallet.findOne({ where: { userId: createdUser.id } });
    expect(recreatedWallet).toBeTruthy();
  });

  it('POST /api/auth/login - should fail with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrPhone: 'nonexistent@test.com',
        password: 'wrongpassword'
      });

    expect(res.statusCode).toEqual(401); // Should be 401 as per controller implementation for invalid creds
  });
});
