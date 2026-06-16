jest.mock('axios');

const axios = require('axios');
const smeplugService = require('../services/smeplugService');

describe('SMEPlug response classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SMEPLUG_BASE_URL = 'https://smeplug.ng';
    process.env.SMEPLUG_SECRET_KEY = 'secret';
  });

  afterEach(() => {
    delete process.env.SMEPLUG_BASE_URL;
    delete process.env.SMEPLUG_SECRET_KEY;
  });

  it('treats vend endpoints as failure when HTTP 200 but body status is not success', async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: { status: -1, msg: 'PIN not set for Mtn' },
    });

    const res = await smeplugService.makeRequest('POST', '/api/v1/vtu', {
      network_id: 1,
      phone: '08100000000',
      phone_number: '08100000000',
      amount: 100,
    });

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toMatch(/PIN not set/i);
    expect(res.status_code).toBe(200);
  });

  it('treats vend endpoints as failure when HTTP 200 and status success but missing provider reference', async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: { status: true, msg: 'success' },
    });

    const res = await smeplugService.makeRequest('POST', '/api/v1/airtime/purchase', {
      network_id: 1,
      phone: '08100000000',
      amount: 100,
    });

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toMatch(/missing a provider reference/i);
    expect(res.status_code).toBe(200);
  });
});
