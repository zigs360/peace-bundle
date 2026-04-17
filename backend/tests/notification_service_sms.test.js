describe('notificationService sendSMS', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'termii';
    process.env.SMS_API_KEY = 'live_test_key';
    process.env.SMS_BASE_URL = 'https://v3.api.termii.com';
    process.env.SMS_SENDER_ID = 'PeaceBundlle';
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('downgrades provider insufficient balance to a warning result', async () => {
    const axiosPost = jest.fn().mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          code: 400,
          status: 'error',
          message: '400 : "You have insufficient balance"',
        },
      },
    });

    jest.doMock('axios', () => ({
      post: axiosPost,
    }));

    const logger = require('../utils/logger');
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const notificationService = require('../services/notificationService');

    const result = await notificationService.sendSMS('08012345678', 'hello world');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        retryable: false,
        reason: 'provider_insufficient_balance',
        status: 400,
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[SMS] Provider balance exhausted',
      expect.objectContaining({
        status: 400,
      })
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      'Error sending SMS',
      expect.anything()
    );
  });
});
