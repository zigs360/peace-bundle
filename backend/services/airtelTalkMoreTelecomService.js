const logger = require('../utils/logger');

class AirtelTalkMoreTelecomService {
  async activate({ apiPlanId, phoneNumber, reference }) {
    const mode = String(process.env.AIRTEL_TALKMORE_MODE || 'mock').toLowerCase();
    if (mode === 'mock') {
      await new Promise((r) => setTimeout(r, 150));
      return {
        success: true,
        provider: 'airtel',
        providerReference: `ATM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        reference,
        apiPlanId,
        phoneNumber,
      };
    }

    logger.warn('[AirtelTalkMore] Unsupported mode', { mode });
    return { success: false, error: 'Telecom provider integration not configured' };
  }
}

module.exports = new AirtelTalkMoreTelecomService();

