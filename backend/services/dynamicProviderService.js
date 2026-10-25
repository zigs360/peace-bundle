const axios = require('axios');
const { Op, Sequelize } = require('sequelize');
const ApiProvider = require('../models/ApiProvider');
const logger = require('../utils/logger');
const { sanitizeUserFacingErrorMessage } = require('../utils/clientPayloadSanitizers');

const sanitizeHeader = (val) => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/[\r\n\t]/g, '').trim();
};

class DynamicProviderService {
  /**
   * Seed default system providers (Smeplug, Ogdams, QuicklySIM) if not present
   */
  async ensureDefaultProviders() {
    try {
      const explicitEnv = (process.env.PRIMARY_API_PROVIDER || '').trim().toLowerCase();
      const isQuicklysimPrimary = explicitEnv ? explicitEnv === 'quicklysim' : true;

      const defaults = [
        {
          name: 'QuicklySIM',
          slug: 'quicklysim',
          service_type: 'all',
          base_url: process.env.QUICKLYSIM_BASE_URL || 'https://quicklysim.com',
          api_key: process.env.QUICKLYSIM_API_KEY || '',
          secret_key: process.env.QUICKLYSIM_SECRET_KEY || '',
          capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting', 'ussd'],
          endpoint_map: {
            devices: '/topupmate/api/user',
            device_balance: '/topupmate/api/user',
            ussd: '/devices/:id/ussd',
            data_purchase: '/topupmate/api/data',
            airtime_purchase: '/topupmate/api/airtime',
            balance: '/topupmate/api/user',
          },
          is_active: true,
          is_primary: isQuicklysimPrimary,
          priority: isQuicklysimPrimary ? 1 : 2,
        },
        {
          name: 'Smeplug',
          slug: 'smeplug',
          service_type: 'all',
          base_url: process.env.SMEPLUG_BASE_URL || 'https://smeplug.ng/api/v1',
          api_key: process.env.SMEPLUG_API_KEY || '',
          secret_key: process.env.SMEPLUG_SECRET_KEY || '',
          public_key: process.env.SMEPLUG_PUBLIC_KEY || '',
          capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting', 'ussd'],
          endpoint_map: {
            devices: '/devices',
            data_purchase: '/data/purchase',
            airtime_purchase: '/airtime/purchase',
            balance: '/wallet/balance',
          },
          is_active: true,
          is_primary: !isQuicklysimPrimary,
          priority: isQuicklysimPrimary ? 2 : 1,
        },
        {
          name: 'Ogdams',
          slug: 'ogdams',
          service_type: 'vtu',
          base_url: process.env.OGDAMS_BASE_URL || 'https://ogdams.com/api',
          api_key: process.env.OGDAMS_API_KEY || '',
          capabilities: ['vtu_data', 'vtu_airtime'],
          endpoint_map: {
            data_purchase: '/data',
            airtime_purchase: '/airtime',
            balance: '/balance',
          },
          is_active: true,
          is_primary: false,
          priority: 3,
        },
      ];

      for (const p of defaults) {
        const existing = await ApiProvider.findOne({ where: { slug: p.slug } });
        if (!existing) {
          await ApiProvider.create(p);
          logger.info(`[DynamicProvider] Initialized default provider: ${p.name} (${p.slug})`);
        } else {
          // Sync keys from environment if provided and missing in DB
          let changed = false;
          if (p.api_key && (!existing.api_key || existing.api_key.includes('your_'))) {
            existing.api_key = p.api_key;
            changed = true;
          }
          if (p.secret_key && (!existing.secret_key || existing.secret_key.includes('your_'))) {
            existing.secret_key = p.secret_key;
            changed = true;
          }
          if (p.slug === 'quicklysim') {
            const currentAirtime = existing.endpoint_map?.airtime_purchase;
            const currentData = existing.endpoint_map?.data_purchase;
            if (
              existing.base_url !== 'https://quicklysim.com' ||
              !currentAirtime ||
              currentAirtime === '/airtime' ||
              currentAirtime === '/api/airtime' ||
              currentAirtime === 'api/airtime' ||
              !currentData ||
              currentData === '/data' ||
              currentData === '/api/data'
            ) {
              existing.base_url = 'https://quicklysim.com';
              existing.endpoint_map = {
                ...(existing.endpoint_map || {}),
                devices: '/topupmate/api/user',
                device_balance: '/topupmate/api/user',
                ussd: '/devices/:id/ussd',
                data_purchase: '/topupmate/api/data',
                airtime_purchase: '/topupmate/api/airtime',
                balance: '/topupmate/api/user',
              };
              changed = true;
            }
          }
          if (changed) {
            await existing.save();
          }
        }
      }
    } catch (err) {
      logger.warn(`[DynamicProvider] Error seeding default providers: ${err.message}`);
    }
  }

  /**
   * List all registered providers
   */
  async getAllProviders() {
    await this.ensureDefaultProviders();
    return await ApiProvider.findAll({
      order: [
        ['is_primary', 'DESC'],
        ['priority', 'ASC'],
        ['name', 'ASC'],
      ],
    });
  }

  /**
   * Get active provider for a given capability/service
   * @param {string} capability - 'data', 'airtime', 'sim_management'
   */
  async getActiveProvider(capability = 'data') {
    await this.ensureDefaultProviders();

    // First check for active primary provider that has the capability
    const providers = await ApiProvider.findAll({
      where: { is_active: true },
      order: [
        ['is_primary', 'DESC'],
        ['priority', 'ASC'],
      ],
    });

    for (const p of providers) {
      const caps = Array.isArray(p.capabilities) ? p.capabilities : [];
      if (
        p.service_type === 'all' ||
        p.service_type === capability ||
        caps.includes(capability) ||
        (capability === 'data' && caps.includes('vtu_data')) ||
        (capability === 'airtime' && caps.includes('vtu_airtime')) ||
        (capability === 'sim_management' && caps.includes('sim_hosting'))
      ) {
        return p;
      }
    }

    return null;
  }

