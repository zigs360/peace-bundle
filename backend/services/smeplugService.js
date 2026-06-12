const axios = require('axios');
const logger = require('../utils/logger');

const stripNonPrintable = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) {
      out += s[i];
    }
  }
  return out;
};

class SmeplugService {
  constructor() {
    this.baseUrl = (process.env.SMEPLUG_BASE_URL || 'https://smeplug.ng').trim();
    this.privateKey = stripNonPrintable(process.env.SMEPLUG_PRIVATE_KEY || '');
    this.apiKey = stripNonPrintable(process.env.SMEPLUG_API_KEY || '');
    this.publicKey = stripNonPrintable(process.env.SMEPLUG_PUBLIC_KEY || '');
    this.secretKey = stripNonPrintable(process.env.SMEPLUG_SECRET_KEY || '');
    this.timeout = parseInt(process.env.SMEPLUG_TIMEOUT) || 30000; // Default 30s
  }

  refreshCredentials() {
    this.privateKey = stripNonPrintable(process.env.SMEPLUG_PRIVATE_KEY || this.privateKey || '');
    this.apiKey = stripNonPrintable(process.env.SMEPLUG_API_KEY || this.apiKey || '');
    this.publicKey = stripNonPrintable(process.env.SMEPLUG_PUBLIC_KEY || this.publicKey || '');
    this.secretKey = stripNonPrintable(process.env.SMEPLUG_SECRET_KEY || this.secretKey || '');
  }

  requiresPrivilegedAuth(endpoint, data = {}) {
    if (endpoint !== '/api/v1/airtime/purchase' && endpoint !== '/api/v1/vtu') {
      return false;
    }
    const mode = String(data?.mode || 'wallet').toLowerCase();
    return !data?.sim_number && mode === 'wallet';
  }

  getAuthToken(endpoint = '', data = {}) {
    this.refreshCredentials();
    if (this.privateKey) return { token: this.privateKey, source: 'private_key' };
    if (this.secretKey) return { token: this.secretKey, source: 'secret_key' };
    if (this.requiresPrivilegedAuth(endpoint, data)) {
      return {
        token: '',
        source: 'missing',
        error: 'SMEPlug wallet airtime requires SMEPLUG_PRIVATE_KEY or SMEPLUG_SECRET_KEY. Refusing to fall back to SMEPLUG_API_KEY.',
      };
    }
    if (this.apiKey) return { token: this.apiKey, source: 'api_key' };
    return {
      token: '',
      source: 'missing',
      error: 'SMEPlug authentication is missing. Set SMEPLUG_PRIVATE_KEY, SMEPLUG_SECRET_KEY, or SMEPLUG_API_KEY.',
    };
  }

  getAuthFingerprint(auth = null) {
    const crypto = require('crypto');
    const key = String(auth?.token || '');
    if (!key) {
      return {
        source: auth?.source || 'missing',
        length: 0,
        sha256: null,
      };
    }
    return {
      source: auth?.source || 'unknown',
      length: key.length,
      sha256: crypto.createHash('sha256').update(key).digest('hex').slice(0, 12),
    };
  }

  /**
   * Get account balance
   */
  async getBalance() {
    return this.makeRequest('GET', '/api/v1/account/balance');
  }

  /**
   * Get available data plans
   * @param {string} [provider]
   */
  async getDataPlans(provider = null) {
    const endpoint = '/api/v1/data/plans';
    const params = provider ? { network_id: this.getNetworkId(provider) } : {};
    
    return this.makeRequest('GET', endpoint, params);
  }

  /**
   * Purchase data
   * @param {string} provider
   * @param {string} phone
   * @param {string} plan_id
   * @param {string} [mode='wallet']
   * @param {Object} [options={}] - Additional options like sim_number
   */
  async purchaseData(provider, phone, plan_id, mode = 'wallet', options = {}) {
    const data = {
      network_id: this.getNetworkId(provider),
      plan_id,
      phone,
      mode,
      ...options
    };
    return this.makeRequest('POST', '/api/v1/data/purchase', data);
  }

