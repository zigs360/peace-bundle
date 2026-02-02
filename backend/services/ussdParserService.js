const winston = require('winston');

// Configure logger (reusing existing logger configuration pattern)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'ussd-parser-service' },
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

class USSDParserService {
  /**
   * Parse USSD response to extract balance
   * @param {string} provider
   * @param {string} ussdResponse
   * @returns {number|null}
   */
  parseBalance(provider, ussdResponse) {
    if (!ussdResponse) return null;
    
    const patterns = this.getPatterns(provider);
    
    for (const pattern of patterns) {
      const match = ussdResponse.match(pattern);
      if (match && match[1]) {
        // Remove commas and convert to float
        const balanceStr = match[1].replace(/,/g, '');
        const balance = parseFloat(balanceStr);
        
        if (!isNaN(balance)) {
          return balance;
        }
      }
    }
    
    return null; // Could not parse
  }

  /**
   * Get regex patterns per provider
   * @param {string} provider
   * @returns {RegExp[]}
   */
  getPatterns(provider) {
    // JavaScript regex syntax adaptation
    const patterns = {
      'mtn': [
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /balance.*?([\d,]+\.?\d*)/i,
        /Your balance is.*?([\d,]+\.?\d*)/i,
        /Main Account.*?([\d,]+\.?\d*)/i,
      ],
      'airtel': [
        /Main Account:\s*₦\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /balance.*?([\d,]+\.?\d*)/i,
        /Airtime Balance.*?([\d,]+\.?\d*)/i,
      ],
      'glo': [
        /Balance:\s*N\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /Your balance.*?([\d,]+\.?\d*)/i,
      ],
      '9mobile': [
        /Airtime Bal:\s*₦\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /balance.*?([\d,]+\.?\d*)/i,
      ],
    };

    return patterns[provider.toLowerCase()] || patterns['mtn'];
  }

  /**
   * Validate Nigerian phone number format
   * @param {string} phone
   * @returns {boolean}
   */
  validatePhoneNumber(phone) {
    // Remove spaces and dashes
    phone = phone.replace(/[\s-]/g, '');

    // Nigerian format: 070xxxxxxxx, 080xxxxxxxx, 090xxxxxxxx, 081xxxxxxxx
    const regex = /^0[7-9][0-1]\d{8}$/;
    return regex.test(phone);
  }

  /**
   * Format phone number to standard format
   * @param {string} phone
   * @returns {string}
   */
  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    phone = phone.replace(/\D/g, '');

    // Add leading 0 if missing (e.g. 8031234567 -> 08031234567)
    if (phone.length === 10 && phone[0] !== '0') {
      phone = '0' + phone;
    }

    // Remove country code if present (e.g. 2348031234567 -> 08031234567)
    if (phone.length === 13 && phone.substring(0, 3) === '234') {
      phone = '0' + phone.substring(3);
    }

    return phone;
  }

  /**
   * Detect provider from phone number
   * @param {string} phone
   * @returns {string|null}
   */
  detectProvider(phone) {
    phone = this.formatPhoneNumber(phone);
    
    if (phone.length < 4) return null;

    const prefixes = {
      'mtn': ['0703', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906'],
      'airtel': ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0912'],
      'glo': ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
      '9mobile': ['0809', '0817', '0818', '0909', '0908'],
    };

    const prefix = phone.substring(0, 4);

    for (const [provider, codes] of Object.entries(prefixes)) {
      if (codes.includes(prefix)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Get USSD codes for checking balance
   * @param {string} provider
   * @param {string} type - 'airtime' or 'data'
   * @returns {string}
   */
  getBalanceUSSDCode(provider, type = 'airtime') {
    const codes = {
      'mtn': {
        'airtime': '*310#',
        'data': '*323#',
      },
      'airtel': {
        'airtime': '*310#',
        'data': '*323#',
      },
      'glo': {
        'airtime': '*310#',
        'data': '*323#',
      },
      '9mobile': {
        'airtime': '*310#',
        'data': '*323#',
      },
    };

    return (codes[provider.toLowerCase()] && codes[provider.toLowerCase()][type]) || '*310#';
  }

  /**
   * Detect if USSD response indicates SIM is banned/restricted
   * @param {string} ussdResponse
   * @returns {boolean}
   */
  isBannedResponse(ussdResponse) {
    if (!ussdResponse) return false;
    
    const bannedKeywords = [
      'barred',
      'blocked',
      'suspended',
      'restricted',
      'service not allowed',
      'account suspended',
      'sim blocked',
      'invalid',
      'error',
    ];

    const response = ussdResponse.toLowerCase();

    for (const keyword of bannedKeywords) {
      if (response.includes(keyword)) {
        return true;
      }
    }

    return false;
  }
}

module.exports = new USSDParserService();
