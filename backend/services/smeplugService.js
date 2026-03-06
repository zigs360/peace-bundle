const axios = require('axios');
const logger = require('../utils/logger');

class SmeplugService {
  constructor() {
    this.baseUrl = process.env.SMEPLUG_BASE_URL || 'https://smeplug.ng';
    this.apiKey = process.env.SMEPLUG_API_KEY;
    this.publicKey = process.env.SMEPLUG_PUBLIC_KEY;
    this.secretKey = process.env.SMEPLUG_SECRET_KEY;
    this.timeout = parseInt(process.env.SMEPLUG_TIMEOUT) || 30000; // Default 30s
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
      mode,
      ...options
    };
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
    const data = {
      network_id: this.getNetworkId(provider),
      phone: phone,
      phone_number: phone, // Send both to be safe
      amount: Math.round(amount),
      mode: options.mode || 'wallet',
      ...options
    };
    
    // Some SMEPlug versions use /api/v1/airtime/purchase for everything airtime-related
    // Fallback to /api/v1/vtu if needed, but airtime/purchase is more standard
    return this.makeRequest('POST', '/api/v1/airtime/purchase', data);
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
    try {
      const authHeader = this.apiKey || this.secretKey;
      if (!authHeader) {
        throw new Error('SMEPlug API/Secret Key is missing in environment variables');
      }

      // Use .ng as primary, .com as fallback if DNS fails
      const currentBaseUrl = (retryCount > 0 && this.baseUrl.includes('.ng')) 
        ? this.baseUrl.replace('.ng', '.com') 
        : this.baseUrl;

      const config = {
        method: method,
        url: `${currentBaseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Public-Key': this.publicKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: this.timeout
      };

      if (method.toUpperCase() === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }

      const response = await axios(config);

      logger.info('Smeplug API Request', {
        method,
        endpoint,
        data,
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
        status: statusCode
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
