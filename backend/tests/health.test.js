const request = require('supertest');
const app = require('../server');
const { sequelize, connectDB } = require('../config/db');

describe('Health Check', () => {
  beforeAll(async () => {
    await connectDB();
  });

  // Close DB connection after tests to prevent Jest from hanging
  afterAll(async () => {
    await sequelize.close();
  });

  it('GET / should return 200 OK', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
    expect(res.text).toContain('Peace Bundle API is running');
  });
});
