const ogdamsService = require('../services/ogdamsService');

describe('Ogdams airtime payload normalization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults missing type to VTU and allows sim_number', async () => {
    const requestSpy = jest.spyOn(ogdamsService, 'requestWithAuthFallback').mockResolvedValue({
      response: { status: 200, data: { status: 'success', reference: 'OGD-REF-1' } },
      authStyle: 'header',
    });

    const res = await ogdamsService.purchaseAirtime({
      networkId: 1,
      amount: 100,
      phoneNumber: '08012345678',
      reference: 'REF-1',
      sim_number: '08035446865',
    });

    expect(res.status).toBe('success');
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0].data.type).toBe('VTU');
  });
});

