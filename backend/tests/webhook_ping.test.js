const request = require('supertest');
const app = require('../server');

describe('Webhook ping endpoints', () => {
  it('responds 200 to GET payvessel webhook path (provider validation)', async () => {
    const res = await request(app).get('/api/webhooks/payvessel');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('responds 200 to HEAD payvessel webhook path (provider validation)', async () => {
    const res = await request(app).head('/api/webhooks/payvessel');
    expect(res.statusCode).toBe(200);
  });
});

