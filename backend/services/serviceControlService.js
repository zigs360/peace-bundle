const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

const CANONICAL_NETWORKS = ['mtn', 'airtel', 'glo', '9mobile'];
const CANONICAL_SERVICES = ['data', 'airtime'];

const NETWORK_ALIASES = {
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  '9mobile': '9mobile',
  t2: '9mobile',
  telecel: '9mobile',
  etisalat: '9mobile',
};

class ServiceControlService {
  /**
   * Normalize network name into canonical form ('mtn', 'airtel', 'glo', '9mobile')
   * @param {string} network
   * @returns {string|null}
   */
  normalizeNetwork(network) {
    if (!network) return null;
    const clean = String(network).trim().toLowerCase();
    return NETWORK_ALIASES[clean] || (CANONICAL_NETWORKS.includes(clean) ? clean : null);
  }

  /**
   * Normalize service type ('data', 'airtime')
   * @param {string} serviceType
   * @returns {string|null}
   */
  normalizeServiceType(serviceType) {
    if (!serviceType) return null;
    const clean = String(serviceType).trim().toLowerCase();
    return CANONICAL_SERVICES.includes(clean) ? clean : null;
  }

  /**
   * Generate setting key for a service and network pair
   * @param {string} serviceType
   * @param {string} network
   * @returns {string}
   */
  getSettingKey(serviceType, network) {
    const s = this.normalizeServiceType(serviceType);
    const n = this.normalizeNetwork(network);
    return `service_${s}_${n}`;
  }

  /**
   * Check if a specific service on a specific network is currently enabled
   * Both master switch and specific network switch must be true.
   * @param {string} serviceType - 'data' | 'airtime'
   * @param {string} network - 'mtn' | 'airtel' | 'glo' | '9mobile'
   * @returns {Promise<boolean>}
   */
  async isServiceEnabled(serviceType, network) {
    const s = this.normalizeServiceType(serviceType);
    const n = this.normalizeNetwork(network);

    if (!s || !n) {
      return false;
    }

    // Check Master Switch
    const masterKey = s === 'data' ? 'data_purchase_enabled' : 'airtime_purchase_enabled';
    const masterVal = await SystemSetting.get(masterKey, true);
    const isMasterActive = masterVal !== false && masterVal !== 'false';
    if (!isMasterActive) {
      return false;
    }

    // Check Individual Switch
    const specificKey = this.getSettingKey(s, n);
    const specificVal = await SystemSetting.get(specificKey, true);
    return specificVal !== false && specificVal !== 'false';
  }

  /**
   * Assert service availability before proceeding with purchase.
   * Throws an error with statusCode 403 if disabled.
   * Admin users bypass this check.
   * @param {string} serviceType
   * @param {string} network
   * @param {Object} user
   */
  async assertServiceAvailable(serviceType, network, user = null) {
    if (user && String(user.role || '').toLowerCase() === 'admin') {
      return;
    }

    const s = this.normalizeServiceType(serviceType);
    const n = this.normalizeNetwork(network);

    if (!s || !n) {
      const err = new Error(`Invalid service type (${serviceType}) or network (${network})`);
      err.statusCode = 400;
      throw err;
    }

    // Master Switch Check
    const masterKey = s === 'data' ? 'data_purchase_enabled' : 'airtime_purchase_enabled';
    const masterVal = await SystemSetting.get(masterKey, true);
    if (masterVal === false || masterVal === 'false') {
      const serviceLabel = s === 'data' ? 'Data purchases' : 'Airtime purchases';
      const err = new Error(`${serviceLabel} are temporarily disabled by the Administrator. Please try again later.`);
      err.statusCode = 403;
      throw err;
    }

    // Network Switch Check
    const specificKey = this.getSettingKey(s, n);
    const specificVal = await SystemSetting.get(specificKey, true);
    if (specificVal === false || specificVal === 'false') {
      const networkLabel = n === '9mobile' ? '9mobile (T2)' : n.toUpperCase();
      const serviceLabel = s === 'data' ? 'data bundle' : 'airtime';
      const err = new Error(`${networkLabel} ${serviceLabel} service is temporarily unavailable. Please try again later.`);
      err.statusCode = 403;
      throw err;
    }
  }

  /**
   * Get statuses of all 8 switches and 2 master switches
   * @returns {Promise<Object>}
   */
  async getAllServiceStatuses() {
    const masterData = await SystemSetting.get('data_purchase_enabled', true);
    const masterAirtime = await SystemSetting.get('airtime_purchase_enabled', true);

    const statuses = {
      master: {
        data: masterData !== false && masterData !== 'false',
        airtime: masterAirtime !== false && masterAirtime !== 'false',
      },
      data: {},
      airtime: {},
    };

    for (const net of CANONICAL_NETWORKS) {
      const dataVal = await SystemSetting.get(`service_data_${net}`, true);
      const airtimeVal = await SystemSetting.get(`service_airtime_${net}`, true);
      statuses.data[net] = dataVal !== false && dataVal !== 'false';
      statuses.airtime[net] = airtimeVal !== false && airtimeVal !== 'false';
    }

    return statuses;
  }

  /**
   * Toggle a specific network service switch
   * @param {string} serviceType - 'data' | 'airtime'
   * @param {string} network - 'mtn' | 'airtel' | 'glo' | '9mobile'
   * @param {boolean} enabled
   * @param {Object} [adminUser]
   */
  async toggleService(serviceType, network, enabled, adminUser = null) {
    const s = this.normalizeServiceType(serviceType);
    const n = this.normalizeNetwork(network);

    if (!s || !n) {
      throw new Error(`Invalid service type (${serviceType}) or network (${network})`);
    }

    const key = this.getSettingKey(s, n);
    const boolValue = Boolean(enabled);
    const stringValue = boolValue ? 'true' : 'false';

    await SystemSetting.set(
      key,
      stringValue,
      'boolean',
      'services',
      `Enable or disable ${n.toUpperCase()} ${s} service`
    );

    logger.info(`[ServiceControl] Switch updated: ${key} = ${stringValue}`, {
      adminId: adminUser?.id || null,
      adminEmail: adminUser?.email || null,
    });

    return {
      serviceType: s,
      network: n,
      key,
      enabled: boolValue,
    };
  }
}

module.exports = new ServiceControlService();
