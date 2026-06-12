const smeplugService = require('../services/smeplugService');

describe('SMEPlug VTU endpoint fallback', () => {
  afterEach(() => {
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
  });
});
