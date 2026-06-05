const axios = require('axios');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('./payvesselService');
const logger = require('../utils/logger');
const sequelize = require('../config/database'); // Added sequelize import
const crypto = require('crypto');

const notificationService = require('./notificationService');
const billstackVirtualAccountService = require('./billstackVirtualAccountService');

const { Op, QueryTypes } = require('sequelize');

const luhnCheckDigit = (input) => {
    const digits = String(input).replace(/\D/g, '').split('').map(Number);
    let sum = 0;
    let doubleNext = true;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits[i];
        if (doubleNext) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        doubleNext = !doubleNext;
    }
    return (10 - (sum % 10)) % 10;
};

const toNumericFromUuid = (uuid, moduloDigits, nonce = 0) => {
    const hex = String(uuid || '').replace(/-/g, '');
    const mod = BigInt('1' + '0'.repeat(moduloDigits));
    const n = (BigInt('0x' + hex) + BigInt(nonce)) % mod;
    return n.toString().padStart(moduloDigits, '0');
};

class VirtualAccountService {
    constructor() {
        this.monnifyBaseUrl = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
        this.paystackBaseUrl = 'https://api.paystack.co';
    }

    getInflightMap() {
        const key = '__peacebundle_va_inflight';
        if (!globalThis[key]) globalThis[key] = new Map();
        return globalThis[key];
    }

    getBillstackBankBreaker() {
        const key = '__peacebundle_billstack_bank_breaker';
        if (!globalThis[key]) {
            globalThis[key] = new Map();
        }
        return globalThis[key];
    }

    getBillstackBreakerConfig() {
        const threshold = parseInt(String(process.env.BILLSTACK_BREAKER_THRESHOLD || '3'), 10);
        const windowMs = parseInt(String(process.env.BILLSTACK_BREAKER_WINDOW_MS || String(2 * 60 * 1000)), 10);
        const openMs = parseInt(String(process.env.BILLSTACK_BREAKER_OPEN_MS || String(5 * 60 * 1000)), 10);
        return {
            threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 3,
            windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 2 * 60 * 1000,
            openMs: Number.isFinite(openMs) && openMs > 0 ? openMs : 5 * 60 * 1000,
        };
    }

    isBankCircuitOpen(bankCode) {
        const breaker = this.getBillstackBankBreaker();
        const entry = breaker.get(String(bankCode || '').toUpperCase()) || null;
        if (!entry?.openUntil) return false;
        return entry.openUntil > Date.now();
    }

    markBankAttemptFailure(bankCode) {
        const code = String(bankCode || '').toUpperCase();
        if (!code) return;
        const { threshold, windowMs, openMs } = this.getBillstackBreakerConfig();
        const breaker = this.getBillstackBankBreaker();
        const now = Date.now();
        const entry = breaker.get(code) || { count: 0, windowStart: now, openUntil: 0 };
        const withinWindow = entry.windowStart && now - entry.windowStart <= windowMs;
        const next = withinWindow ? { ...entry, count: entry.count + 1 } : { count: 1, windowStart: now, openUntil: entry.openUntil || 0 };
        if (next.count >= threshold) {
            next.openUntil = now + openMs;
        }
        breaker.set(code, next);
    }

    markBankAttemptSuccess(bankCode) {
        const code = String(bankCode || '').toUpperCase();
        if (!code) return;
        const breaker = this.getBillstackBankBreaker();
        breaker.delete(code);
    }

    buildBillstackRequestReference(userId, bankCode) {
        const uid = String(userId || '').replace(/-/g, '').slice(0, 12).toUpperCase();
        const bank = String(bankCode || '').toUpperCase().slice(0, 8);
        const ts = Date.now().toString(36).toUpperCase();
        const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `PBVA-${uid}-${bank}-${ts}-${rand}`.slice(0, 64);
    }

    normalizeBillstackBank(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    }

    parseBillstackBanks(value) {
        return String(value || '')
            .split(',')
            .map((s) => this.normalizeBillstackBank(s))
            .filter(Boolean);
    }

