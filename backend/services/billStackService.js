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

class BillStackService {
  constructor() {
    this.baseUrl = (process.env.BILLSTACK_BASE_URL || process.env.BILL_STACK_BASE_URL || '').trim();
    this.secretKey = stripNonPrintable(process.env.BILLSTACK_SECRET_KEY || process.env.BILL_STACK_SECRET_KEY || '');
    this.publicKey = stripNonPrintable(process.env.BILLSTACK_PUBLIC_KEY || process.env.BILL_STACK_PUBLIC_KEY || '');
    this.timeoutMs = parseInt(process.env.BILLSTACK_TIMEOUT_MS || '30000', 10);
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.secretKey);
  }

  client() {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'x-api-key': this.secretKey,
        'x-public-key': this.publicKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async request(method, url, data, params) {
    if (!this.isConfigured()) {
      throw new Error('BillStack is not configured');
    }

    try {
      const res = await this.client().request({ method, url, data, params });
      return { success: true, data: res.data };
    } catch (e) {
      const status = e.response?.status;
      const payload = e.response?.data;
      const message = payload?.message || payload?.error || e.message || 'BillStack request failed';
      logger.error('[BillStack] Request failed', { method, url, status, message });
      return { success: false, error: message, status, data: payload };
    }
  }

  normalizeDisco(provider) {
    return String(provider || '').trim().toUpperCase();
  }

  normalizeCable(provider) {
    return String(provider || '').trim().toUpperCase();
  }

  async validateElectricityCustomer(provider, meterNumber, meterType) {
    const payload = {
      disco: this.normalizeDisco(provider),
      meter_number: String(meterNumber || '').trim(),
      meter_type: String(meterType || 'Prepaid').toLowerCase() === 'postpaid' ? 'POSTPAID' : 'PREPAID',
    };
    const url = process.env.BILLSTACK_VALIDATE_ELECTRICITY_PATH || '/power/validate';
    return this.request('POST', url, payload);
  }

  async payElectricity(provider, meterNumber, amount, meterType, phone) {
    const payload = {
      disco: this.normalizeDisco(provider),
      meter_number: String(meterNumber || '').trim(),
      meter_type: String(meterType || 'Prepaid').toLowerCase() === 'postpaid' ? 'POSTPAID' : 'PREPAID',
      amount: Number(amount),
      phone: String(phone || '').trim(),
    };
    const url = process.env.BILLSTACK_PAY_ELECTRICITY_PATH || '/power/purchase';
    return this.request('POST', url, payload);
  }

  async validateCableCustomer(provider, smartCardNumber) {
    const payload = {
      provider: this.normalizeCable(provider),
      smartcard_number: String(smartCardNumber || '').trim(),
    };
    const url = process.env.BILLSTACK_VALIDATE_CABLE_PATH || '/cable/validate';
    return this.request('POST', url, payload);
  }

  async payCable(provider, smartCardNumber, amount, phone, plan) {
    const payload = {
      provider: this.normalizeCable(provider),
      smartcard_number: String(smartCardNumber || '').trim(),
      amount: Number(amount),
      phone: String(phone || '').trim(),
      plan: plan || 'subscription',
    };
    const url = process.env.BILLSTACK_PAY_CABLE_PATH || '/cable/purchase';
    return this.request('POST', url, payload);
  }
}

module.exports = new BillStackService();
