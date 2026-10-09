const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');
const payvesselService = require('./payvesselService');
const safeHavenVirtualAccountService = require('./safeHavenVirtualAccountService');

class BillstackVirtualAccountService {
  constructor() {
    const baseUrlCandidates = [
      { key: 'BILLSTACK_BASE_URL', value: process.env.BILLSTACK_BASE_URL },
      { key: 'BILL_STACK_BASE_URL', value: process.env.BILL_STACK_BASE_URL },
      { key: 'Bill_Stack_BASE_URL', value: process.env.Bill_Stack_BASE_URL },
      { key: 'BillSTACK_BASE_URL', value: process.env.BillSTACK_BASE_URL }
    ];
    const secretKeyCandidates = [
      { key: 'BILLSTACK_SECRET_KEY', value: process.env.BILLSTACK_SECRET_KEY },
      { key: 'BILL_STACK_SECRET_KEY', value: process.env.BILL_STACK_SECRET_KEY },
      { key: 'Bill_Stack_SECRET_KEY', value: process.env.Bill_Stack_SECRET_KEY },
      { key: 'BillSTACK_SECRET_KEY', value: process.env.BillSTACK_SECRET_KEY }
    ];
    const publicKeyCandidates = [
      { key: 'BILLSTACK_PUBLIC_KEY', value: process.env.BILLSTACK_PUBLIC_KEY },
      { key: 'BILL_STACK_PUBLIC_KEY', value: process.env.BILL_STACK_PUBLIC_KEY },
      { key: 'Bill_Stack_PUBLIC_KEY', value: process.env.Bill_Stack_PUBLIC_KEY },
      { key: 'BillSTACK_PUBLIC_KEY', value: process.env.BillSTACK_PUBLIC_KEY }
    ];

    const pickFirst = (items) => items.find((i) => Boolean(i.value)) || null;
    const pickedBaseUrl = pickFirst(baseUrlCandidates);
    const pickedSecret = pickFirst(secretKeyCandidates);
    const pickedPublic = pickFirst(publicKeyCandidates);

    this.baseUrl = pickedBaseUrl?.value || 'https://api.billstack.co/v2/thirdparty';
    this.secretKey = pickedSecret?.value || '';
    this.publicKey = pickedPublic?.value || '';
    this.envKeyNames = {
      baseUrl: pickedBaseUrl?.key || null,
      secretKey: pickedSecret?.key || null,
      publicKey: pickedPublic?.key || null
    };
    this.timeoutMs = parseInt(process.env.BILLSTACK_TIMEOUT_MS || '30000', 10);
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.secretKey);
  }

  getRouterBreaker() {
    const key = '__peacebundle_va_router_breaker';
    if (!globalThis[key]) globalThis[key] = new Map();
    return globalThis[key];
  }

  getRouterBreakerConfig() {
    const threshold = parseInt(String(process.env.VA_ROUTER_BREAKER_THRESHOLD || '3'), 10);
    const windowMs = parseInt(String(process.env.VA_ROUTER_BREAKER_WINDOW_MS || String(2 * 60 * 1000)), 10);
    const openMs = parseInt(String(process.env.VA_ROUTER_BREAKER_OPEN_MS || String(60 * 1000)), 10);
    const probeIntervalMs = parseInt(String(process.env.VA_ROUTER_BREAKER_PROBE_INTERVAL_MS || String(15 * 1000)), 10);
    return {
      threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 3,
      windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 2 * 60 * 1000,
      openMs: Number.isFinite(openMs) && openMs > 0 ? openMs : 60 * 1000,
      probeIntervalMs: Number.isFinite(probeIntervalMs) && probeIntervalMs > 0 ? probeIntervalMs : 15 * 1000,
    };
  }

  isCircuitOpen(key) {
    const breaker = this.getRouterBreaker();
    const entry = breaker.get(String(key || '').toUpperCase()) || null;
    if (!entry?.openUntil) return false;
    return entry.openUntil > Date.now();
  }

  canAttempt(key, options = {}) {
    const k = String(key || '').toUpperCase();
    if (!k) return true;
    if (options.force) return true;
    const breaker = this.getRouterBreaker();
    const entry = breaker.get(k) || null;
    if (!entry?.openUntil) return true;
    const now = Date.now();
    if (now >= entry.openUntil) {
      return true;
    }
    if (options.emergencyProbe) {
      entry.lastProbeAt = now;
      breaker.set(k, entry);
      return true;
    }
    if (options.allowCanaryProbe) {
      const { probeIntervalMs } = this.getRouterBreakerConfig();
      if (!entry.lastProbeAt || now - entry.lastProbeAt >= probeIntervalMs) {
        entry.lastProbeAt = now;
        breaker.set(k, entry);
        return true;
      }
    }
    return false;
  }

  markCircuitFailure(key, failureCategory = null) {
    const k = String(key || '').toUpperCase();
    if (!k) return;
    if (failureCategory === 'invalid_request') return;

    const { threshold, windowMs, openMs } = this.getRouterBreakerConfig();
    const breaker = this.getRouterBreaker();
    const now = Date.now();
    const entry = breaker.get(k) || { count: 0, windowStart: now, openUntil: 0 };
    const withinWindow = entry.windowStart && now - entry.windowStart <= windowMs;
    const next = withinWindow ? { ...entry, count: entry.count + 1 } : { count: 1, windowStart: now, openUntil: entry.openUntil || 0 };
    if (next.count >= threshold) {
      next.openUntil = now + openMs;
    }
    next.lastFailureAt = now;
    breaker.set(k, next);
  }

  markCircuitSuccess(key) {
    const k = String(key || '').toUpperCase();
    if (!k) return;
    const breaker = this.getRouterBreaker();
    breaker.delete(k);
  }

  resetCircuitBreakers(key = null) {
    const breaker = this.getRouterBreaker();
    if (key) {
      breaker.delete(String(key).toUpperCase());
    } else {
      breaker.clear();
      this._winningEndpoint = null;
    }
  }

  getCircuitStatus() {
    const breaker = this.getRouterBreaker();
    const result = {};
    const now = Date.now();
    for (const [key, entry] of breaker.entries()) {
      const open = Boolean(entry.openUntil && entry.openUntil > now);
      result[key] = {
        open,
        failures: entry.count || 0,
        remainingMs: open ? Math.max(0, entry.openUntil - now) : 0,
        lastProbeAt: entry.lastProbeAt ? new Date(entry.lastProbeAt).toISOString() : null,
      };
    }
    return result;
  }

  getHealthCache() {
    const key = '__peacebundle_va_router_health';
    if (!globalThis[key]) globalThis[key] = new Map();
    return globalThis[key];
  }

  getHealthTtlMs() {
    const ttl = parseInt(String(process.env.VA_ROUTER_HEALTH_TTL_MS || '10000'), 10);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 10000;
  }

  async checkUrlHealthy(url, options = {}) {
    const u = String(url || '').trim();
    if (!u) return { ok: null, status: null, reason: 'no_url' };
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 2500;
    try {
      const res = await axios.get(u, { timeout: timeoutMs, validateStatus: () => true });
      const ok = res.status >= 200 && res.status < 500;
      return { ok, status: res.status, reason: ok ? 'ok' : 'bad_status' };
    } catch (e) {
      const message = String(e?.message || 'health_check_failed');
      return { ok: false, status: null, reason: message.slice(0, 120) };
    }
  }

  async getProviderHealthSnapshot() {
    const cache = this.getHealthCache();
    const ttlMs = this.getHealthTtlMs();
    const now = Date.now();
    const key = 'snapshot';
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const billstackHealthUrl = String(process.env.BILLSTACK_HEALTH_URL || '').trim();
    const payvesselHealthUrl = String(process.env.PAYVESSEL_HEALTH_URL || '').trim();
    const safehavenHealthUrl = String(process.env.SAFEHAVEN_HEALTH_URL || '').trim();

    const [billstackHttp, payvesselHttp, safehavenHttp] = await Promise.all([
      this.checkUrlHealthy(billstackHealthUrl),
      this.checkUrlHealthy(payvesselHealthUrl),
      this.checkUrlHealthy(safehavenHealthUrl),
    ]);

    const snapshot = {
      at: new Date().toISOString(),
      providers: {
        billstack: {
          configured: this.isConfigured(),
          http: billstackHttp,
        },
        payvessel: {
          configured: Boolean(process.env.PAYVESSEL_API_KEY && process.env.PAYVESSEL_SECRET_KEY && process.env.PAYVESSEL_BUSINESS_ID),
          http: payvesselHttp,
        },
        safehaven: {
          configured: safeHavenVirtualAccountService.isConfigured(),
          http: safehavenHttp,
        },
      },
      circuits: {
        billstack_palmpay: this.isCircuitOpen('BILLSTACK:PALMPAY'),
        billstack_providus: this.isCircuitOpen('BILLSTACK:PROVIDUS'),
        safehaven: this.isCircuitOpen('SAFEHAVEN'),
        payvessel_9psb: this.isCircuitOpen('PAYVESSEL:9PSB'),
      },
    };

    cache.set(key, { expiresAt: now + ttlMs, value: snapshot });
    return snapshot;
  }

  getPriorityOrder(options = {}) {
    const raw = String(options.priorityOrder || process.env.VA_ROUTER_PRIORITY || '').trim();
    const list = raw
      .split(',')
      .map((s) => this.normalizeBankCode(s))
      .map((s) => (s === 'SAFEHAVENMFB' ? 'SAFEHAVEN' : s))
      .filter(Boolean);
    const preferred = this.normalizeBankCode(process.env.BILLSTACK_BANK || 'PALMPAY') || 'PALMPAY';
    const defaultOrder = preferred === '9PSB'
      ? ['9PSB', 'PALMPAY', 'PROVIDUS', 'SAFEHAVEN']
      : ['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB'];
    const order = list.length ? list : defaultOrder;
    const uniq = [];
    for (const item of order) {
      const key = String(item || '').trim().toUpperCase();
      if (!key) continue;
      if (!uniq.includes(key)) uniq.push(key);
    }
    return uniq;
  }

  classifyRoutingFailure(error) {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : Number(error?.response?.status || 0);
    const message = String(error?.message || '').trim();
    const lower = message.toLowerCase();
    let category = 'unknown';
    if (code === 'BILLSTACK_BANK_INVALID' || lower.includes('bank cannot be identified')) category = 'invalid_request';
    else if (lower.includes('reject') || lower.includes('declin') || lower.includes('cannot reserve')) category = 'allocation_failed';
    else if (
      status >= 500 ||
      status === 404 ||
      lower.includes('service unavailable') ||
      lower.includes('temporarily') ||
      lower.includes('timeout') ||
      lower.includes('network') ||
      lower.includes('not found') ||
      lower.includes('could not be found')
    ) category = 'downtime';
    else if (lower.includes('not configured')) category = 'not_configured';
    return {
      code,
      status: status || null,
      message,
      category,
      fallbackEligible: ['allocation_failed', 'downtime', 'unknown'].includes(category),
      confirmedFailure: category !== 'unknown' || Boolean(message),
    };
  }

  validateProvisioningResult(result, context = {}) {
    const accountNumber = String(result?.accountNumber || '').replace(/\D/g, '');
    const bankName = String(result?.bankName || context.bankName || context.bank || '').trim();
    const accountName = String(result?.accountName || '').trim();
    if (!accountNumber || accountNumber.length < 10) {
      throw new Error(`Invalid account number from ${context.provider || 'provider'}`);
    }
    if (!bankName) {
      throw new Error(`Missing bank name from ${context.provider || 'provider'}`);
    }
    if (!accountName) {
      throw new Error(`Missing account name from ${context.provider || 'provider'}`);
    }
    return {
      ...result,
      accountNumber,
      bankName: bankName.toUpperCase(),
      accountName: accountName.replace(/\s+/g, ' '),
    };
  }

  getAttemptedBanksFromAttempts(attempts = []) {
    const banks = [];
    for (const attempt of Array.isArray(attempts) ? attempts : []) {
      const bank = String(attempt?.bank || '').trim().toUpperCase();
      if (!bank) continue;
      if (attempt?.status === 'skipped') continue;
      if (!banks.includes(bank)) banks.push(bank);
    }
    return banks;
  }

  formatAttemptedBanksSuffix(attempts = []) {
    const banks = this.getAttemptedBanksFromAttempts(attempts);
    return banks.length ? ` (attempted banks: ${banks.join(', ')})` : '';
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.secretKey);
  }

  stripNonPrintable(value) {
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
  }

  getEndpointUrl(path) {
    const rawPath = String(path || '').trim();
    if (/^https?:\/\//i.test(rawPath)) return rawPath;

    const base = String(this.baseUrl || 'https://api.billstack.co/v2').trim().replace(/\/+$/, '');
    const cleanPath = rawPath.replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
  }

  client() {
    return this.clientWithTimeout(this.timeoutMs);
  }

  clientWithTimeout(timeoutMs) {
    const cleanSecret = this.stripNonPrintable(this.secretKey);
    const authHeader = cleanSecret.startsWith('Bearer ') ? cleanSecret : `Bearer ${cleanSecret}`;
    const rawSecret = cleanSecret.replace(/^Bearer\s+/i, '');
    return axios.create({
      baseURL: this.baseUrl,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : this.timeoutMs,
      headers: {
        Authorization: authHeader,
        'x-api-key': rawSecret,
        'x-public-key': this.stripNonPrintable(this.publicKey),
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

  normalizeBankCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const aliases = {
      PALM_PAY: 'PALMPAY',
      PALMPAYBANK: 'PALMPAY',
      SAFEHAVENMFB: 'SAFEHAVEN',
      NINEPSB: '9PSB',
      NINEPAYMENTSERVICEBANK: '9PSB',
      '9PAYMENTSERVICEBANK': '9PSB',
      AMPERSAND: 'BANKLY',
      AMPERSANDBANK: 'BANKLY',
    };
    return aliases[cleaned] || cleaned;
  }

  getAllowedBanks() {
    const fromEnv = String(process.env.BILLSTACK_ALLOWED_BANKS || '')
      .split(',')
      .map((s) => this.normalizeBankCode(s))
      .filter(Boolean);
    if (fromEnv.length) return fromEnv;
    return ['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB', 'BANKLY'];
  }

  sanitizePayloadForLogs(payload) {
    const email = String(payload?.email || '').trim();
    const phone = String(payload?.phone || '').trim();
    const safeEmail = email.includes('@') ? `***@${email.split('@').slice(-1)[0]}` : null;
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneLast4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : null;
    return {
      email: safeEmail,
      reference: payload?.reference || null,
      firstName: payload?.firstName || null,
      lastName: payload?.lastName || null,
      phoneLast4,
      bank: payload?.bank || null,
    };
  }

  async generateVirtualAccount(user, bank, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('BillStack virtual account is not configured');
    }

    const { firstName, lastName } = this.splitName(user.name);
    const normalizedBank = this.normalizeBankCode(bank || '');
    const allowedBanks = this.getAllowedBanks();
    if (!normalizedBank || !allowedBanks.includes(normalizedBank)) {
      const err = new Error('Bank cannot be identified!');
      err.code = 'BILLSTACK_BANK_INVALID';
      err.details = { bank: normalizedBank || null, allowedBanks };
      throw err;
    }

    const reference = options.reference ? String(options.reference) : `PB-${user.id}`;
    const fullName = `${firstName} ${lastName}`.trim();
    const email = String(user.email || '').trim().toLowerCase();
    const phone = this.normalizePhone(user.phone);

    const payload = {
      reference,
      account_name: fullName,
      accountName: fullName,
      name: fullName,
      email,
      customer_email: email,
      phone,
      customer_phone: phone,
      firstName,
      lastName,
      first_name: firstName,
      last_name: lastName,
      bank: normalizedBank,
      bank_code: normalizedBank,
      preferred_bank: normalizedBank,
    };

    const bvn = String(user.bvn || options.bvn || '').trim();
    const nin = String(user.nin || options.nin || '').trim();
    if (bvn) {
      payload.idType = 'bvn';
      payload.idNumber = bvn;
      payload.bvn = bvn;
      payload.id_type = 'bvn';
      payload.id_number = bvn;
    } else if (nin) {
      payload.idType = 'nin';
      payload.idNumber = nin;
      payload.nin = nin;
      payload.id_type = 'nin';
      payload.id_number = nin;
    }

    let origin = 'https://api.billstack.co';
    try {
      origin = new URL(this.baseUrl || 'https://api.billstack.co').origin;
    } catch (_) {}
    const v2Base = `${origin}/v2`;

    const configuredPath = (process.env.BILLSTACK_GENERATE_VA_PATH || process.env.BILLSTACK_VA_PATH || '').trim();
    const candidateEndpoints = [];

    if (this._winningEndpoint) {
      candidateEndpoints.push(this._winningEndpoint);
    }

    if (configuredPath) {
      candidateEndpoints.push(configuredPath);
      candidateEndpoints.push(this.getEndpointUrl(configuredPath));
    }

    // 1. Official BillStack documentation canonical endpoint:
    // https://docs.billstack.co/create-account.md -> POST https://api.billstack.co/v2/thirdparty/generateVirtualAccount/
    candidateEndpoints.push(`${v2Base}/thirdparty/generateVirtualAccount/`);
    candidateEndpoints.push(`${v2Base}/thirdparty/generateVirtualAccount`);
    candidateEndpoints.push(this.getEndpointUrl('thirdparty/generateVirtualAccount/'));
    candidateEndpoints.push(this.getEndpointUrl('thirdparty/generateVirtualAccount'));
    candidateEndpoints.push(this.getEndpointUrl('generateVirtualAccount/'));
    candidateEndpoints.push(this.getEndpointUrl('generateVirtualAccount'));

    // 2. Direct v2 endpoints
    candidateEndpoints.push(`${v2Base}/generateVirtualAccount/`);
    candidateEndpoints.push(`${v2Base}/generateVirtualAccount`);
    candidateEndpoints.push(`${v2Base}/reserved-accounts`);
    candidateEndpoints.push(`${v2Base}/reserved-accounts/`);
    candidateEndpoints.push(this.getEndpointUrl('reserved-accounts'));
    candidateEndpoints.push(this.getEndpointUrl('reserved-accounts/'));

    // 3. REST virtual-accounts variants
    candidateEndpoints.push(`${v2Base}/virtual-accounts`);
    candidateEndpoints.push(`${v2Base}/virtual-accounts/`);
    candidateEndpoints.push(`${v2Base}/thirdparty/reserved-accounts`);

    const endpointsToTry = [...new Set(candidateEndpoints)];
    let lastError = null;
    let successfulResponse = null;

    for (let i = 0; i < endpointsToTry.length; i++) {
      const endpoint = endpointsToTry[i];
      try {
        const res = await this.clientWithTimeout(options.timeoutMs).post(endpoint, payload);
        const body = res.data || {};
        const isSuccess = body.status === true || body.status === 'success' || body.success === true;
        if (!isSuccess && (body.status === false || body.success === false || (body.status !== undefined && body.success !== undefined))) {
          throw new Error(body.message || body.error || 'Cannot reserve account at the moment.');
        }

        const data = body.data || body;
        const account = Array.isArray(data?.account)
          ? data.account[0]
          : Array.isArray(data?.accounts)
          ? data.accounts[0]
          : (data?.account || data);

        const accountNumber = String(
          account?.account_number ||
          account?.accountNumber ||
          data?.account_number ||
          data?.accountNumber ||
          body?.account_number ||
          body?.accountNumber ||
          ''
        ).replace(/\D/g, '');

        if (!accountNumber || accountNumber.length < 10) {
          throw new Error(body.message || body.error || 'BillStack did not return an account number');
        }

        const bankName = String(
          account?.bank_name ||
          account?.bankName ||
          data?.bank_name ||
          data?.bankName ||
          account?.bank ||
          data?.bank ||
          payload.bank
        ).trim();

        const accountName = String(
          account?.account_name ||
          account?.accountName ||
          data?.account_name ||
          data?.accountName ||
          account?.name ||
          data?.name ||
          fullName
        ).trim();

        const trackingReference =
          data?.reference ||
          account?.reference ||
          body?.reference ||
          data?.transaction_ref ||
          payload.reference;

        successfulResponse = {
          accountNumber,
          bankName,
          accountName,
          trackingReference,
          raw: body,
        };
        this._winningEndpoint = endpoint;
        break;
      } catch (e) {
        lastError = e;
        const status = e.response?.status;
        if ((status === 404 || status === 405) && i < endpointsToTry.length - 1) {
          logger.warn(`[BillStack] Candidate endpoint ${endpoint} returned ${status}, attempting alternative candidate ${endpointsToTry[i + 1]}...`);
          continue;
        }
        break;
      }
    }

    if (successfulResponse) {
      return successfulResponse;
    }

    const status = lastError?.response?.status;
    const providerBody = lastError?.response?.data;
    const message = providerBody?.message || providerBody?.error || lastError?.message || 'BillStack generateVirtualAccount failed';
    const safeRequest = this.sanitizePayloadForLogs(payload);
    logger.error('[BillStack] generateVirtualAccount failed', {
      userId: user.id,
      status,
      message,
      failedEndpoint: lastError?.config?.url || null,
      baseURL: lastError?.config?.baseURL || null,
      responseBody: providerBody || null,
      request: safeRequest
    });
    const err = new Error(message);
    err.status = status || null;
    err.code = lastError?.code || err.code;
    err.provider = 'billstack';
    err.bank = normalizedBank;
    throw err;
  }

  async generateVirtualAccountRouted(user, options = {}) {
    const referenceBase = String(options.referenceBase || '').trim();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : undefined;
    const order = this.getPriorityOrder(options);
    const attempts = [];

    // #region debug-point D:router-entry
    (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router entered',data:{userId:user?.id||null,order,referenceBase:referenceBase||null},ts:Date.now()})}).catch(()=>{})})();
    // #endregion

    const isTest = process.env.NODE_ENV === 'test';
    const health = await this.getProviderHealthSnapshot();
    const billstackHttpOk = health.providers.billstack.http.ok;
    const safehavenHttpOk = health.providers.safehaven.http.ok;
    const payvesselHttpOk = health.providers.payvessel.http.ok;

    const canUseBillstack = this.isConfigured() && (billstackHttpOk !== false);
    const canUseSafeHaven = safeHavenVirtualAccountService.isConfigured() && (safehavenHttpOk !== false);
    const canUsePayvessel = (isTest ? true : Boolean(process.env.PAYVESSEL_API_KEY && process.env.PAYVESSEL_SECRET_KEY && process.env.PAYVESSEL_BUSINESS_ID)) && (payvesselHttpOk !== false);
    const billstackBanks = this.getAllowedBanks();

    const primaryFailures = [];
    let lastError = null;

    const candidateBillstackBanks = order.filter((b) => billstackBanks.includes(b));
    const allBillstackRoutesOpen = candidateBillstackBanks.length > 0 && candidateBillstackBanks.every((b) => this.isCircuitOpen(`BILLSTACK:${b}`));
    const isForced = Boolean(options.force);

    let hasViableClosedRoute = false;
    for (const item of order) {
      const bankCode = String(item || '').trim().toUpperCase();
      if (!bankCode) continue;
      if (billstackBanks.includes(bankCode) && canUseBillstack && !this.isCircuitOpen(`BILLSTACK:${bankCode}`)) {
        hasViableClosedRoute = true;
        break;
      }
      if (bankCode === '9PSB' && canUsePayvessel && !this.isCircuitOpen('PAYVESSEL:9PSB')) {
        hasViableClosedRoute = true;
        break;
      }
      if (bankCode === 'PALMPAY' && canUsePayvessel && !this.isCircuitOpen('PAYVESSEL:PALMPAY') && process.env.PAYVESSEL_FALLBACK_PALMPAY === 'true') {
        hasViableClosedRoute = true;
        break;
      }
    }

    const emergencyProbeBank = (isForced || (!hasViableClosedRoute && canUseBillstack && order.length > 0) || (allBillstackRoutesOpen && canUseBillstack))
      ? (candidateBillstackBanks[0] || order[0])
      : null;
    if (emergencyProbeBank) {
      logger.warn('[VA Router] Candidate route(s) circuit-open; attempting emergency canary probe on primary route', {
        bank: emergencyProbeBank,
        userId: user?.id,
        isForced,
      });
    }

    for (const item of order) {
      const key = String(item || '').trim().toUpperCase();
      if (!key) continue;

      // #region debug-point E:router-attempt-start
      (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router starting bank/provider attempt',data:{userId:user?.id||null,bank:key,attemptedSoFar:attempts.map((a)=>a.bank)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion

      if (billstackBanks.includes(key)) {
        const circuitKey = `BILLSTACK:${key}`;
        const supportsDirectProviderFallback = key === 'SAFEHAVEN' || key === '9PSB' || (key === 'PALMPAY' && process.env.PAYVESSEL_FALLBACK_PALMPAY === 'true');
        if (canUseBillstack) {
          const isEmergencyProbe = isForced || emergencyProbeBank === key;
          const shouldAttempt = this.canAttempt(circuitKey, {
            force: isForced,
            emergencyProbe: isEmergencyProbe,
            allowCanaryProbe: isForced || !hasViableClosedRoute || allBillstackRoutesOpen,
          });

          if (!shouldAttempt) {
            attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'skipped', reason: 'circuit_open' });
            if (!supportsDirectProviderFallback) continue;
          } else {
            try {
              const reference = referenceBase ? `${referenceBase}-${key}`.slice(0, 64) : options.reference;
              const result = await this.generateVirtualAccount(user, key, { timeoutMs, reference });
              this.markCircuitSuccess(circuitKey);
              const validated = this.validateProvisioningResult(result, { provider: 'billstack', bank: key });
              attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'success', isProbe: isEmergencyProbe });
              // #region debug-point D:router-success
              (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router succeeded on primary provider',data:{userId:user?.id||null,bank:key,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
              // #endregion
              if (attempts.length > 1) {
                logger.warn('[VA Router] Fallback occurred (primary)', { userId: user?.id, selected: { provider: 'billstack', bank: key }, attempts });
              }
              return {
                provider: 'billstack',
                bank: key,
                ...validated,
                routing: { attempts, primaryFailures, health },
              };
            } catch (e) {
              lastError = e;
              const failure = this.classifyRoutingFailure(e);
              this.markCircuitFailure(circuitKey, failure.category);
              attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'failed', failure, isProbe: isEmergencyProbe });
              // #region debug-point E:router-attempt-failed
              (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router attempt failed',data:{userId:user?.id||null,bank:key,failureCategory:failure.category,message:failure.message,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
              // #endregion
              primaryFailures.push({ ...failure, bank: key, provider: 'billstack', at: new Date().toISOString() });
              logger.warn('[VA Router] Primary allocation failed', { userId: user?.id, provider: 'billstack', bank: key, failureCategory: failure.category, status: failure.status, message: failure.message });
              if (!supportsDirectProviderFallback) {
                if (!failure.fallbackEligible && failure.confirmedFailure && failure.category === 'invalid_request') break;
                continue;
              }
            }
          }
        } else if (!supportsDirectProviderFallback) {
          continue;
        }
      }

      if (key === 'SAFEHAVEN') {
        const circuitKey = 'SAFEHAVEN';
        if (!canUseSafeHaven) continue;
        const shouldAttemptSH = this.canAttempt(circuitKey, { allowCanaryProbe: !hasViableClosedRoute });
        if (!shouldAttemptSH) {
          attempts.push({ at: new Date().toISOString(), provider: 'safehaven', bank: 'SAFEHAVEN', tier: 'secondary', status: 'skipped', reason: 'circuit_open' });
          continue;
        }
        try {
          const reference = options.reference || (referenceBase ? `${referenceBase}-SAFEHAVEN`.slice(0, 64) : `SHVA-${user?.id}`);
          const result = await safeHavenVirtualAccountService.createVirtualAccount(user, { timeoutMs, reference });
          this.markCircuitSuccess(circuitKey);
          const validated = this.validateProvisioningResult(result, { provider: 'safehaven', bank: 'SAFEHAVEN' });
          attempts.push({ at: new Date().toISOString(), provider: 'safehaven', bank: 'SAFEHAVEN', tier: 'secondary', status: 'success' });
          // #region debug-point D:router-success-secondary
          (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router succeeded on secondary provider',data:{userId:user?.id||null,bank:'SAFEHAVEN',attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          logger.warn('[VA Router] Fallback occurred (secondary)', { userId: user?.id, selected: { provider: 'safehaven', bank: 'SAFEHAVEN' }, attempts });
          return {
            provider: 'safehaven',
            bank: 'SAFEHAVEN',
            ...validated,
            routing: { attempts, primaryFailures, health },
          };
        } catch (e) {
          lastError = e;
          const failure = this.classifyRoutingFailure(e);
          this.markCircuitFailure(circuitKey, failure.category);
          attempts.push({ at: new Date().toISOString(), provider: 'safehaven', bank: 'SAFEHAVEN', tier: 'secondary', status: 'failed', failure });
          // #region debug-point E:router-safehaven-failed
          (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router SafeHaven failed',data:{userId:user?.id||null,message:failure.message,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          logger.warn('[VA Router] Secondary allocation failed', { userId: user?.id, provider: 'safehaven', bank: 'SAFEHAVEN', failureCategory: failure.category, status: failure.status, message: failure.message });
          continue;
        }
      }

      if (key === '9PSB') {
        const circuitKey = 'PAYVESSEL:9PSB';
        if (!canUsePayvessel) {
          logger.warn('[VA Router] PayVessel secondary fallback skipped (unconfigured or unhealthy)', { bank: key, payvesselHttpOk });
          continue;
        }
        const shouldAttempt9PSB = this.canAttempt(circuitKey, { allowCanaryProbe: !hasViableClosedRoute });
        if (!shouldAttempt9PSB) {
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: '9PSB', tier: 'secondary', status: 'skipped', reason: 'circuit_open' });
          continue;
        }
        try {
          const result = await payvesselService.createVirtualAccount(user, 0, {
            timeoutMs,
            maxRetries: 0,
            preferredBankName: '9PSB',
            bankNames: ['9PSB'],
          });
          this.markCircuitSuccess(circuitKey);
          const validated = this.validateProvisioningResult(result, { provider: 'payvessel', bank: '9PSB' });
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: '9PSB', tier: 'secondary', status: 'success' });
          // #region debug-point D:router-success-9psb
          (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router succeeded on 9PSB',data:{userId:user?.id||null,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          logger.warn('[VA Router] Fallback occurred (secondary)', { userId: user?.id, selected: { provider: 'payvessel', bank: '9PSB' }, attempts });
          return {
            provider: 'payvessel',
            bank: '9PSB',
            ...validated,
            routing: { attempts, primaryFailures, health },
          };
        } catch (e) {
          lastError = e;
          const failure = this.classifyRoutingFailure(e);
          this.markCircuitFailure(circuitKey, failure.category);
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: '9PSB', tier: 'secondary', status: 'failed', failure });
          // #region debug-point E:router-9psb-failed
          (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router 9PSB failed',data:{userId:user?.id||null,message:failure.message,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          logger.warn('[VA Router] Secondary allocation failed', { userId: user?.id, provider: 'payvessel', bank: '9PSB', failureCategory: failure.category, status: failure.status, message: failure.message });
          continue;
        }
      }

      if (key === 'PALMPAY' && process.env.PAYVESSEL_FALLBACK_PALMPAY === 'true') {
        const circuitKey = 'PAYVESSEL:PALMPAY';
        if (!canUsePayvessel) {
          logger.warn('[VA Router] PayVessel secondary fallback skipped for PALMPAY (unconfigured or unhealthy)', { bank: key, payvesselHttpOk });
          continue;
        }
        const shouldAttemptPP = this.canAttempt(circuitKey, { allowCanaryProbe: !hasViableClosedRoute });
        if (!shouldAttemptPP) {
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: 'PALMPAY', tier: 'secondary', status: 'skipped', reason: 'circuit_open' });
          continue;
        }
        try {
          const result = await payvesselService.createVirtualAccount(user, 0, {
            timeoutMs,
            maxRetries: 0,
            preferredBankName: 'PALMPAY',
            bankNames: ['PALMPAY'],
          });
          this.markCircuitSuccess(circuitKey);
          const validated = this.validateProvisioningResult(result, { provider: 'payvessel', bank: 'PALMPAY' });
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: 'PALMPAY', tier: 'secondary', status: 'success' });
          logger.warn('[VA Router] Fallback occurred (secondary PayVessel PalmPay)', { userId: user?.id, selected: { provider: 'payvessel', bank: 'PALMPAY' }, attempts });
          return {
            provider: 'payvessel',
            bank: 'PALMPAY',
            ...validated,
            routing: { attempts, primaryFailures, health },
          };
        } catch (e) {
          lastError = e;
          const failure = this.classifyRoutingFailure(e);
          this.markCircuitFailure(circuitKey, failure.category);
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: 'PALMPAY', tier: 'secondary', status: 'failed', failure });
          logger.warn('[VA Router] Secondary allocation failed', { userId: user?.id, provider: 'payvessel', bank: 'PALMPAY', failureCategory: failure.category, status: failure.status, message: failure.message });
          continue;
        }
      }
    }

    // Self-healing fallback: If all routes were skipped due to circuit_open, DO NOT FAIL with attemptedBanks: []!
    // Perform a forced emergency probe on the primary BillStack bank so the system can self-heal.
    if (attempts.length > 0 && attempts.every((a) => a.status === 'skipped') && canUseBillstack) {
      const fallbackBank = candidateBillstackBanks[0] || order[0] || 'PALMPAY';
      logger.warn('[VA Router] All candidate routes were circuit-open skipped; attempting forced canary probe on primary route to self-heal', {
        bank: fallbackBank,
        userId: user?.id,
      });
      try {
        const reference = referenceBase ? `${referenceBase}-${fallbackBank}`.slice(0, 64) : options.reference;
        const result = await this.generateVirtualAccount(user, fallbackBank, { timeoutMs, reference });
        this.markCircuitSuccess(`BILLSTACK:${fallbackBank}`);
        const validated = this.validateProvisioningResult(result, { provider: 'billstack', bank: fallbackBank });
        attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: fallbackBank, tier: 'primary', status: 'success', isProbe: true });
        if (attempts.length > 1) {
          logger.warn('[VA Router] Fallback occurred via forced self-healing probe', { userId: user?.id, selected: { provider: 'billstack', bank: fallbackBank }, attempts });
        }
        return {
          provider: 'billstack',
          bank: fallbackBank,
          ...validated,
          routing: { attempts, primaryFailures, health },
        };
      } catch (probeErr) {
        lastError = probeErr;
        const failure = this.classifyRoutingFailure(probeErr);
        this.markCircuitFailure(`BILLSTACK:${fallbackBank}`, failure.category);
        attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: fallbackBank, tier: 'primary', status: 'failed', failure, isProbe: true });
        primaryFailures.push({ ...failure, bank: fallbackBank, provider: 'billstack', at: new Date().toISOString() });
      }
    }

    const attemptedBanks = this.getAttemptedBanksFromAttempts(attempts);
    const suffix = this.formatAttemptedBanksSuffix(attempts);
    const baseMessage = String(lastError?.message || 'Virtual account routing failed across all providers').trim();
    const err = new Error(`${baseMessage}${suffix}`);
    err.code = lastError?.code || 'VA_ROUTING_FAILED';
    err.status = lastError?.status || null;
    err.provider = lastError?.provider || null;
    err.bank = lastError?.bank || null;
    err.details = { attempts, attemptedBanks, primaryFailures, health };
    // #region debug-point C:router-final-failure
    (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router exhausted all providers',data:{userId:user?.id||null,attemptedBanks,lastError:baseMessage},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    logger.warn('[VA Router] Routing failed across all configured banks', {
      userId: user?.id,
      attemptedBanks,
      attempts,
      lastError: baseMessage,
    });
    throw err;
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
    if (options.routed === true) {
      return this.generateVirtualAccountRouted(user, options);
    }
    const bank = options.bank || process.env.BILLSTACK_BANK || this.getAllowedBanks()[0] || 'PALMPAY';
    return this.generateVirtualAccount(user, bank, { timeoutMs: options.timeoutMs, reference: options.reference });
  }

  async getWalletBalance() {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Billstack credentials not configured' };
    }

    const candidateEndpoints = ['/balance', '/wallet/balance', '/wallet', '/balance/details'];
    for (const endpoint of candidateEndpoints) {
      try {
        const client = this.clientWithTimeout(6000);
        const res = await client.get(endpoint);
        if (res.data) {
          const bal = res.data?.data?.balance ?? res.data?.balance ?? res.data?.data?.wallet_balance ?? res.data?.data?.available_balance ?? null;
          return {
            ok: true,
            status: res.status,
            balance: bal !== null && bal !== undefined ? parseFloat(String(bal)) : null,
            currency: res.data?.data?.currency || res.data?.currency || 'NGN',
            raw: res.data
          };
        }
      } catch (err) {
        // Continue to next endpoint candidate
      }
    }
    return { ok: false, error: 'Unable to query wallet balance from Billstack API' };
  }
}

module.exports = new BillstackVirtualAccountService();