    getBillstackBankCandidates(primaryBank = null, banksOverride = null) {
        const primary = this.normalizeBillstackBank(primaryBank);
        const override = this.parseBillstackBanks(banksOverride);
        const banksFromEnv = this.parseBillstackBanks(process.env.BILLSTACK_BANKS || '');
        const base = override.length ? override : (banksFromEnv.length ? banksFromEnv : [primary || 'PALMPAY']);
        const uniq = [];
        for (const b of base) {
            if (!b) continue;
            if (!uniq.includes(b)) uniq.push(b);
        }
        const strict = String(process.env.BILLSTACK_STRICT_BANK_LIST || 'false').toLowerCase() === 'true';
        const allowed = (billstackVirtualAccountService.getAllowedBanks?.() || [])
            .map((b) => this.normalizeBillstackBank(b))
            .filter(Boolean);
        const filtered = allowed.length ? uniq.filter((b) => allowed.includes(b)) : uniq;
        if (strict) return filtered;
        if (!allowed.length) return filtered;
        if (filtered.length <= 1) {
            for (const b of allowed) {
                if (!filtered.includes(b)) filtered.push(b);
            }
        }
        return filtered;
    }

    isTransientProviderError(message) {
        const msg = String(message || '').trim();
        if (!msg) return false;
        const lower = msg.toLowerCase();
        if (lower.includes('cannot reserve') && (lower.includes('palmpay') || lower.includes('account'))) return true;
        if (lower.includes('temporarily') && (lower.includes('unavailable') || lower.includes('moment'))) return true;
        if (lower.includes('timeout') || lower.includes('timed out')) return true;
        return false;
    }

    getApprovedProviders() {
        return ['payvessel', 'billstack'];
    }

    getUserProvider(user) {
        const provider = user?.metadata?.va_provider;
        return String(provider || '').trim().toLowerCase();
    }

    isApprovedProvider(provider) {
        return this.getApprovedProviders().includes(String(provider || '').trim().toLowerCase());
    }

    async isPayvesselKycSatisfied(user) {
        if (process.env.NODE_ENV === 'test') return true;
        if (user?.bvn || user?.nin) return true;

        const allowMockBvnSetting = await this.getSetting('allow_mock_bvn');
        const allowMockBvn =
            allowMockBvnSetting === true ||
            allowMockBvnSetting === 1 ||
            allowMockBvnSetting === '1' ||
            allowMockBvnSetting === 'true';
        const envAllowsMockBvn = String(process.env.MOCK_BVN_ALLOWED || 'false').toLowerCase() === 'true';
        return Boolean(allowMockBvn && envAllowsMockBvn);
    }

    isDisplayableVirtualAccount(user) {
        if (!user?.virtual_account_number) return false;
        const provider = this.getUserProvider(user);
        return this.isApprovedProvider(provider);
    }

    getPhoneEligibility(user) {
        const rawPhone = String(user?.phone || '').trim();
        const phoneDigits = rawPhone.replace(/\D/g, '');
        const isValid =
            /^0\d{10}$/.test(rawPhone) ||
            (phoneDigits.startsWith('234') && phoneDigits.length === 13) ||
            (phoneDigits.startsWith('0') && phoneDigits.length === 11);
        return {
            rawPhone,
            isValid,
        };
    }

    async getProvisioningReadiness(user) {
        if (!user) {
            return {
                canAttempt: false,
                code: 'USER_NOT_FOUND',
                message: 'User not found.',
            };
        }

        if (user.virtual_account_number && this.isDisplayableVirtualAccount(user)) {
            return {
                canAttempt: false,
                code: 'ALREADY_ASSIGNED',
                message: 'A virtual account is already assigned.',
            };
        }

        if (!user.email || !user.name) {
            return {
                canAttempt: false,
                code: 'PROFILE_INCOMPLETE',
                message: 'Your profile is incomplete. Please update your name and email before requesting a virtual account.',
            };
        }

        const phone = this.getPhoneEligibility(user);
        if (!phone.isValid) {
            return {
                canAttempt: false,
                code: 'PHONE_INVALID',
                message: 'A valid Nigerian phone number is required to generate a virtual account.',
            };
        }

        const hasPayvessel = this.isPayvesselConfigured();
        const hasBillstack = this.isBillstackConfigured();
        if (!hasPayvessel && !hasBillstack) {
            return {
                canAttempt: false,
                code: 'PROVIDER_NOT_CONFIGURED',
                message: 'No virtual account provider is properly configured.',
            };
        }

        const payvesselKycOk = await this.isPayvesselKycSatisfied(user);
        if (!hasBillstack && hasPayvessel && !payvesselKycOk) {
            return {
                canAttempt: false,
                code: 'KYC_REQUIRED',
                message: 'KYC/BVN verification is required to generate a virtual account.',
            };
        }

        return {
            canAttempt: true,
            code: 'READY',
            message: 'Virtual account provisioning can be attempted.',
        };
    }

