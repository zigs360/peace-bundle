const request = require('supertest');

describe('CORS config', () => {
  jest.setTimeout(60000);
  const prev = { ...process.env };

  afterAll(() => {
    process.env = prev;
  });

  it('sets Access-Control-Allow-Origin for allowed origins in production', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URLS = 'https://www.peacebundlle.com';
    const app = require('../server');

    const res = await request(app).get('/').set('Origin', 'https://www.peacebundlle.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://www.peacebundlle.com');
  });

  it('does not set Access-Control-Allow-Origin for disallowed origins in production', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URLS = 'https://www.peacebundlle.com';
    const app = require('../server');

    const res = await request(app).get('/').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
