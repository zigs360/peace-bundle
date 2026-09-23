const axios = require('axios');
const ApiProvider = require('../models/ApiProvider');
const logger = require('../utils/logger');

class DynamicProviderService {
  /**
   * Seed default system providers (Smeplug, Ogdams, QuicklySIM) if not present
   */
  async ensureDefaultProviders() {
    try {
      const defaults = [
        {
          name: 'QuicklySIM',
          slug: 'quicklysim',
          service_type: 'all',
          base_url: process.env.QUICKLYSIM_BASE_URL || 'https://www.quicklysim.com/api',
          api_key: process.env.QUICKLYSIM_API_KEY || '',
          secret_key: process.env.QUICKLYSIM_SECRET_KEY || '',
          capabilities: ['vtu_data', 'vtu_airtime', 'sim_hosting', 'ussd'],
          endpoint_map: {
            devices: '/devices',
            device_balance: '/devices/:id/balance',
            ussd: '/devices/:id/ussd',
            data_purchase: '/data',
            airtime_purchase: '/airtime',
            balance: '/balance',
          },
          is_active: true,
          is_primary: false,
          priority: 2,
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
          is_primary: true,
          priority: 1,
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
   * Get current primary active provider
   */
  async getPrimaryProvider() {
    await this.ensureDefaultProviders();
    return await ApiProvider.findOne({ where: { is_primary: true, is_active: true } });
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

    logger.info(`[DynamicProvider] Provider ${target.name} set as PRIMARY`);
    return target;
  }

  /**
   * Register or update a provider
   */
  async saveProvider(data) {
    if (data.id) {
      const p = await ApiProvider.findByPk(data.id);
      if (!p) throw new Error('Provider not found');
      return await p.update(data);
    }

    const slug = (data.slug || data.name).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const existing = await ApiProvider.findOne({ where: { slug } });
    if (existing) {
      return await existing.update(data);
    }

    return await ApiProvider.create({
      ...data,
      slug,
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

    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['x-api-key'] = provider.api_key;
      headers['api-key'] = provider.api_key;
    }
    if (provider.secret_key) {
      headers['x-secret-key'] = provider.secret_key;
      headers['api-secret'] = provider.secret_key;
    }

    return axios.create({
      baseURL: provider.base_url.replace(/\/+$/, ''),
      headers,
      timeout: 30000,
    });
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

      // Normalize device object fields
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
   * VTU: Purchase Data via Active Dynamic Provider
   */
  async purchaseData(plan, phone, network, options = {}) {
    const provider = await this.getActiveProvider('data');
    if (!provider) {
      throw new Error('No active data provider configured');
    }

    const client = this.getHttpClient(provider);
    const path = provider.endpoint_map?.data_purchase || '/data';

    const payload = {
      plan_id: plan.provider_plan_id || plan.id,
      phone,
      network: network.toLowerCase(),
      amount: plan.price || plan.admin_price,
      reference: options.reference,
    };

    logger.info(`[DynamicProvider] Routing Data purchase to ${provider.name}`, payload);
    const response = await client.post(path, payload);
    return {
      success: true,
      provider: provider.name,
      data: response.data,
      reference: response.data?.reference || response.data?.data?.reference || options.reference,
    };
  }

  /**
   * VTU: Purchase Airtime via Active Dynamic Provider
   */
  async purchaseAirtime(network, amount, phone, options = {}) {
    const provider = await this.getActiveProvider('airtime');
    if (!provider) {
      throw new Error('No active airtime provider configured');
    }

    const client = this.getHttpClient(provider);
    const path = provider.endpoint_map?.airtime_purchase || '/airtime';

    const payload = {
      network: network.toLowerCase(),
      amount,
      phone,
      reference: options.reference,
    };

    logger.info(`[DynamicProvider] Routing Airtime purchase to ${provider.name}`, payload);
    const response = await client.post(path, payload);
    return {
      success: true,
      provider: provider.name,
      data: response.data,
      reference: response.data?.reference || response.data?.data?.reference || options.reference,
    };
  }
}

module.exports = new DynamicProviderService();
