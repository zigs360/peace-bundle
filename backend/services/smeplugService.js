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
   * Purchase data (wallet mode or SIM mode)
   * @param {Object} data
   * @param {number} data.network_id
   * @param {string} data.plan_id
   * @param {string} data.phone
   * @param {string} data.mode - 'wallet', 'sim_system', 'device_based'
   * @param {string} [data.sim_number]
   */
  async purchaseData(data) {
    return this.makeRequest('POST', '/api/v1/data/purchase', data);
  }

  /**
   * Check transaction status
   * @param {string} reference
   */
  async checkTransactionStatus(reference) {
    return this.makeRequest('GET', `/api/v1/transactions/${reference}`);
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
          'Authorization': `Bearer ${this.apiKey}`,
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
