const axios = require('axios');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('./payvesselService');
const logger = require('../utils/logger');
const sequelize = require('../config/database'); // Added sequelize import

const notificationService = require('./notificationService');
const billstackVirtualAccountService = require('./billstackVirtualAccountService');

const { Op } = require('sequelize');

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
            const next = {
                ...meta,
                va_status: 'failed',
                va_failed_attempts: nextAttempts,
                va_last_failed_at: new Date().toISOString(),
                va_last_error: String(errorMessage || 'Unknown error').slice(0, 500)
            };
            await user.update({ metadata: next });

            const Notification = require('../models/Notification');
            await Notification.create({
                userId: user.id,
                title: 'Virtual account pending',
                message: `We could not generate your virtual account yet. ${next.va_last_error}`,
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
        const { transaction } = options;
        
        if (user.virtual_account_number) {
            return null;
        }

        // Feature Flag: Check if generation is enabled
        const isEnabled = await this.getSetting('virtual_account_generation_enabled');
        if (isEnabled === false) {
            logger.info(`[VirtualAccount] Generation is currently disabled via feature flag for user ${user.id}`);
            return null;
        }

        // Prefer PayVessel, fallback to Monnify or others
        try {
            const fallbackSetting = await this.getSetting('virtual_account_fallback_to_local');
            const allowLocalFallback =
                fallbackSetting === null ||
                fallbackSetting === undefined ||
                fallbackSetting === true ||
                fallbackSetting === 1 ||
                fallbackSetting === '1' ||
                fallbackSetting === 'true';

            const requestedProvider = (await this.getSetting('virtual_account_provider')) || 'payvessel';
            const normalizeProvider = (p) => String(p || '').trim().toLowerCase();
            const configuredProviders = [];
            if (this.isPayvesselConfigured()) configuredProviders.push('payvessel');
            if (this.isBillstackConfigured()) configuredProviders.push('billstack');
            configuredProviders.push('local', 'monnify', 'paystack');

            const provider = configuredProviders.includes(normalizeProvider(requestedProvider))
                ? normalizeProvider(requestedProvider)
                : 'payvessel';
            
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
                const billstack = await billstackVirtualAccountService.generateVirtualAccount(user, bank);
                return {
                    accountNumber: billstack.accountNumber,
                    bankName: billstack.bankName,
                    accountName: billstack.accountName,
                    trackingReference: billstack.trackingReference,
                    raw: billstack.raw
                };
            };

            let payvesselUsedMockBvn = false;
            const tryPayvessel = async () => {
                if (process.env.NODE_ENV !== 'test') {
                    const allowMockBvnSetting = await this.getSetting('allow_mock_bvn');
                    const allowMockBvn =
                        allowMockBvnSetting === true ||
                        allowMockBvnSetting === 1 ||
                        allowMockBvnSetting === '1' ||
                        allowMockBvnSetting === 'true';
                    const hasKycId = Boolean(user.bvn || user.nin);
                    const envAllowsMockBvn = String(process.env.MOCK_BVN_ALLOWED || 'false').toLowerCase() === 'true';
                    const mockAllowed = allowMockBvn && envAllowsMockBvn;
                    if (!hasKycId && !mockAllowed) {
                        throw new Error('KYC/BVN verification is required to generate a PayVessel virtual account');
                    }
                    if (!hasKycId && mockAllowed) {
                        payvesselUsedMockBvn = true;
                    }
                }
                return payvesselService.createVirtualAccount(user);
            };

            const shouldTryRemote = provider === 'payvessel' || provider === 'billstack';
            const fallbacks = shouldTryRemote ? (provider === 'billstack' ? ['billstack', 'payvessel'] : ['payvessel', 'billstack']) : [];
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
                    if (p === 'payvessel') accountDetails = await tryPayvessel();
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

            if (!accountDetails) {
                if (provider === 'local') {
                    accountDetails = await this.createLocalAccount(user, { transaction });
                } else if (provider === 'monnify') {
                    accountDetails = await this.createMonnifyAccount(user);
                } else if (provider === 'paystack') {
                    accountDetails = await this.createPaystackAccount(user);
                }
            }

            if (!accountDetails && allowLocalFallback && (provider === 'payvessel' || provider === 'billstack')) {
                accountDetails = await this.createLocalAccount(user, { transaction });
                user.metadata = { ...user.metadata, va_provider: 'local' };
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

            if (accountDetails) {
                user.virtual_account_number = accountDetails.accountNumber;
                user.virtual_account_bank = accountDetails.bankName;
                user.virtual_account_name = accountDetails.accountName;
                if (accountDetails.trackingReference) {
                    user.metadata = {
                        ...user.metadata,
                        va_provider: effectiveProvider,
                        payvessel_tracking_reference: effectiveProvider === 'payvessel' ? accountDetails.trackingReference : user.metadata?.payvessel_tracking_reference,
                        billstack_reference: effectiveProvider === 'billstack' ? accountDetails.trackingReference : user.metadata?.billstack_reference
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