    async findUserByAccountNumber(accountNumber) {
        const acc = String(accountNumber || '').trim();
        if (!acc) return null;

        const direct = await User.findOne({ where: { virtual_account_number: acc } });
        if (direct) return direct;

        if (sequelize.getDialect && sequelize.getDialect() === 'sqlite') {
            const users = await User.findAll({ where: { metadata: { [Op.ne]: null } } });
            for (const u of users) {
                const billstackAcc = u?.metadata?.dual_virtual_accounts?.accounts?.billstack?.accountNumber;
                const payvesselAcc = u?.metadata?.dual_virtual_accounts?.accounts?.payvessel?.accountNumber;
                if (String(billstackAcc || '').trim() === acc || String(payvesselAcc || '').trim() === acc) {
                    return u;
                }
            }
            return null;
        }

        const sql = `
            SELECT *
            FROM "Users"
            WHERE ("metadata"::jsonb #>> '{dual_virtual_accounts,accounts,billstack,accountNumber}') = :acc
               OR ("metadata"::jsonb #>> '{dual_virtual_accounts,accounts,payvessel,accountNumber}') = :acc
            LIMIT 1
        `;

        const userFromMeta = await sequelize.query(sql, {
            replacements: { acc },
            model: User,
            mapToModel: true,
            plain: true,
            type: QueryTypes.SELECT,
        });

        return userFromMeta || null;
    }

    async quarantineUnauthorizedVirtualAccount(user, options = {}) {
        if (!user?.virtual_account_number) return false;
        if (this.isDisplayableVirtualAccount(user)) return false;

        const { transaction } = options;
        const meta = user.metadata || {};
        user.metadata = {
            ...meta,
            invalid_virtual_account: {
                provider: meta.va_provider ?? null,
                accountNumber: user.virtual_account_number,
                bankName: user.virtual_account_bank,
                accountName: user.virtual_account_name,
                quarantinedAt: new Date().toISOString(),
            },
            va_provider: null,
        };
        user.virtual_account_number = null;
        user.virtual_account_bank = null;
        user.virtual_account_name = null;
        await user.save({ transaction });
        return true;
    }

    isPayvesselConfigured() {
        if (process.env.NODE_ENV === 'test') return true;
        return Boolean(process.env.PAYVESSEL_API_KEY && process.env.PAYVESSEL_SECRET_KEY && process.env.PAYVESSEL_BUSINESS_ID);
    }

    isBillstackConfigured() {
        return billstackVirtualAccountService.isConfigured();
    }

    /**
     * Bulk provisioning for legacy users
     * @param {number} limit - Number of users to process in this batch
     * @returns {Promise<Object>} - Summary of the migration
     */
    async bulkMigrateLegacyUsers(limit = 50) {
        return this.bulkAssignMissingVirtualAccounts({ maxUsers: limit, batchSize: limit, notify: true, includeInactive: false });
    }

    /**
     * Secure notification for new virtual accounts
     * @param {User} user 
     */
    async notifyUserOfNewAccount(user) {
        const meta = user.metadata || {};
        const notifiedAt = meta.va_notified_at ? new Date(meta.va_notified_at) : null;
        if (notifiedAt && Number.isFinite(notifiedAt.getTime())) {
            const ageMs = Date.now() - notifiedAt.getTime();
            if (ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000 && meta.va_notified_account === user.virtual_account_number) {
                return;
            }
        }
        const message = `Hello ${user.name || 'User'}, your unique virtual account is now active! \nBank: ${user.virtual_account_bank}\nAccount No: ${user.virtual_account_number}\nName: ${user.virtual_account_name}\nYou can now fund your wallet instantly via bank transfer.`;
        
        // 1. Send SMS (if phone exists)
        if (user.phone) {
            try {
                await notificationService.sendSMS(user.phone, message);
            } catch (smsErr) {
                logger.error(`[VirtualAccount] SMS notification failed for ${user.id}: ${smsErr.message}`);
            }
        }

        // 2. Send Email/Push via notification service
        try {
            await notificationService.sendTransactionNotification(user, {
                type: 'virtual_account_activation',
                message: message,
                details: {
                    bank: user.virtual_account_bank,
                    accountNumber: user.virtual_account_number,
                    accountName: user.virtual_account_name
                }
            });
            user.metadata = { ...meta, va_notified_at: new Date().toISOString(), va_notified_account: user.virtual_account_number };
            await user.save();
        } catch (emailErr) {
            logger.error(`[VirtualAccount] Email notification failed for ${user.id}: ${emailErr.message}`);
        }
    }