  /**
   * Purchase airtime
   * @param {string} provider
   * @param {string} phone
   * @param {number} amount
   * @param {string} [mode='wallet']
   * @param {Object} [options={}] - Additional options like sim_number
   */
  async purchaseAirtime(provider, phone, amount, mode = 'wallet', options = {}) {
    const data = {
      network_id: this.getNetworkId(provider),
      amount,
      phone,
    };
    if (mode && mode !== 'wallet') {
      data.mode = mode;
    }
    if (options && typeof options === 'object') {
      Object.assign(data, options);
    }
    return this.makeRequest('POST', '/api/v1/airtime/purchase', data);
  }

  /**
   * VTU Airtime Purchase
   * @param {string} provider
   * @param {string} phone
   * @param {number} amount
   * @param {Object} [options={}] - Additional options like mode, sim_number
   */
  async purchaseVTU(provider, phone, amount, options = {}) {
    const mode = String(options?.mode || 'wallet').toLowerCase();
    const network_id = this.getNetworkId(provider);
    const roundedAmount = Math.round(amount);

    if (mode === 'wallet' && !options?.sim_number) {
      const primary = await this.makeRequest('POST', '/api/v1/airtime/purchase', {
        network_id,
        phone,
        amount: roundedAmount,
      });
      if (primary?.success) return primary;

      const primaryStatus = Number(primary?.status_code || 0) || null;
      const primaryReference = primary?.data?.reference || primary?.data?.transaction_id || null;
      const shouldFallback =
        !primaryReference &&
        (primaryStatus === 400 || primaryStatus === 404 || primaryStatus === 405 || primaryStatus === 422 || primaryStatus === null);
      // #region debug-point smeplug-vtu-fallback-decision
      logger.warn('[Smeplug][Debug] VTU fallback decision', {
        mode,
        network_id,
        amount: roundedAmount,
        phoneMasked: phone ? `*******${String(phone).replace(/\D/g, '').slice(-4)}` : null,
        primaryStatus,
        primaryHasReference: Boolean(primaryReference),
        shouldFallback,
        primaryError: primary?.error || null,
        primaryMessage: primary?.data?.msg || primary?.data?.message || null,
      });
      // #endregion debug-point smeplug-vtu-fallback-decision
      if (!shouldFallback) return primary;

      logger.warn('[Smeplug] Airtime purchase endpoint failed, retrying VTU endpoint', {
        status: primaryStatus,
        error: primary?.error || null,
      });

      const fallbackPayload = {
        network_id,
        phone,
        phone_number: phone,
        amount: roundedAmount,
      };
      // #region debug-point smeplug-vtu-fallback-payload
      logger.warn('[Smeplug][Debug] VTU fallback payload', {
        network_id: fallbackPayload.network_id,
        amount: fallbackPayload.amount,
        phoneMasked: fallbackPayload.phone ? `*******${String(fallbackPayload.phone).replace(/\D/g, '').slice(-4)}` : null,
        phoneNumberMasked: fallbackPayload.phone_number ? `*******${String(fallbackPayload.phone_number).replace(/\D/g, '').slice(-4)}` : null,
        hasPhone: Boolean(fallbackPayload.phone),
        hasPhoneNumber: Boolean(fallbackPayload.phone_number),
      });
      // #endregion debug-point smeplug-vtu-fallback-payload

      return this.makeRequest('POST', '/api/v1/vtu', fallbackPayload);
    }

    const devicePayload = {
      network_id,
      phone,
      phone_number: phone,
      amount: roundedAmount,
      mode: options?.mode || 'wallet',
      ...options,
    };

    return this.makeRequest('POST', '/api/v1/airtime/purchase', devicePayload);
  }

  /**
   * Get available banks for transfer
   */
  async getBanks() {
    return this.makeRequest('GET', '/api/v1/transfer/banks');
  }

  /**
   * Resolve bank account
   * @param {string} bank_code
   * @param {string} account_number
   */
  async resolveAccount(bank_code, account_number) {
    const data = { bank_code, account_number };
    return this.makeRequest('POST', '/api/v1/transfer/resolveaccount', data);
  }