  /**
   * Check if a provider supports a given service type
   * @param {ApiProvider} provider
   * @param {string} serviceType - 'data', 'vtu_data', 'airtime', 'vtu_airtime', 'sim_management'
   */
  providerSupportsService(provider, serviceType) {
    if (!provider || !serviceType) return true;
    const cleanType = String(serviceType).trim().toLowerCase();
    const serviceTypeKey = cleanType === 'vtu_airtime' ? 'airtime' : cleanType === 'vtu_data' ? 'data' : cleanType;
    const caps = Array.isArray(provider.capabilities) ? provider.capabilities : [];

    // If provider service_type is explicitly set and restricted:
    if (provider.service_type && provider.service_type !== 'all' && provider.service_type !== 'vtu') {
      if (provider.service_type !== serviceTypeKey) return false;
    }

    if (serviceTypeKey === 'airtime') {
      if (provider.service_type === 'airtime') return true;
      if (caps.includes('vtu_airtime') || caps.includes('airtime')) return true;
      if (provider.service_type === 'data') return false;
      if (caps.length > 0 && !caps.includes('vtu_airtime') && !caps.includes('airtime')) {
        return false;
      }
      return true;
    }

    if (serviceTypeKey === 'data') {
      if (provider.service_type === 'data') return true;
      if (caps.includes('vtu_data') || caps.includes('data')) return true;
      if (provider.service_type === 'airtime') return false;
      if (caps.length > 0 && !caps.includes('vtu_data') && !caps.includes('data')) {
        return false;
      }
      return true;
    }

    return true;
  }

  /**
   * Case-insensitive lookup for provider by slug
   */
  async findProviderBySlug(targetSlug, onlyActive = true) {
    if (!targetSlug) return null;
    const s = String(targetSlug).trim().toLowerCase();
    const all = await ApiProvider.findAll({
      where: onlyActive ? { is_active: true } : {},
    });
    return all.find((p) => {
      const pSlug = String(p.slug || '').trim().toLowerCase();
      if (pSlug === s) return true;
      if ((s === 'legit' || s === 'legitdataway') && (pSlug === 'legit' || pSlug === 'legitdataway')) return true;
      return false;
    }) || null;
  }

  /**
   * Resolve provider for a specific service and network (e.g. glo_data, mtn_airtime)
   * Falls back to getPrimaryProvider(serviceType) if no granular route is set.
   * @param {string} serviceType - 'data', 'vtu_data', 'airtime', 'vtu_airtime', 'voice', 'call_sub'
   * @param {string} network - 'mtn', 'airtel', 'glo', '9mobile'
   */
  async getProviderForServiceAndNetwork(serviceType, network) {
    await this.ensureDefaultProviders();

    const cleanService = String(serviceType || '').trim().toLowerCase();
    const serviceKey = cleanService.includes('airtime')
      ? 'airtime'
      : cleanService.includes('voice') || cleanService.includes('call')
      ? 'voice'
      : 'data';

    const net = String(network || '').trim().toLowerCase();
    const networkKey = net.includes('mtn')
      ? 'mtn'
      : net.includes('glo')
      ? 'glo'
      : net.includes('airtel')
      ? 'airtel'
      : net.includes('9mobile') || net.includes('etisalat') || net.includes('t2')
      ? '9mobile'
      : net;

    const routeKey = `${networkKey}_${serviceKey}`; // e.g. 'glo_data', 'mtn_airtime'

    // 1. Check granular environment variable override, e.g. PROVIDER_ROUTE_GLO_DATA=legitdataway
    const envVar = `PROVIDER_ROUTE_${networkKey.toUpperCase()}_${serviceKey.toUpperCase()}`;
    const envOverride = (process.env[envVar] || '').trim().toLowerCase();
    if (envOverride) {
      const provider = await this.findProviderBySlug(envOverride);
      if (provider) {
        logger.info(`[DynamicProvider] Granular route hit via env ${envVar}: ${routeKey} -> ${provider.name} (${provider.slug})`);
        return provider;
      }
    }

    // 2. Check granular routes stored in SystemSetting ('provider_network_routes')
    try {
      const SystemSetting = require('../models/SystemSetting');
      const routes = await SystemSetting.get('provider_network_routes', {});
      if (routes && typeof routes === 'object') {
        const targetSlug = routes[routeKey] || routes[`${networkKey}_${cleanService}`];
        if (targetSlug && targetSlug !== 'default' && targetSlug !== 'primary') {
          const provider = await this.findProviderBySlug(targetSlug);
          if (provider) {
            logger.info(`[DynamicProvider] Granular route hit via SystemSetting: ${routeKey} -> ${provider.name} (${provider.slug})`);
            return provider;
          }
        }
      }
    } catch (e) {
      logger.warn(`[DynamicProvider] Could not load provider_network_routes from SystemSetting: ${e.message}`);
    }

    // 3. Fall back to standard primary provider resolution for the service type
    return await this.getPrimaryProvider(cleanService);
  }

  /**
   * Get current primary active provider, respecting service capability if serviceType is given
   */
  async getPrimaryProvider(serviceType = null) {
    await this.ensureDefaultProviders();

    // Check service-specific environment overrides if defined
    if (serviceType && (serviceType === 'airtime' || serviceType === 'vtu_airtime')) {
      const explicitAirtime = (process.env.AIRTIME_PRIMARY_ROUTE || '').trim().toLowerCase();
      if (explicitAirtime) {
        const airtimeTarget = await this.findProviderBySlug(explicitAirtime);
        if (airtimeTarget) return airtimeTarget;
      }
    }
    if (serviceType && (serviceType === 'data' || serviceType === 'vtu_data')) {
      const explicitData = (process.env.DATA_PRIMARY_ROUTE || '').trim().toLowerCase();
      if (explicitData) {
        const dataTarget = await this.findProviderBySlug(explicitData);
        if (dataTarget) return dataTarget;
      }
    }

    // 1. First check for active primary provider in the database
    let primary = await ApiProvider.findOne({ where: { is_primary: true, is_active: true } });

    // 2. Only if PRIMARY_API_PROVIDER is explicitly defined in environment and differs, enforce it
    const explicitEnv = (process.env.PRIMARY_API_PROVIDER || '').trim().toLowerCase();
    if (explicitEnv && explicitEnv !== 'sim') {
      const envTarget = await this.findProviderBySlug(explicitEnv);
      if (envTarget && (!primary || primary.slug !== explicitEnv)) {
        await this.setPrimaryProvider(envTarget.id);
        primary = envTarget;
      }
    }

    if (!primary) {
      // Default to quicklysim first if active, otherwise highest priority
      primary = await this.findProviderBySlug('quicklysim');
      if (!primary) {
        primary = await ApiProvider.findOne({
          where: { is_active: true },
          order: [
            ['priority', 'ASC'],
            ['createdAt', 'ASC'],
          ],
        });
      }
      if (primary) {
        await this.setPrimaryProvider(primary.id);
      }
    }

    // 3. If serviceType is specified and the primary provider does NOT support it
    // (for example, the primary provider only has data, but the request is for airtime),
    // automatically fall back to the active provider that DOES support this service!
    if (serviceType && primary && !this.providerSupportsService(primary, serviceType)) {
      const capability = serviceType === 'vtu_airtime' ? 'airtime' : serviceType === 'vtu_data' ? 'data' : serviceType;
      const specializedProvider = await this.getActiveProvider(capability);
      if (specializedProvider) {
        logger.info(`[DynamicProvider] Primary provider '${primary.name}' does not support '${serviceType}', routing to specialized provider '${specializedProvider.name}'`);
        return specializedProvider;
      }
    }

    if (primary) {
      globalThis.__peacebundle_primary_provider = primary;
    }
    return primary;
  }

