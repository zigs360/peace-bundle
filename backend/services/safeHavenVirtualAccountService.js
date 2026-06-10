const axios = require('axios');
const logger = require('../utils/logger');

class SafeHavenVirtualAccountService {
  constructor() {
    this.baseUrl = String(process.env.SAFEHAVEN_BASE_URL || 'https://api.safehavenmfb.com').trim();
    this.accessToken = String(process.env.SAFEHAVEN_ACCESS_TOKEN || '').trim();
    this.clientId = String(process.env.SAFEHAVEN_CLIENT_ID || '').trim();
    this.createAccountPath = String(process.env.SAFEHAVEN_CREATE_ACCOUNT_PATH || '/accounts/v2/subaccount').trim();
    this.timeoutMs = parseInt(process.env.SAFEHAVEN_TIMEOUT_MS || '30000', 10);
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.accessToken && this.clientId);
  }

  client(timeoutMs) {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ClientID: this.clientId,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    });
  }

  splitName(fullName) {
    const raw = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!raw) return { firstName: 'User', lastName: 'PeaceBundlle' };
    const parts = raw.split(' ');
    return {
      firstName: parts[0] || 'User',
      lastName: parts.slice(1).join(' ') || 'PeaceBundlle',
    };
  }

  normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
    if (digits.length === 10) return `+234${digits}`;
    if (digits.startsWith('234')) return `+${digits}`;
    return String(phone || '').trim();
  }

  getIdentityPayload(user, options = {}) {
    const identityType = String(options.identityType || '').trim().toUpperCase();
    const identityNumber = String(options.identityNumber || '').trim();
    if (identityType && identityNumber) {
      return { identityType, identityNumber };
    }

    if (user?.bvn) {
      return { identityType: 'BVN', identityNumber: String(user.bvn).trim() };
    }

    if (user?.nin) {
      return { identityType: 'NIN', identityNumber: String(user.nin).trim() };
    }

    const err = new Error('Safe Haven requires BVN or NIN to create a virtual account');
    err.code = 'SAFEHAVEN_KYC_REQUIRED';
    throw err;
  }

  sanitizePayloadForLogs(payload) {
    const phoneDigits = String(payload?.phoneNumber || '').replace(/\D/g, '');
    const email = String(payload?.emailAddress || '').trim();
    return {
      email: email.includes('@') ? `***@${email.split('@').slice(-1)[0]}` : null,
      phoneLast4: phoneDigits.length >= 4 ? phoneDigits.slice(-4) : null,
      externalReference: payload?.externalReference || null,
      identityType: payload?.identityType || null,
      hasIdentityNumber: Boolean(payload?.identityNumber),
    };
  }

  extractAccount(body, payload) {
    const candidates = [
      body?.data?.account,
      body?.data?.subAccount,
      body?.data,
      body?.account,
      body,
    ];
    const record = candidates.find((value) => value && typeof value === 'object') || null;
    const accountNumber = String(
      record?.accountNumber ||
      record?.account_number ||
      record?.nuban ||
      record?.accountNo ||
      '',
    ).trim();
    if (!accountNumber) {
      throw new Error('Safe Haven did not return an account number');
    }

    return {
      accountNumber,
      bankName: record?.bankName || record?.bank_name || 'SAFE HAVEN',
      accountName: record?.accountName || record?.account_name || payload.accountName,
      trackingReference:
        record?.externalReference ||
        record?.reference ||
        body?.data?.reference ||
        payload.externalReference,
    };
  }

  async createVirtualAccount(user, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Safe Haven virtual account is not configured');
    }

    if (!user?.email || !user?.name || !user?.phone) {
      throw new Error('User details (email, name, phone) are required for Safe Haven virtual account creation');
    }

    const { firstName, lastName } = this.splitName(user.name);
    const identity = this.getIdentityPayload(user, options);
    const payload = {
      phoneNumber: this.normalizePhone(user.phone),
      emailAddress: String(user.email).trim(),
      externalReference: String(options.reference || `SHVA-${user.id}`).trim(),
      identityType: identity.identityType,
      identityNumber: identity.identityNumber,
      callbackUrl: options.callbackUrl || process.env.SAFEHAVEN_CALLBACK_URL || undefined,
      autoSweep: false,
      firstName,
      lastName,
      accountName: String(user.name || '').trim(),
    };

    if (options.identityId) payload.identityId = options.identityId;
    if (options.otp) payload.otp = options.otp;

    try {
      const res = await this.client(options.timeoutMs).post(this.createAccountPath, payload);
      const body = res.data || {};
      const ok = body.status === true || String(body.statusCode || '').startsWith('2') || String(body.code || '') === '200';
      if (!ok) {
        throw new Error(body.message || body.error || 'Safe Haven could not create a virtual account');
      }

      const account = this.extractAccount(body, payload);
      return {
        ...account,
        raw: body,
      };
    } catch (e) {
      const status = e.response?.status;
      const providerBody = e.response?.data;
      const message = providerBody?.message || providerBody?.error || e.message || 'Safe Haven virtual account creation failed';
      logger.error('[SafeHaven] createVirtualAccount failed', {
        userId: user.id,
        status,
        message,
        request: this.sanitizePayloadForLogs(payload),
      });
      throw new Error(message);
    }
  }
}

module.exports = new SafeHavenVirtualAccountService();