  /**
   * Send bank transfer
   * @param {Object} transferData
   */
  async sendTransfer(transferData) {
    // bank_code, account_number, amount, description, customer_reference
    return this.makeRequest('POST', '/api/v1/transfer/send', transferData);
  }

  /**
   * Get networks (Specifically /api/v1/networks)
   */
  async getNetworks() {
    return this.makeRequest('GET', '/api/v1/networks');
  }

  /**
   * Check transaction status (reference or customer_reference)
   * @param {string} reference
   */
  async checkTransactionStatus(reference) {
    return this.makeRequest('GET', `/api/v1/transactions/${reference}`);
  }

  /**
   * Get linked devices (SIMs) from Smeplug
   */
  async getLinkedDevices() {
    return this.makeRequest('GET', '/api/v1/devices');
  }

  /**
   * Get specific device details
   * @param {string} deviceId
   */
  async getDeviceDetails(deviceId) {
    return this.makeRequest('GET', `/api/v1/devices/${deviceId}`);
  }

  /**
   * Sync plans from Smeplug API
   */
  async syncPlans() {
    const allPlans = {};
    const providers = ['mtn', 'airtel', '9mobile', 'glo'];
    
    for (const provider of providers) {
      const result = await this.getDataPlans(provider);
      
      if (result.success) {
        allPlans[provider] = result.data;
      }
    }
    
    return {
      success: true,
      plans: allPlans,
    };
  }

