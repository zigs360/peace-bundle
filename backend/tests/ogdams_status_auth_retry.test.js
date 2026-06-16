const ogdamsService = require('../services/ogdamsService');

describe('Ogdams status auth retry behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OGDAMS_AUTH_STYLE;
    delete process.env.OGDAMS_API_KEY;
  });

  it('retries auth styles on 401/Unauthenticated during status checks', async () => {
    process.env.OGDAMS_API_KEY = 'test-key';
    process.env.OGDAMS_AUTH_STYLE = 'bearer';

    const requestSpy = jest.spyOn(ogdamsService.http, 'request')
      .mockRejectedValueOnce(Object.assign(new Error('Request failed'), {
        response: { status: 401, data: { msg: 'Unauthenticated.' } },
      }))
      .mockResolvedValueOnce({ status: 200, data: { status: true, reference: 'OK' } });

    const res = await ogdamsService.checkAirtimeStatus('OGD|1|TEST|20260616000000');

    expect(res).toEqual({ status: true, reference: 'OK' });
    expect(requestSpy).toHaveBeenCalledTimes(2);
  });
});

