const request = require('supertest');
const app = require('../server');
const { sequelize, connectDB } = require('../config/db');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const { Op } = require('sequelize');

describe('Support Endpoints', () => {
  let token;
  let userId;

  beforeAll(async () => {
    await connectDB();
    // Create a test user
    const testUser = {
      name: 'Support Test User',
      email: `support${Date.now()}@test.com`,
      password: 'password123',
      phone: `090${Date.now().toString().slice(-8)}`
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    token = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    // Clean up
    if (userId) {
        await SupportTicket.destroy({ where: { userId } });
        await User.destroy({ where: { id: userId } });
    }
    await sequelize.close();
  });

  it('POST /api/support - should create a new ticket', async () => {
    const res = await request(app)
      .post('/api/support')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Test Issue',
        message: 'This is a test message',
        priority: 'high'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.subject).toEqual('Test Issue');
    expect(res.body.status).toEqual('open');
  });

  it('GET /api/support - should get user tickets', async () => {
    const res = await request(app)
      .get('/api/support')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].subject).toEqual('Test Issue');
  });

  it('GET /api/support/:id - should get ticket by id', async () => {
    // First get the ticket ID
    const listRes = await request(app)
        .get('/api/support')
        .set('Authorization', `Bearer ${token}`);
    
    const ticketId = listRes.body[0].id;

    const res = await request(app)
      .get(`/api/support/${ticketId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual(ticketId);
    expect(res.body.User).toBeDefined(); // Check if include works (alias 'User')
  });
});