    async recordProvisioningFailure(userId, errorMessage) {
        try {
            const user = await User.findByPk(userId);
            if (!user) return;
            const meta = user.metadata || {};
            const lastFailedAt = meta.va_last_failed_at ? new Date(meta.va_last_failed_at) : null;
            if (lastFailedAt && Number.isFinite(lastFailedAt.getTime())) {
                const ageMs = Date.now() - lastFailedAt.getTime();
                if (ageMs >= 0 && ageMs < 5 * 60 * 1000) {
                    return;
                }
            }
            const attempts = parseInt(String(meta.va_failed_attempts || 0), 10);
            const nextAttempts = Number.isFinite(attempts) ? attempts + 1 : 1;
            const errorText = String(errorMessage || 'Unknown error').slice(0, 500);
            const transient = this.isTransientProviderError(errorText);
            const baseDelayMs = 5 * 60 * 1000;
            const maxDelayMs = 6 * 60 * 60 * 1000;
            const exp = Math.min(6, Math.max(0, nextAttempts - 1));
            const backoffMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exp));
            const jitterMs = Math.floor(Math.random() * 15 * 1000);
            const nextRetryAt = new Date(Date.now() + backoffMs + jitterMs).toISOString();
            const next = {
                ...meta,
                va_status: transient ? 'pending' : 'failed',
                va_failed_attempts: nextAttempts,
                va_last_failed_at: new Date().toISOString(),
                va_last_error: errorText,
                va_next_retry_at: transient ? nextRetryAt : meta.va_next_retry_at || null,
            };
            await user.update({ metadata: next });

            const Notification = require('../models/Notification');
            await Notification.create({
                userId: user.id,
                title: 'Virtual account pending',
                message: transient
                    ? 'We are currently unable to reserve a virtual account from our bank partner. Please try again later.'
                    : `We could not generate your virtual account yet. ${next.va_last_error}`,
                type: 'warning',
                priority: 'high',
                link: '/dashboard/fund',
                metadata: { kind: 'va_provisioning_failed', attempts: nextAttempts }
            });