  /**
   * Set a provider as the primary active provider
   */
  async setPrimaryProvider(providerId) {
    const target = await ApiProvider.findByPk(providerId);
    if (!target) throw new Error('Provider not found');

    // Remove primary flag from other providers of same service type or all
    await ApiProvider.update(
      { is_primary: false },
      { where: { is_primary: true } }
    );

    target.is_primary = true;
    target.is_active = true;
    await target.save();

    globalThis.__peacebundle_primary_provider = target;
    logger.info(`[DynamicProvider] Provider ${target.name} set as PRIMARY`);
    return target;
  }

  /**
   * Register or update a provider
   */
  async saveProvider(data) {
    let cleanSlug = (data.slug || data.name || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    let cleanBaseUrl = String(data.base_url || '').replace(/\/+$/, '').trim();

    if (cleanSlug === 'legitdataway' || cleanBaseUrl.toLowerCase().includes('legitdataway')) {
      cleanBaseUrl = 'https://legitdataway.com';
    }

    if (data.id) {
      const p = await ApiProvider.findByPk(data.id);
      if (!p) throw new Error('Provider not found');
      return await p.update({
        ...data,
        slug: cleanSlug || p.slug,
        base_url: cleanBaseUrl || p.base_url,
      });
    }

    const existing = await this.findProviderBySlug(cleanSlug, false);
    if (existing) {
      return await existing.update({
        ...data,
        slug: cleanSlug,
        base_url: cleanBaseUrl,
      });
    }

    return await ApiProvider.create({
      ...data,
      slug: cleanSlug,
      base_url: cleanBaseUrl,
    });
  }

  /**
   * Delete or deactivate provider
   */
  async deleteProvider(id) {
    const p = await ApiProvider.findByPk(id);
    if (!p) throw new Error('Provider not found');
    await p.destroy();
    return { success: true };
  }

  /**
   * Build Axios client configured for target provider
   */
  getHttpClient(provider) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(provider.headers || {}),
    };

    const cleanApiKey = sanitizeHeader(provider.api_key);
    const cleanSecretKey = sanitizeHeader(provider.secret_key);

    if (cleanApiKey) {
      const slugLower = String(provider.slug || '').toLowerCase();
      const urlLower = String(provider.base_url || '').toLowerCase();
      const authHeaderPref = String(provider.metadata?.auth_header_format || '').toLowerCase();

      if (
        slugLower === 'quicklysim' || 
        slugLower === 'legitdataway' ||
        urlLower.includes('quicklysim') || 
        urlLower.includes('legitdataway') ||
        authHeaderPref === 'token'
      ) {
        headers['Authorization'] = `Token ${cleanApiKey}`;
      } else {
        headers['Authorization'] = `Bearer ${cleanApiKey}`;
      }
      headers['x-api-key'] = cleanApiKey;
      headers['api-key'] = cleanApiKey;
    }
    if (cleanSecretKey) {
      headers['x-secret-key'] = cleanSecretKey;
      headers['api-secret'] = cleanSecretKey;
    }

    let baseUrl = String(provider.base_url || '').replace(/\/+$/, '');
    const slugLower = String(provider.slug || '').toLowerCase();
    const urlLower = String(provider.base_url || '').toLowerCase();

    if (slugLower === 'quicklysim' || urlLower.includes('quicklysim')) {
      if (!baseUrl || baseUrl.endsWith('/api') || baseUrl.includes('topupmate')) {
        baseUrl = 'https://quicklysim.com';
      }
    }
    if (slugLower === 'legitdataway' || urlLower.includes('legitdataway')) {
      baseUrl = 'https://legitdataway.com';
    }

