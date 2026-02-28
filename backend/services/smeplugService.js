const axios = require('axios');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'smeplug-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

class SmeplugService {
  constructor() {
    this.baseUrl = process.env.SMEPLUG_BASE_URL;
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
   * Purchase data (simplified)
   * @param {string} provider
   * @param {string} phone
   * @param {string} plan_id
   * @param {string} [mode='wallet']
   */
  async purchaseData(provider, phone, plan_id, mode = 'wallet') {
    const data = {
      network_id: this.getNetworkId(provider),
      plan_id,
      phone,
      mode
    };
    return this.makeRequest('POST', '/api/v1/data/purchase', data);
  }

  /**
   * Purchase airtime (using /api/v1/airtime/purchase or /api/v1/vtu)
   * @param {string} provider
   * @param {string} phone
   * @param {number} amount
   * @param {string} [mode='wallet']
   */
  async purchaseAirtime(provider, phone, amount, mode = 'wallet') {
    // Some SMEPlug docs show /api/v1/vtu for airtime as well
    const data = {
      network_id: this.getNetworkId(provider),
      amount,
      phone,
      mode
    };
    return this.makeRequest('POST', '/api/v1/airtime/purchase', data);
  }

  /**
   * VTU Airtime Purchase (Specifically /api/v1/vtu)
   */
  async purchaseVTU(provider, phone, amount) {
    const data = {
      network_id: this.getNetworkId(provider),
      phone_number: phone,
      amount
    };
    return this.makeRequest('POST', '/api/v1/vtu', data);
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
  async makeRequest(method, endpoint, data = {}) {
    try {
      const config = {
        method: method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey || this.secretKey}`,
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

      logger.error('Smeplug API Error', {
        endpoint,
        error: error.message,
        response: errorResponse,
        status: statusCode
      });

      return {
        success: false,
        error: errorResponse.message || 'API request failed',
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
}

module.exports = new SmeplugService();