  /**
   * Make HTTP request to Smeplug API
   * @param {string} method
   * @param {string} endpoint
   * @param {Object} [data]
   */
  async makeRequest(method, endpoint, data = {}, retryCount = 0) {
    const maxRetries = 2;
    const currentBaseUrl = (retryCount > 0 && this.baseUrl.includes('.ng'))
      ? this.baseUrl.replace('.ng', '.com')
      : this.baseUrl;
    let auth = { token: '', source: 'unresolved' };
    try {
      auth = this.getAuthToken(endpoint, data);
      const authHeader = auth.token;
      if (!authHeader) {
        throw new Error(auth.error || 'SMEPlug API/Secret Key is missing in environment variables');
      }

      const config = {
        method: method,
        url: `${currentBaseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: this.timeout
      };
      if (this.publicKey) {
        config.headers['Public-Key'] = this.publicKey;
      }

      if (method.toUpperCase() === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }

      // #region debug-point smeplug-request-context
      if (endpoint === '/api/v1/airtime/purchase' || endpoint === '/api/v1/vtu') {
        logger.warn('[Smeplug][Debug] Request context', {
          method,
          endpoint,
          retryCount,
          baseUrl: currentBaseUrl,
          authSource: auth.source,
          payload: method.toUpperCase() === 'GET'
            ? data
            : {
                network_id: data?.network_id ?? null,
                amount: data?.amount ?? null,
                phone: data?.phone ? `*******${String(data.phone).replace(/\D/g, '').slice(-4)}` : null,
                phone_number: data?.phone_number ? `*******${String(data.phone_number).replace(/\D/g, '').slice(-4)}` : null,
                mode: data?.mode ?? null,
                hasSimNumber: Boolean(data?.sim_number),
              },
          authFingerprint: this.getAuthFingerprint(auth),
        });
      }
      // #endregion debug-point smeplug-request-context

      const response = await axios(config);

      logger.info('Smeplug API Request', {
        method,
        endpoint,
        data: method.toUpperCase() === 'GET'
          ? data
          : {
              network_id: data?.network_id ?? null,
              amount: data?.amount ?? null,
              phone: data?.phone ? `*******${String(data.phone).replace(/\D/g, '').slice(-4)}` : null,
              phone_number: data?.phone_number ? `*******${String(data.phone_number).replace(/\D/g, '').slice(-4)}` : null,
              mode: data?.mode ?? null,
              hasSimNumber: Boolean(data?.sim_number),
            },
        status: response.status,
        response: response.data
      });

      return {
        success: true,
        data: response.data,
        status_code: response.status
      };

    } catch (error) {
      const errorResponse = error.response ? error.response.data : { message: error.message };
      const statusCode = error.response ? error.response.status : 500;

      // Handle DNS resolution failures (EAI_AGAIN, ENOTFOUND) or Timeouts with a retry
      if ((error.code === 'EAI_AGAIN' || error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED') && retryCount < maxRetries) {
        logger.warn(`Smeplug API DNS/Timeout Error. Retrying (${retryCount + 1}/${maxRetries})...`, {
          error: error.message,
          endpoint
        });
        return this.makeRequest(method, endpoint, data, retryCount + 1);
      }

      logger.error('Smeplug API Error', {
        endpoint,
        error: error.message,
        response: errorResponse,
        status: statusCode,
        // #region debug-point smeplug-api-error-context
        request: {
          method,
          data,
          retryCount,
          baseUrl: currentBaseUrl,
        },
        authFingerprint: this.getAuthFingerprint(auth),
        // #endregion debug-point smeplug-api-error-context
      });

      // Extract specific error messages if they exist in the response
      let errorMessage = `API request failed: ${error.message}`;
      if (errorResponse && errorResponse.message) {
        errorMessage = errorResponse.message;
      } else if (errorResponse && errorResponse.error) {
        errorMessage = errorResponse.error;
      } else if (errorResponse && typeof errorResponse === 'string') {
        errorMessage = errorResponse;
      }

      // Add hint if it's an authentication error
      if (statusCode === 401 || statusCode === 403) {
        errorMessage = `Authentication failed: ${errorMessage}. Please check SMEPlug API keys.`;
      }

      return {
        success: false,
        error: errorMessage,
        data: errorResponse,
        status_code: statusCode
      };
    }
  }

  /**
   * Map provider name to network_id
   * @param {string} provider
   */
  getNetworkId(provider) {
    const map = {
      'mtn': 1,
      'airtel': 2,
      '9mobile': 3,
      'glo': 4,
    };

    return map[provider.toLowerCase()] || 1;
  }

  /**
   * Map network_id to provider name
   * @param {number} networkId
   */
  getProviderName(networkId) {
    const map = {
      1: 'mtn',
      2: 'airtel',
      3: '9mobile',
      4: 'glo',
    };

    return map[networkId] || 'mtn';
  }

  getDiscoCode(name) {
    const map = {
      ikedc: 'IKEDC',
      ekedc: 'EKEDC',
      aedc: 'AEDC',
      ibedc: 'IBEDC',
      eedc: 'EEDC',
      kedco: 'KEDCO',
      jed: 'JEDC',
      jedc: 'JEDC',
      phed: 'PHED',
    };
    return map[name.toLowerCase()] || name.toUpperCase();
  }

  getCableCode(name) {
    const map = {
      dstv: 'DSTV',
      gotv: 'GOTV',
      startimes: 'STARTIMES',
    };
    return map[name.toLowerCase()] || name.toUpperCase();
  }

  async validateElectricityCustomer(provider, meterNumber, meterType) {
    const data = {
      disco: this.getDiscoCode(provider),
      meter_number: meterNumber,
      meter_type: meterType?.toLowerCase() === 'postpaid' ? 'POSTPAID' : 'PREPAID',
    };
    return this.makeRequest('POST', '/api/v1/power/validate', data);
  }

  async payElectricity(provider, meterNumber, amount, meterType, phone) {
    const data = {
      disco: this.getDiscoCode(provider),
      meter_number: meterNumber,
      meter_type: meterType?.toLowerCase() === 'postpaid' ? 'POSTPAID' : 'PREPAID',
      amount,
      phone,
      mode: 'wallet',
    };
    return this.makeRequest('POST', '/api/v1/power/purchase', data);
  }

  async validateCableCustomer(provider, smartCardNumber) {
    const data = {
      provider: this.getCableCode(provider),
      smartcard_number: smartCardNumber,
    };
    return this.makeRequest('POST', '/api/v1/cable/validate', data);
  }

  async payCable(provider, smartCardNumber, amount, phone, plan) {
    const data = {
      provider: this.getCableCode(provider),
      smartcard_number: smartCardNumber,
      amount,
      phone,
      plan: plan || 'subscription',
      mode: 'wallet',
    };
    return this.makeRequest('POST', '/api/v1/cable/purchase', data);
  }
}

module.exports = new SmeplugService();
