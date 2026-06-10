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

  getRouterBreaker() {
    const key = '__peacebundle_va_router_breaker';
    if (!globalThis[key]) globalThis[key] = new Map();
    return globalThis[key];
  }

  getRouterBreakerConfig() {
    const threshold = parseInt(String(process.env.VA_ROUTER_BREAKER_THRESHOLD || '3'), 10);
    const windowMs = parseInt(String(process.env.VA_ROUTER_BREAKER_WINDOW_MS || String(2 * 60 * 1000)), 10);
    const openMs = parseInt(String(process.env.VA_ROUTER_BREAKER_OPEN_MS || String(5 * 60 * 1000)), 10);
    return {
      threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 3,
      windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 2 * 60 * 1000,
      openMs: Number.isFinite(openMs) && openMs > 0 ? openMs : 5 * 60 * 1000,
    };
  }

  isCircuitOpen(key) {
    const breaker = this.getRouterBreaker();
    const entry = breaker.get(String(key || '').toUpperCase()) || null;
    if (!entry?.openUntil) return false;
    return entry.openUntil > Date.now();
  }

  markCircuitFailure(key) {
    const k = String(key || '').toUpperCase();
    if (!k) return;
    const { threshold, windowMs, openMs } = this.getRouterBreakerConfig();
    const breaker = this.getRouterBreaker();
    const now = Date.now();
    const entry = breaker.get(k) || { count: 0, windowStart: now, openUntil: 0 };
    const withinWindow = entry.windowStart && now - entry.windowStart <= windowMs;
    const next = withinWindow ? { ...entry, count: entry.count + 1 } : { count: 1, windowStart: now, openUntil: entry.openUntil || 0 };
    if (next.count >= threshold) {
      next.openUntil = now + openMs;
    }
    breaker.set(k, next);
  }

  markCircuitSuccess(key) {
    const k = String(key || '').toUpperCase();
    if (!k) return;
    const breaker = this.getRouterBreaker();
    breaker.delete(k);
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
    const defaultOrder = ['PALMPAY', 'PROVIDUS', 'SAFEHAVEN', '9PSB'];
    const order = list.length ? list : defaultOrder;
    const uniq = [];
    for (const item of order) {
      const key = String(item || '').trim().toUpperCase();
      if (!key) continue;
      if (!uniq.includes(key)) uniq.push(key);
    }
    const forcedFirst = ['PALMPAY', 'PROVIDUS'];
    const rest = uniq.filter((x) => !forcedFirst.includes(x));
    return [...forcedFirst, ...rest.filter((x) => x !== 'PALMPAY' && x !== 'PROVIDUS')];
  }

  classifyRoutingFailure(error) {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : Number(error?.response?.status || 0);
    const message = String(error?.message || '').trim();
    const lower = message.toLowerCase();
    let category = 'unknown';
    if (code === 'BILLSTACK_BANK_INVALID' || lower.includes('bank cannot be identified')) category = 'invalid_request';
    else if (lower.includes('reject') || lower.includes('declin') || lower.includes('cannot reserve')) category = 'allocation_failed';
    else if (status >= 500 || lower.includes('service unavailable') || lower.includes('temporarily') || lower.includes('timeout') || lower.includes('network')) category = 'downtime';
    else if (lower.includes('not configured')) category = 'not_configured';
    return {
      code,
      status: status || null,
      message,
      category,
      fallbackEligible: ['allocation_failed', 'downtime'].includes(category),
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
    const payload = {
      email: user.email,
      reference,
      firstName,
      lastName,
      phone: this.normalizePhone(user.phone),
      bank: normalizedBank,
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
      const providerBody = e.response?.data;
      const message = providerBody?.message || e.message || 'BillStack generateVirtualAccount failed';
      const safeRequest = this.sanitizePayloadForLogs(payload);
      logger.error('[BillStack] generateVirtualAccount failed', { userId: user.id, status, message, request: safeRequest });
      const err = new Error(message);
      err.status = status || null;
      err.code = e?.code || err.code;
      err.provider = 'billstack';
      err.bank = normalizedBank;
      throw err;
    }
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

    for (const item of order) {
      const key = String(item || '').trim().toUpperCase();
      if (!key) continue;

      // #region debug-point E:router-attempt-start
      (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router starting bank/provider attempt',data:{userId:user?.id||null,bank:key,attemptedSoFar:attempts.map((a)=>a.bank)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion

      if (billstackBanks.includes(key)) {
        const circuitKey = `BILLSTACK:${key}`;
        const supportsDirectProviderFallback = key === 'SAFEHAVEN' || key === '9PSB';
        if (canUseBillstack) {
          if (this.isCircuitOpen(circuitKey)) {
            attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'skipped', reason: 'circuit_open' });
            if (!supportsDirectProviderFallback) continue;
          } else {
            try {
              const reference = referenceBase ? `${referenceBase}-${key}`.slice(0, 64) : options.reference;
              const result = await this.generateVirtualAccount(user, key, { timeoutMs, reference });
              this.markCircuitSuccess(circuitKey);
              const validated = this.validateProvisioningResult(result, { provider: 'billstack', bank: key });
              attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'success' });
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
              this.markCircuitFailure(circuitKey);
              attempts.push({ at: new Date().toISOString(), provider: 'billstack', bank: key, tier: 'primary', status: 'failed', failure });
              // #region debug-point E:router-attempt-failed
              (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router attempt failed',data:{userId:user?.id||null,bank:key,failureCategory:failure.category,message:failure.message,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
              // #endregion
              primaryFailures.push({ ...failure, bank: key, provider: 'billstack', at: new Date().toISOString() });
              logger.warn('[VA Router] Primary allocation failed', { userId: user?.id, provider: 'billstack', bank: key, failureCategory: failure.category, status: failure.status, message: failure.message });
              if (!supportsDirectProviderFallback) {
                if (!failure.fallbackEligible && failure.confirmedFailure) break;
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
        if (this.isCircuitOpen(circuitKey)) {
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
          this.markCircuitFailure(circuitKey);
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
        if (!canUsePayvessel) continue;
        if (this.isCircuitOpen(circuitKey)) {
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
          this.markCircuitFailure(circuitKey);
          attempts.push({ at: new Date().toISOString(), provider: 'payvessel', bank: '9PSB', tier: 'secondary', status: 'failed', failure });
          // #region debug-point E:router-9psb-failed
          (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backend/services/billstackVirtualAccountService.js:generateVirtualAccountRouted',msg:'[DEBUG] VA router 9PSB failed',data:{userId:user?.id||null,message:failure.message,attemptedBanks:this.getAttemptedBanksFromAttempts(attempts)},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          logger.warn('[VA Router] Secondary allocation failed', { userId: user?.id, provider: 'payvessel', bank: '9PSB', failureCategory: failure.category, status: failure.status, message: failure.message });
          continue;
        }
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
}

module.exports = new BillstackVirtualAccountService();
