const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');

class BillstackVirtualAccountService {
  constructor() {
    this.baseUrl = process.env.BILLSTACK_BASE_URL || process.env.BILL_STACK_BASE_URL || 'https://api.billstack.co/v2/thirdparty';
    this.secretKey = process.env.BILLSTACK_SECRET_KEY || process.env.BILL_STACK_SECRET_KEY || '';
    this.publicKey = process.env.BILLSTACK_PUBLIC_KEY || process.env.BILL_STACK_PUBLIC_KEY || '';
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

  clientWithTimeout(timeoutMs) {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'x-api-key': this.secretKey,
        'x-public-key': this.publicKey,
        'Content-Type': 'application/json',
      },
    });
  }

  splitName(fullName) {
    const raw = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!raw) return { firstName: 'User', lastName: 'PeaceBundlle' };
    const parts = raw.split(' ');
    const firstName = parts[0] || 'User';
    const lastName = parts.slice(1).join(' ') || 'PeaceBundlle';
    return { firstName, lastName };
  }

  normalizePhone(phone) {
    const raw = String(phone || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
    if (digits.startsWith('0') && digits.length === 11) return digits;
    return raw;
  }

  async generateVirtualAccount(user, bank, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('BillStack virtual account is not configured');
    }

    const { firstName, lastName } = this.splitName(user.name);
    const payload = {
      email: user.email,
      reference: `PB-${user.id}`,
      firstName,
      lastName,
      phone: this.normalizePhone(user.phone),
      bank: bank || 'PALMPAY',
    };

    try {
      const res = await this.clientWithTimeout(options.timeoutMs).post('/generateVirtualAccount/', payload);
      const body = res.data || {};
      if (!body.status) {
        throw new Error(body.message || 'Cannot reserve account at the moment.');
      }

      const account = Array.isArray(body.data?.account) ? body.data.account[0] : null;
      if (!account?.account_number) {
        throw new Error('BillStack did not return an account number');
      }

      return {
        accountNumber: account.account_number,
        bankName: account.bank_name || payload.bank,
        accountName: account.account_name || `${firstName} ${lastName}`.trim(),
        trackingReference: body.data?.reference || payload.reference,
        raw: body,
      };
    } catch (e) {
      const status = e.response?.status;
      const payload = e.response?.data;
      const message = payload?.message || e.message || 'BillStack generateVirtualAccount failed';
      logger.error('[BillStack] generateVirtualAccount failed', { userId: user.id, status, message });
      throw new Error(message);
    }
  }

  async upgradeVirtualAccount(customerEmail, bvn, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('BillStack virtual account is not configured');
    }

    const payload = { customer: customerEmail, bvn };
    try {
      const res = await this.clientWithTimeout(options.timeoutMs).post('/upgradeVirtualAccount', payload);
      return res.data;
    } catch (e) {
      const status = e.response?.status;
      const payload2 = e.response?.data;
      const message = payload2?.message || e.message || 'BillStack upgradeVirtualAccount failed';
      logger.error('[BillStack] upgradeVirtualAccount failed', { status, message });
      throw new Error(message);
    }
  }

  async generateVirtualAccountForUserId(userId, options = {}) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    const bank = options.bank || process.env.BILLSTACK_BANK || 'PALMPAY';
    return this.generateVirtualAccount(user, bank, { timeoutMs: options.timeoutMs });
  }
}

module.exports = new BillstackVirtualAccountService();
