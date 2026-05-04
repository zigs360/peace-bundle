const request = require('supertest');
const app = require('../server');
const { connectDB } = require('../config/db');

describe('Database health endpoints', () => {
  beforeAll(async () => {
    await connectDB();
  });

  it('returns database diagnostics on /api/health', async () => {
    const res = await request(app).get('/api/health?schema=true');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.diagnostics).toBeTruthy();
    expect(res.body.diagnostics.connection).toBeTruthy();
    expect(res.body.diagnostics.pool).toBeTruthy();
    expect(res.body.diagnostics.metrics).toBeTruthy();
    expect(res.body.diagnostics.schema).toBeTruthy();
    expect(res.body.diagnostics.connection.maskedUrl || '').not.toContain('password');
  });

  it('returns readiness status on /api/ready', async () => {
    const res = await request(app).get('/api/ready');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ready).toBe(true);
    expect(res.body.database.status).toBe('up');
    expect(res.body.database.pool).toBeTruthy();
  });
});