    return axios.create({
      baseURL: baseUrl,
      headers,
      timeout: 30000,
    });
  }

  /**
   * Helper to map network name to QuicklySIM numeric network ID
   * 1 = MTN, 2 = GLO, 3 = 9MOBILE, 4 = AIRTEL
   */
  mapNetworkToQuicklysim(network) {
    const net = String(network || '').toLowerCase();
    if (net.includes('mtn') || net === '1') return '1';
    if (net.includes('glo') || net === '2') return '2';
    if (net.includes('9mobile') || net.includes('etisalat') || net === '3') return '3';
    if (net.includes('airtel') || net === '4') return '4';
    return '1';
  }

  /**
   * Helper to map network name to Legitdataway (Adex API) numeric network ID
   * 1 = MTN, 2 = AIRTEL, 3 = GLO, 4 = 9MOBILE
   */
  mapNetworkToLegitdataway(network) {
    const net = String(network || '').trim().toLowerCase();
    if (net.includes('mtn')) return 1;
    if (net.includes('airtel')) return 2;
    if (net.includes('glo')) return 3;
    if (net.includes('9mobile') || net.includes('etisalat')) return 4;
    if (net === '1') return 1;
    if (net === '2') return 2;
    if (net === '3') return 3;
    if (net === '4') return 4;
    return 1;
  }

  /**
   * Resolve specific Legitdataway plan ID based on network, plan metadata, size, and amount
   */
  async resolveLegitdatawayPlanId(networkKey, planId, planObj = null, amount = null) {
    const netId = this.mapNetworkToLegitdataway(networkKey);
    const numericPlanId = Number(planId);

    // Check if planId already matches a known valid Legitdataway plan ID
    const knownLegitPlans = {
      1: [36, 37, 38, 39, 40, 41, 46, 47, 48, 49, 50], // MTN
      2: [233, 235, 238, 240, 241, 244, 245, 247, 248, 249, 250, 251], // AIRTEL
      3: [70, 71, 72, 73, 74, 75, 76], // GLO
      4: [85, 86, 87, 88, 89, 90, 91], // 9MOBILE
    };

    if (knownLegitPlans[netId]?.includes(numericPlanId)) {
      return numericPlanId;
    }

    // Attempt to load DataPlan record if planObj not provided or missing size metadata
    let resolvedPlan = planObj;
    if ((!resolvedPlan || (!resolvedPlan.size && !resolvedPlan.size_mb)) && planId) {
      try {
        const DataPlan = require('../models/DataPlan');
        resolvedPlan = (await DataPlan.findByPk(planId)) ||
          (await DataPlan.findOne({ where: { plan_id: String(planId) } })) ||
          (await DataPlan.findOne({ where: { smeplug_plan_id: String(planId) } }));
      } catch (_) {}
    }

    // Extract size in MB
    let sizeMb = resolvedPlan?.size_mb || null;
    const sizeStr = String(resolvedPlan?.size || resolvedPlan?.data_size || resolvedPlan?.name || '').toUpperCase();

    if (!sizeMb && sizeStr) {
      const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        if (unit === 'GB') sizeMb = Math.round(val * 1024);
        else if (unit === 'MB') sizeMb = Math.round(val);
        else if (unit === 'TB') sizeMb = Math.round(val * 1024 * 1024);
      }
    }

    // Fallback size estimation from transaction amount if size is still unavailable
    if (!sizeMb && amount) {
      const amt = Number(amount);
      if (netId === 3) { // GLO
        if (amt >= 70 && amt <= 120) sizeMb = 200;
        else if (amt > 120 && amt <= 260) sizeMb = 500;
        else if (amt > 260 && amt <= 450) sizeMb = 1024;
        else if (amt > 450 && amt <= 850) sizeMb = 2048;
      } else if (netId === 1) { // MTN
        if (amt <= 250) sizeMb = 1024;
        else if (amt <= 350) sizeMb = 500;
        else if (amt <= 600) sizeMb = 2048;
      } else if (netId === 2) { // AIRTEL
        if (amt <= 150) sizeMb = 250;
        else if (amt <= 350) sizeMb = 1024;
        else if (amt <= 550) sizeMb = 1536;
      }
    }

    // Map sizeMb to network's specific Legitdataway plan ID
    if (netId === 3) { // GLO
      if (sizeMb && sizeMb <= 250) return 70; // 200MB
      if (sizeMb && sizeMb <= 700) return 71; // 500MB
      if (sizeMb && sizeMb <= 1500) return 72; // 1GB
      if (sizeMb && sizeMb <= 2500) return 73; // 2GB
      if (sizeMb && sizeMb <= 3500) return 74; // 3GB
      if (sizeMb && sizeMb <= 6000) return 75; // 5GB
      if (sizeMb && sizeMb > 6000) return 76; // 10GB
      return 71; // Default to Glo 500MB
    }

    if (netId === 1) { // MTN
      if (sizeMb && sizeMb <= 700) return 36; // 500MB SME
      if (sizeMb && sizeMb <= 1500) return 46; // 1GB Corporate Gifting
      if (sizeMb && sizeMb <= 2500) return 47; // 2GB
      if (sizeMb && sizeMb <= 3500) return 48; // 3GB
      if (sizeMb && sizeMb <= 6000) return 49; // 5GB
      if (sizeMb && sizeMb > 6000) return 50; // 10GB
      return 46; // Default to MTN 1GB
    }

    if (netId === 2) { // AIRTEL
      if (sizeMb && sizeMb <= 300) return 244; // 250MB
      if (sizeMb && sizeMb <= 550) return 235; // 500MB
      if (sizeMb && sizeMb <= 800) return 247; // 600MB
      if (sizeMb && sizeMb <= 1200) return 233; // 1GB
      if (sizeMb && sizeMb <= 1800) return 238; // 1.5GB
      if (sizeMb && sizeMb <= 2500) return 245; // 2GB
      if (sizeMb && sizeMb <= 3500) return 249; // 3GB
      if (sizeMb && sizeMb <= 6000) return 250; // 5GB
      if (sizeMb && sizeMb > 6000) return 251; // 10GB
      return 233; // Default to Airtel 1GB
    }

    if (netId === 4) { // 9MOBILE
      if (sizeMb && sizeMb <= 700) return 85; // 500MB
      if (sizeMb && sizeMb <= 1500) return 86; // 1GB
      if (sizeMb && sizeMb <= 2500) return 87; // 2GB
      if (sizeMb && sizeMb <= 3500) return 88; // 3GB
      if (sizeMb && sizeMb <= 4500) return 89; // 4GB
      if (sizeMb && sizeMb <= 6000) return 90; // 5GB
      if (sizeMb && sizeMb > 6000) return 91; // 10GB
      return 86; // Default to 9Mobile 1GB
    }

    return numericPlanId || planId;
  }

  /**
   * SIM MANAGEMENT: Fetch Linked Devices from Provider (QuicklySIM / Smeplug / Custom)
   */
  async getLinkedDevices(providerSlug = null) {
    let provider = null;
    if (providerSlug) {
      provider = await ApiProvider.findOne({ where: { slug: providerSlug } });
    }
    if (!provider) {
      provider = await this.getActiveProvider('sim_management');
    }
    if (!provider) {
      throw new Error('No active SIM management provider found');
    }

    // SMEPlug: Delegate directly to smeplugService
    if (provider.slug === 'smeplug') {
      const smeplugService = require('./smeplugService');
      const res = await smeplugService.getLinkedDevices();
      return {
        success: res.success !== false,
        provider: 'Smeplug',
        devices: res.data || [],
        raw: res,
      };
    }

    // QuicklySIM: Cloud Farm with auto-reloaded smart SIM pool
    if (String(provider.slug || '').toLowerCase() === 'quicklysim' || String(provider.base_url || '').toLowerCase().includes('quicklysim')) {
      const client = this.getHttpClient(provider);
      try {
        logger.info('[DynamicProvider] Checking QuicklySIM connection and wallet balance...');
        const response = await client.get('/topupmate/api/user').catch(() => client.get('/api/user'));
        const userData = response.data?.data || response.data?.user || response.data || {};
        const balance = parseFloat(userData?.balance ?? userData?.wallet_balance ?? 0);
        return {
          success: true,
          provider: provider.name,
          message: `QuicklySIM Cloud Farm connected. Live wallet balance: ₦${balance}. SIMs are managed internally in QuicklySIM cloud farm.`,
          devices: [
            {
              id: 'quicklysim-cloud-farm',
              phone_number: 'Cloud Farm (114+ SIMs)',
              network: 'all',
              balance: balance,
              status: 'online',
              sim_slot: 1,
              device_name: 'QuicklySIM Cloud SIM Farm',
              provider_slug: 'quicklysim',
              raw: userData,
            },
          ],
        };
      } catch (err) {
        logger.warn(`[DynamicProvider] QuicklySIM connection notice: ${err.message}`);
        return {
          success: true,
          provider: provider.name,
          message: 'QuicklySIM Cloud Farm is active (114+ SIMs managed via QuicklySIM API).',
          devices: [
            {
              id: 'quicklysim-cloud-farm',
              phone_number: 'Cloud Farm (114+ SIMs)',
              network: 'all',
              balance: 0,
              status: 'online',
              sim_slot: 1,
              device_name: 'QuicklySIM Cloud SIM Farm',
              provider_slug: 'quicklysim',
            },
          ],
        };
      }
    }

    // Non-SIM providers like Ogdams
    const caps = Array.isArray(provider.capabilities) ? provider.capabilities : [];
    if (provider.slug === 'ogdams' || (!caps.includes('sim_hosting') && provider.service_type !== 'all')) {
      return {
        success: true,
        provider: provider.name,
        message: `${provider.name} is a VTU gateway provider and vends via API wallet rather than hosting physical SIM devices.`,
        devices: [],
      };
    }

    const client = this.getHttpClient(provider);
    const path = provider.endpoint_map?.devices || '/devices';

    try {
      logger.info(`[DynamicProvider] Fetching linked devices from ${provider.name} at ${path}`);
      const response = await client.get(path);
      const data = response.data;

      let rawDevices = [];
      if (Array.isArray(data)) {
        rawDevices = data;
      } else if (Array.isArray(data?.data)) {
        rawDevices = data.data;
      } else if (Array.isArray(data?.devices)) {
        rawDevices = data.devices;
      } else if (Array.isArray(data?.data?.devices)) {
        rawDevices = data.data.devices;
      }

      const normalizedDevices = rawDevices.map((d) => ({
        id: d.id || d.device_id || d.deviceId || String(Math.floor(Math.random() * 100000)),
        phone_number: d.phone_number || d.phone || d.msisdn || d.sim1_phone || d.sim2_phone || null,
        network: (d.network || d.operator || d.provider || 'unknown').toLowerCase(),
        balance: parseFloat(d.balance || d.airtime_balance || d.wallet_balance || 0),
        status: (d.status || (d.is_online ? 'online' : 'active')).toLowerCase(),
        sim_slot: d.sim_slot || d.slot || 1,
        device_name: d.device_name || d.name || `${provider.name} SIM`,
        provider_slug: provider.slug,
        raw: d,
      }));

      return {
        success: true,
        provider: provider.name,
        devices: normalizedDevices,
      };
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) {
        logger.info(`[DynamicProvider] ${provider.name} devices endpoint returned ${err.response?.status} - operates via direct VTU API.`);
        return {
          success: true,
          provider: provider.name,
          message: `${provider.name} operates via direct VTU API rather than device hosting. No physical SIMs required.`,
          devices: [],
        };
      }
      logger.error(`[DynamicProvider] Error fetching devices from ${provider.name}: ${err.message}`);
      return {
        success: false,
        provider: provider.name,
        error: err.response?.data?.message || err.message,
        devices: [],
      };
    }
  }

  /**
   * SIM MANAGEMENT: Send USSD Command through a Linked Device
   */
  async sendUSSD(deviceId, ussdCode, providerSlug = null) {
    let provider = null;
    if (providerSlug) {
      provider = await ApiProvider.findOne({ where: { slug: providerSlug } });
    }
    if (!provider) {
      provider = await this.getActiveProvider('sim_management');
    }
    if (!provider) throw new Error('No active SIM provider found');

    const client = this.getHttpClient(provider);
    const path = (provider.endpoint_map?.ussd || '/devices/:id/ussd').replace(':id', deviceId);

    try {
      const response = await client.post(path, {
        device_id: deviceId,
        ussd_code: ussdCode,
        code: ussdCode,
      });
      return { success: true, data: response.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message,
      };
    }
  }

  /**
   * VTU: Purchase Data via Active or Target Dynamic Provider
   */
  async purchaseData(arg1, arg2, arg3, arg4, arg5 = null, arg6 = {}) {
    let network, phone, planId, amount, targetProviderSlug, options;

    if (typeof arg1 === 'object' && arg1 !== null) {
      const planObj = arg1;
      phone = arg2;
      network = arg3 || planObj.provider;
      planId = planObj.provider_plan_id || planObj.plan_id || planObj.id;
      amount = planObj.price || planObj.admin_price || 0;
      targetProviderSlug = planObj.source || null;
      options = typeof arg4 === 'object' && arg4 !== null ? arg4 : {};
    } else {
      network = arg1;
      phone = arg2;
      planId = arg3;
      amount = arg4;
      targetProviderSlug = typeof arg5 === 'string' ? arg5 : null;
      options = typeof arg5 === 'object' && arg5 !== null ? arg5 : (arg6 || {});
    }

    let provider = null;
    if (targetProviderSlug && targetProviderSlug !== 'default' && targetProviderSlug !== 'primary') {
      provider = await this.findProviderBySlug(targetProviderSlug);
    }
    if (!provider) {
      provider = await this.getProviderForServiceAndNetwork('data', network);
    }
    if (!provider) {
      throw new Error(`No active provider configured for ${targetProviderSlug || 'data purchase'}`);
    }

    const client = this.getHttpClient(provider);
    const ref = options.reference || `REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // QuicklySIM Topupmate Data Vending
    if (String(provider.slug || '').toLowerCase() === 'quicklysim' || String(provider.base_url || '').toLowerCase().includes('quicklysim')) {
      const netId = this.mapNetworkToQuicklysim(network);
      const cleanPhone = String(phone).replace(/\D/g, '');
      let path = provider.endpoint_map?.data_purchase;
      if (!path || path === '/data' || path === '/api/data' || path === 'api/data') {
        path = '/topupmate/api/data';
      }

      const payload = {
        network: String(netId),
        phone: cleanPhone,
        mobile_number: cleanPhone,
        phone_number: cleanPhone,
        data_plan: String(planId),
        plan: String(planId),
        plan_id: String(planId),
        data_plan_id: String(planId),
        ref,
        ported_number: true,
      };

      logger.info(`[DynamicProvider] Purchasing data via QuicklySIM Topupmate at ${path}`, payload);
      try {
        let response;
        try {
          response = await client.post(path, payload);
        } catch (postErr) {
          const errStatus = postErr.response?.status;
          const errMsg = String(postErr.response?.data?.message || postErr.message || '');
          if ((errStatus === 404 || errMsg.toLowerCase().includes('could not be found')) && path !== '/api/data') {
            const fallbackPath = path === '/topupmate/api/data' ? '/api/data' : '/topupmate/api/data';
            logger.warn(`[DynamicProvider] QuicklySIM data endpoint ${path} returned 404, retrying at ${fallbackPath}`);
            response = await client.post(fallbackPath, payload);
          } else {
            throw postErr;
          }
        }
        const resData = response.data;
        const isOk =
          resData?.status === 'success' ||
          resData?.status === 200 ||
          resData?.success === true ||
          (resData?.message && String(resData.message).toLowerCase().includes('successful'));

        if (!isOk) {
          const rawErrMsg = resData?.message || resData?.msg || resData?.error || resData?.desc || resData?.reason || 'Data purchase could not be delivered on Peace Bundle';
          logger.warn(`[DynamicProvider] QuicklySIM data purchase failed: ${rawErrMsg}`, { status: response?.status, data: resData });
          const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Data purchase failed on Peace Bundle and was automatically reversed');
          return {
            success: false,
            provider: provider.name,
            error: errMsg,
            data: resData,
          };
        }

        return {
          success: true,
          provider: provider.name,
          data: resData,
          reference: resData?.ref || resData?.reference || resData?.data?.reference || ref,
        };
      } catch (err) {
        const errData = err.response?.data;
        const rawErrMsg = errData?.message || errData?.msg || errData?.error || errData?.desc || err.message;
        logger.error(`[DynamicProvider] QuicklySIM data purchase exception: ${rawErrMsg}`, { status: err.response?.status, data: errData });
        const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Data purchase failed on Peace Bundle and was automatically reversed');
        return {
          success: false,
          provider: provider.name,
          error: errMsg,
          data: errData,
        };
      }
    }

    // SMEPlug Data Vending
    if (String(provider.slug || '').toLowerCase() === 'smeplug' || String(provider.base_url || '').toLowerCase().includes('smeplug')) {
      const smeplugService = require('./smeplugService');
      const cleanPhone = String(phone).replace(/\D/g, '');
      logger.info(`[DynamicProvider] Routing Data purchase to Smeplug service: ${network} plan ${planId} to ${cleanPhone}`);
      const res = await smeplugService.purchaseData(network, planId, cleanPhone);
      const isOk = Boolean(res?.data?.status || res?.status === 'success' || res?.status === 200 || res?.success);
      return {
        success: isOk,
        provider: 'smeplug',
        data: res?.data || res,
        reference: res?.data?.reference || res?.data?.transaction_id || ref,
        error: isOk ? null : (res?.error || res?.data?.msg || res?.message || 'Smeplug data purchase failed'),
      };
    }

    // Generic / Legitdataway Provider Data Purchase
    const isLegitdataway =
      String(provider.slug || '').toLowerCase().includes('legit') ||
      String(provider.name || '').toLowerCase().includes('legit') ||
      String(provider.base_url || '').toLowerCase().includes('legitdataway');

    const netId = isLegitdataway
      ? this.mapNetworkToLegitdataway(network)
      : this.mapNetworkToQuicklysim(network);

    const cleanPhone = String(phone).replace(/\D/g, '');
    let path = provider.endpoint_map?.data_purchase || '/data';
    if (isLegitdataway && (!provider.endpoint_map?.data_purchase || provider.endpoint_map?.data_purchase === '/data')) {
      path = '/api/data';
    }

    const uniqueDataRequestId = `Data_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;
    const targetRequestId = isLegitdataway ? uniqueDataRequestId : (options.reference || ref || `Data_${Date.now()}`);

    let effectivePlanId = planId;
    if (isLegitdataway) {
      effectivePlanId = await this.resolveLegitdatawayPlanId(netId, planId, options.plan, amount);
    }

    const payload = {
      'request-id': targetRequestId,
      request_id: targetRequestId,
      requestId: targetRequestId,
      'Request-Id': targetRequestId,
      ident: targetRequestId,
      plan_id: String(effectivePlanId),
      plan: String(effectivePlanId),
      data_plan: isLegitdataway ? (isNaN(effectivePlanId) ? String(effectivePlanId) : parseInt(effectivePlanId, 10)) : String(effectivePlanId),
      data_plan_id: String(effectivePlanId),
      phone: cleanPhone,
      mobile_number: cleanPhone,
      phone_number: cleanPhone,
      network: isLegitdataway ? (isNaN(netId) ? String(netId) : parseInt(netId, 10)) : String(network).toLowerCase(),
      network_id: parseInt(netId, 10),
      network_name: String(network).toUpperCase(),
      amount,
      bypass: false,
      ref,
      reference: ref,
      Ported_number: true,
      ported_number: true,
      pin: provider.metadata?.transaction_pin || '',
    };

    const postHeaders = {
      'request-id': targetRequestId,
      'X-Request-Id': targetRequestId,
    };

    logger.info(`[DynamicProvider] Routing Data purchase to ${provider.name} at ${path}`, payload);
    try {
      let response;
      try {
        response = await client.post(path, payload, { headers: postHeaders });
      } catch (postErr) {
        const errStatus = postErr.response?.status;
        const errMsg = String(postErr.response?.data?.message || postErr.message || '');
        if ((errStatus === 404 || errMsg.toLowerCase().includes('could not be found')) && path !== '/topupmate/api/data' && path !== '/api/data') {
          const fallbackPath = isLegitdataway ? '/topupmate/api/data' : '/api/data';
          logger.warn(`[DynamicProvider] ${provider.name} data endpoint ${path} returned 404, retrying at ${fallbackPath}`);
          response = await client.post(fallbackPath, payload, { headers: postHeaders });
        } else {
          throw postErr;
        }
      }

      const resData = response.data;
      const statusLower = String(resData?.status || '').toLowerCase();
      const isOk =
        statusLower === 'success' ||
        statusLower === 'successful' ||
        statusLower === 'process' ||
        statusLower === 'processing' ||
        resData?.status === 200 ||
        resData?.success === true ||
        (resData?.message && (
          String(resData.message).toLowerCase().includes('successful') ||
          String(resData.message).toLowerCase().includes('process')
        ));

      if (!isOk) {
        const rawErrMsg = resData?.message || resData?.msg || resData?.error || resData?.desc || resData?.reason || `${provider.name} data purchase failed`;
        logger.warn(`[DynamicProvider] ${provider.name} data purchase failed: ${rawErrMsg}`, { status: response?.status, data: resData });
        const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Data purchase failed on Peace Bundle and was automatically reversed');
        return {
          success: false,
          provider: provider.name,
          error: errMsg,
          data: resData,
        };
      }

      return {
        success: true,
        provider: provider.name,
        data: resData,
        reference: resData?.['request-id'] || resData?.ident || resData?.reference || resData?.ref || resData?.data?.reference || targetRequestId || ref,
      };
    } catch (err) {
      const errData = err.response?.data;
      const rawErrMsg = errData?.message || errData?.msg || errData?.error || errData?.desc || err.message;
      logger.error(`[DynamicProvider] ${provider.name} data purchase exception: ${rawErrMsg}`, { status: err.response?.status, data: errData });
      const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Data purchase failed on Peace Bundle and was automatically reversed');
      return {
        success: false,
        provider: provider.name,
        error: errMsg,
        data: errData,
      };
    }
  }

  /**
   * VTU: Purchase Airtime via Active Dynamic Provider
   */
  async purchaseAirtime(network, amount, phone, options = {}) {
    let provider = null;
    if (options.providerSlug && options.providerSlug !== 'default' && options.providerSlug !== 'primary') {
      provider = await this.findProviderBySlug(options.providerSlug);
    }
    if (!provider) {
      provider = await this.getProviderForServiceAndNetwork('airtime', network);
    }
    if (!provider) {
      throw new Error('No active airtime provider configured');
    }

    const client = this.getHttpClient(provider);
    const ref = options.reference || `AIR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    if (String(provider.slug || '').toLowerCase() === 'quicklysim' || String(provider.base_url || '').toLowerCase().includes('quicklysim')) {
      let path = provider.endpoint_map?.airtime_purchase;
      if (!path || path === '/airtime' || path === '/api/airtime' || path === 'api/airtime') {
        path = '/topupmate/api/airtime';
      }
      const cleanPhone = String(phone).replace(/\D/g, '');
      const netId = this.mapNetworkToQuicklysim(network);
      const payload = {
        network: String(netId),
        network_id: parseInt(netId, 10),
        phone: cleanPhone,
        mobile_number: cleanPhone,
        phone_number: cleanPhone,
        amount: String(amount),
        airtime_type: 'VTU',
        ported_number: true,
        ref,
      };

      logger.info(`[DynamicProvider] Purchasing airtime via QuicklySIM at ${path}`, payload);
      try {
        let response;
        try {
          response = await client.post(path, payload);
        } catch (postErr) {
          const errStatus = postErr.response?.status;
          const errMsg = String(postErr.response?.data?.message || postErr.message || '');
          if ((errStatus === 404 || errMsg.toLowerCase().includes('could not be found')) && path !== '/api/topup') {
            const fallbackPath = path === '/topupmate/api/airtime' ? '/api/topup' : '/topupmate/api/airtime';
            logger.warn(`[DynamicProvider] QuicklySIM airtime endpoint ${path} returned 404, retrying at fallback ${fallbackPath}`);
            response = await client.post(fallbackPath, payload);
          } else {
            throw postErr;
          }
        }
        const resData = response.data;
        const isOk =
          resData?.status === 'success' ||
          resData?.status === 200 ||
          resData?.success === true ||
          (resData?.message && String(resData.message).toLowerCase().includes('successful'));

        if (!isOk) {
          const rawErrMsg = resData?.message || resData?.msg || resData?.error || resData?.desc || resData?.reason || 'Airtime purchase could not be delivered on Peace Bundle';
          logger.warn(`[DynamicProvider] QuicklySIM airtime purchase failed: ${rawErrMsg}`, { status: response?.status, data: resData });
          const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Airtime purchase failed on Peace Bundle and was automatically reversed');
          return {
            success: false,
            provider: provider.name,
            error: errMsg,
            data: resData,
          };
        }

        return {
          success: true,
          provider: provider.name,
          data: resData,
          reference: resData?.ref || ref,
        };
      } catch (err) {
        const errData = err.response?.data;
        const rawErrMsg = errData?.message || errData?.msg || errData?.error || errData?.desc || err.message;
        logger.error(`[DynamicProvider] QuicklySIM airtime purchase exception: ${rawErrMsg}`, { status: err.response?.status, data: errData });
        const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Airtime purchase failed on Peace Bundle and was automatically reversed');
        return {
          success: false,
          provider: provider.name,
          error: errMsg,
          data: errData,
        };
      }
    }

    // SMEPlug Airtime Vending
    if (String(provider.slug || '').toLowerCase() === 'smeplug' || String(provider.base_url || '').toLowerCase().includes('smeplug')) {
      const smeplugService = require('./smeplugService');
      const cleanPhone = String(phone).replace(/\D/g, '');
      logger.info(`[DynamicProvider] Routing Airtime purchase to Smeplug service: ${network} ${amount} to ${cleanPhone}`);
      const res = await smeplugService.purchaseVTU(network, cleanPhone, amount);
      const isOk = Boolean(res?.data?.status || res?.status === 'success' || res?.status === 200 || res?.success);
      return {
        success: isOk,
        provider: 'smeplug',
        data: res?.data || res,
        reference: res?.data?.reference || res?.data?.transaction_id || ref,
        error: isOk ? null : (res?.error || res?.data?.msg || res?.message || 'Smeplug airtime purchase failed'),
      };
    }

    // Generic / Legitdataway Provider Airtime Purchase
    const isLegitdataway =
      String(provider.slug || '').toLowerCase().includes('legit') ||
      String(provider.name || '').toLowerCase().includes('legit') ||
      String(provider.base_url || '').toLowerCase().includes('legitdataway');

    const netId = isLegitdataway
      ? this.mapNetworkToLegitdataway(network)
      : this.mapNetworkToQuicklysim(network);

    const cleanPhone = String(phone).replace(/\D/g, '');
    let path = provider.endpoint_map?.airtime_purchase || '/airtime';
    if (isLegitdataway && (!provider.endpoint_map?.airtime_purchase || provider.endpoint_map?.airtime_purchase === '/airtime' || provider.endpoint_map?.airtime_purchase === '/api/airtime')) {
      path = '/api/topup';
    }

    const uniqueAirtimeRequestId = `Airtime_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;
    const targetRequestId = isLegitdataway ? uniqueAirtimeRequestId : (options.reference || ref || `Airtime_${Date.now()}`);

    const payload = {
      'request-id': targetRequestId,
      request_id: targetRequestId,
      requestId: targetRequestId,
      'Request-Id': targetRequestId,
      ident: targetRequestId,
      network: isLegitdataway ? (isNaN(netId) ? String(netId) : parseInt(netId, 10)) : String(network).toLowerCase(),
      network_id: parseInt(netId, 10),
      network_name: String(network).toUpperCase(),
      amount: isLegitdataway ? (isNaN(amount) ? amount : Number(amount)) : String(amount),
      phone: cleanPhone,
      mobile_number: cleanPhone,
      phone_number: cleanPhone,
      airtime_type: 'VTU',
      plan_type: 'VTU',
      bypass: false,
      ref,
      reference: ref,
      Ported_number: true,
      ported_number: true,
      pin: provider.metadata?.transaction_pin || '',
    };

    const postHeaders = {
      'request-id': targetRequestId,
      'X-Request-Id': targetRequestId,
    };

    logger.info(`[DynamicProvider] Routing Airtime purchase to ${provider.name} at ${path}`, payload);
    try {
      let response;
      try {
        response = await client.post(path, payload, { headers: postHeaders });
      } catch (postErr) {
        const errStatus = postErr.response?.status;
        const errMsg = String(postErr.response?.data?.message || postErr.message || '');
        if ((errStatus === 404 || errMsg.toLowerCase().includes('could not be found')) && path !== '/topupmate/api/airtime' && path !== '/api/topup') {
          const fallbackPath = isLegitdataway ? '/api/topup' : '/topupmate/api/airtime';
          logger.warn(`[DynamicProvider] ${provider.name} airtime endpoint ${path} returned 404, retrying at ${fallbackPath}`);
          response = await client.post(fallbackPath, payload, { headers: postHeaders });
        } else {
          throw postErr;
        }
      }

      const resData = response.data;
      const statusLower = String(resData?.status || '').toLowerCase();
      const isOk =
        statusLower === 'success' ||
        statusLower === 'successful' ||
        statusLower === 'process' ||
        statusLower === 'processing' ||
        resData?.status === 200 ||
        resData?.success === true ||
        (resData?.message && (
          String(resData.message).toLowerCase().includes('successful') ||
          String(resData.message).toLowerCase().includes('process')
        ));

      if (!isOk) {
        const rawErrMsg = resData?.message || resData?.msg || resData?.error || resData?.desc || resData?.reason || `${provider.name} airtime purchase failed`;
        logger.warn(`[DynamicProvider] ${provider.name} airtime purchase failed: ${rawErrMsg}`, { status: response?.status, data: resData });
        const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Airtime purchase failed on Peace Bundle and was automatically reversed');
        return {
          success: false,
          provider: provider.name,
          error: errMsg,
          data: resData,
        };
      }

      return {
        success: true,
        provider: provider.name,
        data: resData,
        reference: resData?.['request-id'] || resData?.ident || resData?.reference || resData?.ref || resData?.data?.reference || targetRequestId || ref,
      };
    } catch (err) {
      const errData = err.response?.data;
      const rawErrMsg = errData?.message || errData?.msg || errData?.error || errData?.desc || err.message;
      logger.error(`[DynamicProvider] ${provider.name} airtime purchase exception: ${rawErrMsg}`, { status: err.response?.status, data: errData });
      const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg, 'Airtime purchase failed on Peace Bundle and was automatically reversed');
      return {
        success: false,
        provider: provider.name,
        error: errMsg,
        data: errData,
      };
    }
  }

  /**
   * Test live connectivity and credentials for a provider
   * @param {string|number|object} target - Provider ID, slug, or unsaved provider data object
   */
  async testProviderConnection(target) {
    let provider = null;
    if (typeof target === 'string' || typeof target === 'number') {
      provider = await ApiProvider.findByPk(target);
      if (!provider) {
        provider = await this.findProviderBySlug(String(target), false);
      }
    } else if (typeof target === 'object' && target !== null) {
      provider = target;
    }

    if (!provider) {
      return { success: false, message: 'Provider not found' };
    }

    const slugLower = String(provider.slug || provider.name || '').toLowerCase();
    const urlLower = String(provider.base_url || '').toLowerCase();
    const client = this.getHttpClient(provider);

    try {
      // 1. QuicklySIM test
      if (slugLower.includes('quicklysim') || urlLower.includes('quicklysim')) {
        const res = await client.get('/topupmate/api/user').catch(() => client.get('/api/user'));
        const uData = res.data?.data || res.data?.user || res.data || {};
        const bal = uData?.balance ?? uData?.wallet_balance;
        return {
          success: true,
          message: bal !== undefined
            ? `Connection successful! Live QuicklySIM balance: ₦${Number(bal).toLocaleString()}`
            : 'Connection successful to QuicklySIM!',
          data: res.data,
        };
      }

      // 2. Smeplug test
      if (slugLower.includes('smeplug') || urlLower.includes('smeplug')) {
        const smeplugService = require('./smeplugService');
        const balRes = await smeplugService.getWalletBalance().catch((e) => ({ error: e.message }));
        if (balRes?.success !== false && (balRes?.balance !== undefined || balRes?.data?.balance !== undefined)) {
          const bal = balRes?.balance ?? balRes?.data?.balance;
          return {
            success: true,
            message: `Connection successful to Smeplug! Live wallet balance: ₦${Number(bal).toLocaleString()}`,
            data: balRes,
          };
        }
      }

      // 3. Legitdataway test
      if (slugLower.includes('legit') || urlLower.includes('legitdataway') || String(provider.name || '').toLowerCase().includes('legit')) {
        try {
          // Probe via /api/topup with test phone to verify API key and retrieve live balance safely
          const probeRes = await client.post('/api/topup', {
            network: 3,
            phone: '08000000000',
            plan_type: 'VTU',
            amount: 50,
            bypass: true,
            'request-id': `Probe_${Date.now()}`,
          });

          const pData = probeRes.data || {};
          const bal = pData?.oldbal ?? pData?.newbal;
          if (bal !== undefined && bal !== null) {
            return {
              success: true,
              message: `Connection successful to Legitdataway! Live balance: ₦${Number(bal).toLocaleString()}`,
              data: pData,
            };
          }

          if (pData.status === 'success' || probeRes.status === 200 || (pData.status === 'fail' && !String(pData.message || '').toLowerCase().includes('invalid api'))) {
            return {
              success: true,
              message: 'Connection successful to Legitdataway! API key verified.',
              data: pData,
            };
          }

          return {
            success: false,
            message: pData.message || 'Authentication failed: Invalid API Key on Legitdataway',
          };
        } catch (apiErr) {
          const errRes = apiErr.response?.data;
          if (apiErr.response?.status === 401 || apiErr.response?.status === 403 || (errRes?.message && String(errRes.message).toLowerCase().includes('invalid api'))) {
            return {
              success: false,
              message: errRes?.message || 'Unauthorized: API Key rejected by Legitdataway',
            };
          }
          return {
            success: true,
            message: 'Connected to Legitdataway API server successfully.',
            data: errRes || apiErr.message,
          };
        }
      }

      // 4. Generic provider test
      const balancePath = provider.endpoint_map?.balance || '/balance';
      try {
        const res = await client.get(balancePath);
        return {
          success: true,
          message: `Connection successful to ${provider.name || 'Provider'}`,
          data: res.data,
        };
      } catch (genErr) {
        if (genErr.response && genErr.response.status < 500) {
          if (genErr.response.status === 401 || genErr.response.status === 403) {
            return {
              success: false,
              message: genErr.response.data?.message || 'Authentication failed: Invalid API credentials',
            };
          }
          return {
            success: true,
            message: `Provider endpoint reached (HTTP ${genErr.response.status})`,
            data: genErr.response.data,
          };
        }
        throw genErr;
      }
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'Connection test failed',
      };
    }
  }
}

module.exports = new DynamicProviderService();
