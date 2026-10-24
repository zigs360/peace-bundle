const logger = require('../utils/logger');

const SUPPORTED_NETWORKS = ['airtel', 'mtn', 'glo', '9mobile', 'etisalat', 't2'];

function getNetworkPrefix(network) {
  const net = String(network || '').toLowerCase();
  if (net.includes('airtel')) return 'ATM';
  if (net.includes('mtn')) return 'MTN';
  if (net.includes('glo')) return 'GLO';
  if (net.includes('9mobile') || net.includes('etisalat') || net.includes('t2')) return '9MOB';
  return 'CSUB';
}

class CallSubTelecomService {
  /**
   * Activate a Call Subscription bundle via designated provider or dynamic API provider
   */
  async activate({ provider, apiPlanId, phoneNumber, reference, callPlan = null }) {
    const network = String(provider || '').toLowerCase().trim();
    const prefix = getNetworkPrefix(network);

    logger.info(`[CallSubTelecom] Activating call sub for ${network} (${apiPlanId}) to ${phoneNumber} [${reference}]`);

    // 1. Check if a dynamic API provider (e.g. QuicklySIM, Smeplug) is configured for Voice/CallSub
    try {
      const dynamicProviderService = require('./dynamicProviderService');
      const apiProvider = await dynamicProviderService.getProviderForServiceAndNetwork('voice', network);

      if (apiProvider && apiProvider.is_active && (apiProvider.slug === 'quicklysim' || apiProvider.base_url)) {
        logger.info(`[CallSubTelecom] Routing Call Sub activation to dynamic provider: ${apiProvider.name} (${apiProvider.slug})`);

        // Check if provider has a specific voice_purchase or bundle endpoint
        const voicePath = apiProvider.endpoint_map?.voice_purchase || apiProvider.endpoint_map?.bundle_purchase;
        if (voicePath) {
          const client = dynamicProviderService.getHttpClient(apiProvider);
          const cleanPhone = String(phoneNumber).replace(/\D/g, '');
          const netId = dynamicProviderService.mapNetworkToQuicklysim(network);
          const payload = {
            network: String(netId),
            network_name: network.toUpperCase(),
            phone: cleanPhone,
            mobile_number: cleanPhone,
            phone_number: cleanPhone,
            plan_id: String(apiPlanId),
            plan: String(apiPlanId),
            ref: reference,
            reference,
          };

          try {
            const resp = await client.post(voicePath, payload);
            const data = resp.data;
            const isOk = data?.status === 'success' || data?.status === 200 || data?.success === true;
            if (isOk) {
              return {
                success: true,
                provider: apiProvider.slug,
                providerReference: data?.reference || data?.ref || `${prefix}-${Date.now()}`,
                reference,
                apiPlanId,
                phoneNumber,
                data,
              };
            }
          } catch (apiErr) {
            logger.warn(`[CallSubTelecom] Provider ${apiProvider.name} direct call endpoint failed: ${apiErr.message}`);
          }
        }
      }
    } catch (dynamicErr) {
      logger.warn(`[CallSubTelecom] Error resolving dynamic provider: ${dynamicErr.message}`);
    }

    // 2. Check per-network mode or global mock mode
    const networkModeKey = `CALL_SUB_${network.toUpperCase()}_MODE`;
    const mode = String(
      process.env[networkModeKey] || 
      process.env.CALL_SUB_MODE || 
      process.env.AIRTEL_TALKMORE_MODE || 
      'mock'
    ).toLowerCase();

    if (mode === 'mock') {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        success: true,
        provider: network,
        providerReference: `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        reference,
        apiPlanId,
        phoneNumber,
      };
    }

    if (!SUPPORTED_NETWORKS.some((n) => network.includes(n))) {
      logger.warn('[CallSub] Unsupported network provider', { provider: network });
      return { success: false, error: `Unsupported call subscription network: ${network}` };
    }

    logger.warn(`[CallSub:${network}] Unsupported mode: ${mode}`);
    return { 
      success: false, 
      error: `Call subscription telecom provider for ${network.toUpperCase()} is not fully configured` 
    };
  }
}

module.exports = new CallSubTelecomService();