            const alertThreshold = parseInt(String(process.env.VA_ALERT_THRESHOLD || '3'), 10);
            if (Number.isFinite(alertThreshold) && nextAttempts === alertThreshold) {
                await Notification.create({
                    userId: null,
                    title: 'Virtual account provisioning failures',
                    message: `User ${user.email || user.id} has failed virtual account provisioning ${nextAttempts} times. Last error: ${next.va_last_error}`,
                    type: 'error',
                    priority: 'high',
                    metadata: { userId: user.id, attempts: nextAttempts }
                });
            }
        } catch (e) {
            logger.error(`[VirtualAccount] Failed to record provisioning failure for user ${userId}: ${e.message}`);
        }
    }

    async recordProvisioningAttempt(userId) {
        try {
            const user = await User.findByPk(userId);
            if (!user) return;
            const meta = user.metadata || {};
            const attempts = parseInt(String(meta.va_attempts || 0), 10);
            const nextAttempts = Number.isFinite(attempts) ? attempts + 1 : 1;
            await user.update({
                metadata: {
                    ...meta,
                    va_status: 'processing',
                    va_attempts: nextAttempts,
                    va_last_attempt_at: new Date().toISOString()
                }
            });
        } catch (e) {
            logger.error(`[VirtualAccount] Failed to record provisioning attempt for user ${userId}: ${e.message}`);
        }
    }

    async recordProvisioningSuccess(userId) {
        try {
            const user = await User.findByPk(userId);
            if (!user) return;
            const meta = user.metadata || {};
            await user.update({
                metadata: {
                    ...meta,
                    va_status: 'assigned',
                    va_assigned_at: new Date().toISOString(),
                    va_last_error: null
                }
            });
        } catch (e) {
            logger.error(`[VirtualAccount] Failed to record provisioning success for user ${userId}: ${e.message}`);
        }
    }

    async createLocalAccount(user, options = {}) {
        const { transaction } = options;
        const prefixSetting = await this.getSetting('local_virtual_account_prefix');
        const prefix = String(prefixSetting || process.env.LOCAL_VA_PREFIX || '901').replace(/\D/g, '').slice(0, 4) || '901';
        const moduloDigits = Math.max(1, 9 - prefix.length);
        const maxAttempts = 50;

        for (let nonce = 0; nonce < maxAttempts; nonce++) {
            const body = toNumericFromUuid(user.id, moduloDigits, nonce);
            const base = `${prefix}${body}`;
            const check = luhnCheckDigit(base);
            const accountNumber = `${base}${check}`;

            const exists = await User.count({
                where: { virtual_account_number: accountNumber },
                transaction
            });

            if (exists === 0) {
                const bankNameSetting = await this.getSetting('local_virtual_account_bank');
                const bankName = String(bankNameSetting || 'Peace Bundlle');
                const trackingReference = `LOCAL-${user.id}-${nonce}`;
                user.metadata = {
                    ...user.metadata,
                    local_virtual_account: { scheme: 'prefix+uuid+checksum', prefix, nonce }
                };
                return { accountNumber, bankName, accountName: user.name, trackingReference };
            }
        }

        throw new Error('Unable to generate a unique local virtual account number');
    }

    async bulkAssignMissingVirtualAccounts(options = {}) {
        const batchSize = Math.max(1, parseInt(options.batchSize || 100, 10));
        const maxUsers = options.maxUsers === undefined ? Infinity : Math.max(0, parseInt(options.maxUsers, 10));
        const notify = options.notify !== false;
        const includeInactive = options.includeInactive === true;
        const dryRun = options.dryRun === true;

        const summary = {
            total_found: 0,
            processed: 0,
            created: 0,
            skipped_inactive: 0,
            skipped_existing: 0,
            skipped_ineligible: 0,
            failed: 0,
            errors: []
        };

        let lastCreatedAt = null;
        let lastId = null;

        while (summary.processed < maxUsers) {
            const remaining = Number.isFinite(maxUsers) ? Math.max(0, maxUsers - summary.processed) : batchSize;
            const limit = Math.min(batchSize, remaining || batchSize);

            const where = {
                virtual_account_number: null
            };
            if (!includeInactive) {
                where.account_status = 'active';
            }

            if (lastCreatedAt && lastId) {
                where[Op.or] = [
                    { createdAt: { [Op.gt]: lastCreatedAt } },
                    { createdAt: lastCreatedAt, id: { [Op.gt]: lastId } }
                ];
            }

            const users = await User.findAll({
                where,
                order: [['createdAt', 'ASC'], ['id', 'ASC']],
                limit
            });

            if (summary.total_found === 0) {
                summary.total_found = users.length;
            } else {
                summary.total_found += users.length;
            }

            if (users.length === 0) break;

            for (const row of users) {
                if (summary.processed >= maxUsers) break;
                summary.processed++;

                if (!includeInactive && row.account_status !== 'active') {
                    summary.skipped_inactive++;
                    continue;
                }

                if (row.virtual_account_number) {
                    summary.skipped_existing++;
                    continue;
                }

                const readiness = await this.getProvisioningReadiness(row);
                if (!readiness.canAttempt) {
                    if (readiness.code === 'ALREADY_ASSIGNED') {
                        summary.skipped_existing++;
                    } else {
                        summary.skipped_ineligible++;
                    }
                    continue;
                }

                if (dryRun) {
                    summary.created++;
                    continue;
                }

                try {
                    await this.recordProvisioningAttempt(row.id);
                    let createdForUser = false;
                    await sequelize.transaction(async (t) => {
                        const freshUser = await User.findByPk(row.id, { transaction: t, lock: t.LOCK.UPDATE });
                        if (!freshUser) throw new Error('User not found');
                        if (freshUser.virtual_account_number) {
                            summary.skipped_existing++;
                            return;
                        }
                        if (!includeInactive && freshUser.account_status !== 'active') {
                            summary.skipped_inactive++;
                            return;
                        }

                        const details = await this.assignVirtualAccount(freshUser, { transaction: t });
                        if (!details) return;
                        createdForUser = true;
                        if (notify) {
                            try {
                                await this.notifyUserOfNewAccount(freshUser);
                            } catch (notifErr) {
                                logger.warn(`[VirtualAccount] Bulk notify failed for ${freshUser.email}: ${notifErr.message}`);
                            }
                        }
                    });
                    if (createdForUser) {
                        summary.created++;
                        await this.recordProvisioningSuccess(row.id);
                    }
                } catch (err) {
                    summary.failed++;
                    summary.errors.push({ userId: row.id, email: row.email, error: err.message });
                    logger.error(`[VirtualAccount] Bulk assignment failed for user ${row.id}: ${err.message}`);
                    await this.recordProvisioningFailure(row.id, err.message);
                }
            }

            const last = users[users.length - 1];
            lastCreatedAt = last.createdAt;
            lastId = last.id;
        }

        logger.info(`[VirtualAccount] Bulk assignment complete: ${summary.created} created, ${summary.failed} failed, ${summary.skipped_existing} skipped.`);
        return summary;
    }

    async getMonnifyToken() {
        const apiKey = await this.getSetting('monnify_api_key');
        const secretKey = await this.getSetting('monnify_secret_key');
        
        if (!apiKey || !secretKey) throw new Error('Monnify keys not configured');

        const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
        
        try {
            const response = await axios.post(`${this.monnifyBaseUrl}/api/v1/auth/login`, {}, {
                headers: { Authorization: `Basic ${auth}` }
            });
            return response.data.responseBody.accessToken;
        } catch (error) {
            console.error('Monnify Auth Error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Monnify');
        }
    }

    async createMonnifyAccount(user) {
        try {
            const token = await this.getMonnifyToken();
            const contractCode = await this.getSetting('monnify_contract_code');
            
            const response = await axios.post(
                `${this.monnifyBaseUrl}/api/v2/bank-transfer/reserved-accounts`,
                {
                    accountReference: `REF-${user.id}`,
                    accountName: user.name,
                    currencyCode: "NGN",
                    contractCode: contractCode,
                    customerEmail: user.email,
                    customerName: user.name,
                    getAllAvailableBanks: true
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const account = response.data.responseBody;
            return {
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountName: account.accountName
            };
        } catch (error) {
            console.error('Monnify Create Account Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async createPaystackAccount(user) {
        try {
            const secretKey = await this.getSetting('paystack_secret_key');
            if (!secretKey) throw new Error('Paystack secret key not configured');

            const response = await axios.post(
                `${this.paystackBaseUrl}/dedicated_account`,
                {
                    customer: user.email, // Paystack requires customer to be created first, usually email works if existing
                    preferred_bank: "wema-bank" 
                },
                {
                    headers: { Authorization: `Bearer ${secretKey}` }
                }
            );

            const account = response.data.data;
            return {
                accountNumber: account.account_number,
                bankName: account.bank.name,
                accountName: account.account_name
            };
        } catch (error) {
            // If customer doesn't exist, create customer then retry (simplified here)
            console.error('Paystack Create Account Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async assignVirtualAccount(user, options = {}) {
        const { transaction, force = false } = options;

        const inflight = this.getInflightMap();
        const inflightKey = String(user?.id || '');
        if (inflightKey && inflight.has(inflightKey)) {
            return await inflight.get(inflightKey);
        }
        const run = (async () => {
            if (!user) throw new Error('User not found.');
            const metaNow = user.metadata || {};
            if (!force && metaNow.va_status === 'pending' && metaNow.va_next_retry_at) {
                const nextRetryAt = new Date(metaNow.va_next_retry_at);
                if (Number.isFinite(nextRetryAt.getTime()) && nextRetryAt.getTime() > Date.now()) {
                    throw new Error('Virtual account generation is temporarily unavailable. Please try again later.');
                }
            }
        
        if (user.virtual_account_number && this.isDisplayableVirtualAccount(user)) {
            return null;
        }
        if (user.virtual_account_number && !this.isDisplayableVirtualAccount(user)) {
            await this.quarantineUnauthorizedVirtualAccount(user, { transaction });
        }

        const readiness = await this.getProvisioningReadiness(user);
        if (!readiness.canAttempt) {
            if (readiness.code === 'ALREADY_ASSIGNED') {
                return null;
            }
            throw new Error(readiness.message);
        }

        // Feature Flag: Check if generation is enabled
        const isEnabled = await this.getSetting('virtual_account_generation_enabled');
        if (isEnabled === false) {
            logger.info(`[VirtualAccount] Generation is currently disabled via feature flag for user ${user.id}`);
            return null;
        }

        // Prefer approved providers only
        try {
            const requestedProvider = (await this.getSetting('virtual_account_provider')) || 'payvessel';
            const normalizeProvider = (p) => String(p || '').trim().toLowerCase();
            const configuredProviders = [];
            if (this.isPayvesselConfigured()) configuredProviders.push('payvessel');
            if (this.isBillstackConfigured()) configuredProviders.push('billstack');

            const requestedNormalized = normalizeProvider(requestedProvider);
            const provider = configuredProviders.includes(requestedNormalized)
                ? normalizeProvider(requestedProvider)
                : configuredProviders[0];
            if (!provider) {
                throw new Error('No approved virtual account provider is configured');
            }
            
            let accountDetails;
            
            const existingPayvesselRef = user.metadata?.payvessel_tracking_reference;
            if (existingPayvesselRef && provider === 'payvessel') {
                logger.info(`[VirtualAccount] User ${user.id} already has a pending/existing PayVessel reference: ${existingPayvesselRef}. Skipping new creation.`);
                // In a real scenario, we might want to query PayVessel for this ref, 
                // but for now, we prevent a redundant POST.
                if (user.virtual_account_number) return null; 
            }
            const existingBillstackRef = user.metadata?.billstack_reference;
            if (existingBillstackRef && provider === 'billstack') {
                logger.info(`[VirtualAccount] User ${user.id} already has a pending/existing BillStack reference: ${existingBillstackRef}. Skipping new creation.`);
                if (user.virtual_account_number) return null;
            }

            const tryBillstack = async () => {
                const bankSetting = await this.getSetting('billstack_bank');
                const bank = bankSetting ? String(bankSetting) : process.env.BILLSTACK_BANK;
                const banksSetting = await this.getSetting('billstack_banks');
                const candidates = this.getBillstackBankCandidates(bank, banksSetting);
                const attempted = [];
                let lastError = null;
                for (const candidate of candidates) {
                    if (this.isBankCircuitOpen(candidate)) {
                        logger.warn('[VirtualAccount] BillStack bank circuit open; skipping', { userId: user.id, bank: candidate });
                        continue;
                    }
                    attempted.push(candidate);
                    try {
                        const requestReference = this.buildBillstackRequestReference(user.id, candidate);
                        user.metadata = {
                            ...(user.metadata || {}),
                            billstack_last_request_reference: requestReference,
                            billstack_last_bank: candidate,
                        };
                        await user.save({ transaction });

                        const billstack = await billstackVirtualAccountService.generateVirtualAccount(user, candidate, {
                            reference: requestReference,
                        });
                        this.markBankAttemptSuccess(candidate);
                        return {
                            accountNumber: billstack.accountNumber,
                            bankName: billstack.bankName,
                            accountName: billstack.accountName,
                            trackingReference: billstack.trackingReference,
                            raw: billstack.raw,
                            billstackBank: candidate,
                            attemptedBanks: attempted,
                        };
                    } catch (e) {
                        lastError = e;
                        const msg = String(e?.message || '');
                        const transient = this.isTransientProviderError(msg);
                        if (transient) {
                            this.markBankAttemptFailure(candidate);
                        }
                        if (!transient && candidate === candidates[0]) {
                            break;
                        }
                        continue;
                    }
                }
                const suffix = attempted.length ? ` (attempted banks: ${attempted.join(', ')})` : '';
                if (lastError) {
                    const msg = String(lastError?.message || 'BillStack failed');
                    throw new Error(`${msg}${suffix}`);
                }
                throw new Error(`BillStack virtual account creation failed${suffix}`);
            };

            let payvesselUsedMockBvn = false;
            const tryPayvessel = async () => {
                const kycOk = await this.isPayvesselKycSatisfied(user);
                if (!kycOk) {
                    throw new Error('KYC/BVN verification is required to generate a PayVessel virtual account');
                }
                if (process.env.NODE_ENV !== 'test' && !user.bvn && !user.nin) {
                    payvesselUsedMockBvn = true;
                }
                return payvesselService.createVirtualAccount(user);
            };

            const shouldTryRemote = provider === 'payvessel' || provider === 'billstack';
            const payvesselKycOk = provider === 'payvessel' ? await this.isPayvesselKycSatisfied(user) : true;
            const preferBillstackForNoKyc = provider === 'payvessel' && !payvesselKycOk && this.isBillstackConfigured();
            const fallbacks = shouldTryRemote
                ? (provider === 'billstack' || preferBillstackForNoKyc ? ['billstack', 'payvessel'] : ['payvessel', 'billstack'])
                : [];
            const providerErrors = {};
            for (const p of fallbacks) {
                if (p === 'payvessel' && !this.isPayvesselConfigured()) {
                    logger.warn('[VirtualAccount] PayVessel not configured; skipping', { userId: user.id });
                    continue;
                }
                if (p === 'billstack' && !this.isBillstackConfigured()) {
                    logger.warn('[VirtualAccount] BillStack not configured; skipping', { userId: user.id });
                    continue;
                }
                try {
                    if (p === 'payvessel') {
                        const kycOk = await this.isPayvesselKycSatisfied(user);
                        if (!kycOk) {
                            providerErrors[p] = new Error('KYC/BVN verification is required to generate a PayVessel virtual account');
                            continue;
                        }
                        accountDetails = await tryPayvessel();
                    }
                    if (p === 'billstack') accountDetails = await tryBillstack();
                    if (accountDetails) {
                        user.metadata = { ...user.metadata, va_provider: p };
                        break;
                    }
                } catch (e) {
                    logger.warn(`[VirtualAccount] Provider attempt failed (${p}) for user ${user.id}: ${e.message}`);
                    providerErrors[p] = e;
                }
            }

            if (!accountDetails && (provider === 'payvessel' || provider === 'billstack')) {
                const preferredError = providerErrors[provider];
                if (preferredError) {
                    throw preferredError;
                }

                const fallbackError = provider === 'payvessel' ? providerErrors.billstack : providerErrors.payvessel;
                if (fallbackError) {
                    throw fallbackError;
                }

                const missing = [];
                if (provider === 'payvessel') {
                    if (!this.isPayvesselConfigured()) missing.push('PAYVESSEL_API_KEY/PAYVESSEL_SECRET_KEY/PAYVESSEL_BUSINESS_ID');
                } else if (provider === 'billstack') {
                    if (!this.isBillstackConfigured()) missing.push('BILLSTACK_BASE_URL/BILLSTACK_SECRET_KEY');
                }
                if (!missing.length) {
                    throw new Error(`Provider ${provider} returned no account details`);
                }
                throw new Error(`No virtual account provider is properly configured (${missing.join(', ')})`);
            }

            if (!accountDetails) {
                throw new Error(`Provider ${provider} returned no account details`);
            }

            const effectiveProvider = user.metadata?.va_provider || provider;
            if (!this.isApprovedProvider(effectiveProvider)) {
                throw new Error(`Unauthorized virtual account provider: ${effectiveProvider}`);
            }

            if (accountDetails) {
                user.virtual_account_number = accountDetails.accountNumber;
                user.virtual_account_bank = accountDetails.bankName;
                user.virtual_account_name = accountDetails.accountName;
                if (accountDetails.trackingReference) {
                    user.metadata = {
                        ...user.metadata,
                        va_provider: effectiveProvider,
                        payvessel_tracking_reference: effectiveProvider === 'payvessel' ? accountDetails.trackingReference : user.metadata?.payvessel_tracking_reference,
                        billstack_reference: effectiveProvider === 'billstack' ? accountDetails.trackingReference : user.metadata?.billstack_reference,
                        billstack_bank_used: effectiveProvider === 'billstack' ? (accountDetails.billstackBank || null) : user.metadata?.billstack_bank_used,
                    };
                } else {
                    user.metadata = { ...user.metadata, va_provider: effectiveProvider };
                }
                if (effectiveProvider === 'payvessel' && payvesselUsedMockBvn) {
                    user.metadata = { ...user.metadata, mock_bvn_status: 'mock' };
                }
                await user.save({ transaction });
                logger.info(`[VirtualAccount] Assigned ${effectiveProvider} account for user ${user.id}`);
                return accountDetails;
            } else {
                throw new Error(`Provider ${provider} returned no account details`);
            }
        } catch (error) {
            logger.error(`[VirtualAccount] Failed to assign virtual account for user ${user.id}:`, error.message);
            throw error;
        }
        })();

        if (inflightKey) inflight.set(inflightKey, run);
        try {
            return await run;
        } finally {
            if (inflightKey) inflight.delete(inflightKey);
        }
    }

    async upgradeBillstackVirtualAccountIfEligible(user, options = {}) {
        const { transaction } = options;
        const provider = await this.getSetting('virtual_account_provider') || 'payvessel';
        if (provider !== 'billstack') return null;

        const bvn = user.bvn ? String(user.bvn).trim() : '';
        if (!bvn) return null;

        const alreadyUpgradedAt = user.metadata?.billstack_upgraded_at;
        if (alreadyUpgradedAt) return null;

        const response = await billstackVirtualAccountService.upgradeVirtualAccount(user.email, bvn);
        const responseCode = response?.responseCode;
        const ok =
            response?.status === true ||
            responseCode === 0 ||
            String(responseCode) === '00';

        user.metadata = {
            ...user.metadata,
            billstack_upgrade: {
                status: ok ? 'success' : 'failed',
                responseCode: responseCode ?? null,
                message: response?.message ?? null
            },
            billstack_upgraded_at: ok ? new Date().toISOString() : user.metadata?.billstack_upgraded_at
        };

        await user.save({ transaction });
        return { ok, response };
    }

    async getSetting(key) {
        const value = await SystemSetting.get(key);
        
        if (key === 'virtual_account_generation_enabled') {
            return value !== null ? value : true;
        }
        
        return value;
    }
}

module.exports = new VirtualAccountService();
