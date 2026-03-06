const logger = require('../utils/logger');

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
        /Bal:.*?([\d,]+\.?\d*)/i,
      ],
      'airtel': [
        /Main Account:\s*₦\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /balance.*?([\d,]+\.?\d*)/i,
        /Airtime Balance.*?([\d,]+\.?\d*)/i,
        /Bal:.*?([\d,]+\.?\d*)/i,
      ],
      'glo': [
        /Balance:\s*N\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /Your balance.*?([\d,]+\.?\d*)/i,
        /Bal:.*?([\d,]+\.?\d*)/i,
      ],
      '9mobile': [
        /Airtime Bal:\s*₦\s*([\d,]+\.?\d*)/i,
        /(?:NGN|₦|N)\s*([\d,]+\.?\d*)/i,
        /balance.*?([\d,]+\.?\d*)/i,
        /Bal:.*?([\d,]+\.?\d*)/i,
      ],
    };

    return patterns[provider.toLowerCase()] || patterns['mtn'];
  }

  formatPhoneNumber(phone) {
    if (!phone) return '';
    // Remove all non-numeric characters except +
    let clean = phone.replace(/[^0-9\+]/g, '');
    
    // Handle +234
    if (clean.startsWith('+234')) {
      clean = '0' + clean.slice(4);
    }
    // Handle 234
    if (clean.startsWith('234') && clean.length > 10) {
      clean = '0' + clean.slice(3);
    }
    // Handle 10 digit numbers (missing leading 0)
    if (clean.length === 10 && !clean.startsWith('0')) {
      clean = '0' + clean;
    }
    
    return clean;
  }

  /**
   * Validate a Nigerian phone number
   * @param {string} phone 
   * @returns {boolean}
   */
  validatePhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    // Standard 11-digit Nigerian number starting with 0
    return /^0\d{10}$/.test(formatted);
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
      'mtn': ['0703', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0702', '0704'],
      'airtel': ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0912', '0911'],
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
