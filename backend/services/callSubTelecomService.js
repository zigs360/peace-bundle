const logger = require('../utils/logger');

const airtelActivator = async ({ apiPlanId, phoneNumber, reference }) => {
  const mode = String(process.env.CALL_SUB_AIRTEL_MODE || process.env.AIRTEL_TALKMORE_MODE || 'mock').toLowerCase();
  if (mode === 'mock') {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      provider: 'airtel',
      providerReference: `ATM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      reference,
      apiPlanId,
      phoneNumber,
    };
  }

  logger.warn('[CallSub:airtel] Unsupported mode', { mode });
  return { success: false, error: 'Telecom provider integration not configured' };
};

const providerActivators = {
  airtel: airtelActivator,
};

class CallSubTelecomService {
  async activate({ provider, apiPlanId, phoneNumber, reference }) {
    const key = String(provider || '').toLowerCase();
    const activator = providerActivators[key];
    if (!activator) {
      logger.warn('[CallSub] Unsupported provider', { provider: key });
      return { success: false, error: 'Unsupported call sub provider' };
    }

    return activator({ apiPlanId, phoneNumber, reference });
  }
}

module.exports = new CallSubTelecomService();
