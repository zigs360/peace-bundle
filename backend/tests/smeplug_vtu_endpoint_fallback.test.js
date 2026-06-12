jest.mock('axios', () => jest.fn());

const axios = require('axios');
const smeplugService = require('../services/smeplugService');

const ORIGINAL_ENV = {
  SMEPLUG_PRIVATE_KEY: process.env.SMEPLUG_PRIVATE_KEY,
  SMEPLUG_SECRET_KEY: process.env.SMEPLUG_SECRET_KEY,
  SMEPLUG_API_KEY: process.env.SMEPLUG_API_KEY,
  SMEPLUG_PUBLIC_KEY: process.env.SMEPLUG_PUBLIC_KEY,
};

describe('SMEPlug VTU endpoint fallback', () => {
  afterEach(() => {
    process.env.SMEPLUG_PRIVATE_KEY = ORIGINAL_ENV.SMEPLUG_PRIVATE_KEY;
    process.env.SMEPLUG_SECRET_KEY = ORIGINAL_ENV.SMEPLUG_SECRET_KEY;
    process.env.SMEPLUG_API_KEY = ORIGINAL_ENV.SMEPLUG_API_KEY;
    process.env.SMEPLUG_PUBLIC_KEY = ORIGINAL_ENV.SMEPLUG_PUBLIC_KEY;
    axios.mockReset();
    jest.restoreAllMocks();
  });

  it('uses the documented /api/v1/airtime/purchase endpoint first for wallet airtime', async () => {
    const spy = jest.spyOn(smeplugService, 'makeRequest').mockResolvedValueOnce({
      success: true,
      data: { reference: 'VTU-REF-1' },
      status_code: 200,
    });

    const result = await smeplugService.purchaseVTU('mtn', '08012345678', 100);

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'POST',
      '/api/v1/airtime/purchase',
      expect.objectContaining({
        network_id: 1,
        phone: '08012345678',
        amount: 100,
      }),
    );
  });

  it('falls back to /api/v1/vtu when /api/v1/airtime/purchase is rejected without a reference', async () => {
    const spy = jest.spyOn(smeplugService, 'makeRequest')
      .mockResolvedValueOnce({
        success: false,
        error: 'Unable to purchase Airtime',
        data: { status: false, msg: 'Unable to purchase Airtime' },
        status_code: 400,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { reference: 'AIRTIME-REF-1' },
        status_code: 200,
      });

    const result = await smeplugService.purchaseVTU('mtn', '08012345678', 100);

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][1]).toBe('/api/v1/airtime/purchase');
    expect(spy.mock.calls[1][1]).toBe('/api/v1/vtu');
    expect(spy.mock.calls[1][2]).toEqual(expect.objectContaining({
      network_id: 1,
      phone: '08012345678',
      phone_number: '08012345678',
      amount: 100,
    }));
  });

  it('uses the private key for wallet airtime requests when available', async () => {
    process.env.SMEPLUG_PRIVATE_KEY = 'private-token';
    process.env.SMEPLUG_SECRET_KEY = 'secret-token';
    process.env.SMEPLUG_API_KEY = 'api-token';
    axios.mockResolvedValueOnce({
      status: 200,
      data: { status: true, reference: 'AIRTIME-REF-2' },
    });

    const result = await smeplugService.makeRequest('POST', '/api/v1/airtime/purchase', {
      network_id: 1,
      phone: '08012345678',
      amount: 100,
    });

    expect(result.success).toBe(true);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer private-token',
      }),
    }));
  });

  it('rejects wallet airtime requests when only SMEPLUG_API_KEY is configured', async () => {
    process.env.SMEPLUG_PRIVATE_KEY = '';
    process.env.SMEPLUG_SECRET_KEY = '';
    process.env.SMEPLUG_API_KEY = 'api-token';

    const result = await smeplugService.makeRequest('POST', '/api/v1/airtime/purchase', {
      network_id: 1,
      phone: '08012345678',
      amount: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SMEPLUG_PRIVATE_KEY or SMEPLUG_SECRET_KEY/);
    expect(axios).not.toHaveBeenCalled();
  });

  it('still allows device-based airtime requests to use SMEPLUG_API_KEY', async () => {
    process.env.SMEPLUG_PRIVATE_KEY = '';
    process.env.SMEPLUG_SECRET_KEY = '';
    process.env.SMEPLUG_API_KEY = 'api-token';
    axios.mockResolvedValueOnce({
      status: 200,
      data: { status: true, reference: 'AIRTIME-REF-3' },
    });

    const result = await smeplugService.makeRequest('POST', '/api/v1/airtime/purchase', {
      network_id: 1,
      phone: '08012345678',
      phone_number: '08012345678',
      amount: 100,
      mode: 'device_based',
      sim_number: '08035446865',
    });

    expect(result.success).toBe(true);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer api-token',
      }),
    }));
  });
});
