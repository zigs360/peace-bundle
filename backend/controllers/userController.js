const User = require('../models/User');
const Beneficiary = require('../models/Beneficiary');
const Referral = require('../models/Referral');
const ReferralClick = require('../models/ReferralClick');
const Commission = require('../models/Commission');
const Wallet = require('../models/Wallet');
const ApiKey = require('../models/ApiKey');
const Transaction = require('../models/Transaction');
const sequelize = require('../config/database');
const crypto = require('crypto');
const { Op } = require('sequelize');

const virtualAccountService = require('../services/virtualAccountService');
const dualVirtualAccountService = require('../services/dualVirtualAccountService');
const referralService = require('../services/referralService');
const logger = require('../utils/logger');

const maskUserName = (name) => {
    if (!name || typeof name !== 'string') return 'Valued User';
    const trimmed = name.trim();
    if (!trimmed) return 'Valued User';
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        const single = parts[0];
        if (single.length <= 2) return `${single}*`;
        return `${single.slice(0, 2)}***${single.slice(-1)}`;
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first} ${last[0].toUpperCase()}.`;
};

const maskAccountNumber = (accountNumber) => {
    const raw = String(accountNumber || '').trim();
    if (!raw) return null;
    const visible = 4;
    if (raw.length <= visible) return raw;
    return `${'*'.repeat(raw.length - visible)}${raw.slice(-visible)}`;
};

// @desc    Request Virtual Account (Self-Service)
// @route   POST /api/users/virtual-account/request
// @access  Private
const requestVirtualAccount = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.email || !user.name) {
            return res.json({
                success: false,
                code: 'PROFILE_INCOMPLETE',
                message: 'Your profile is incomplete. Please update your name and email before requesting a virtual account.'
            });
        }

        const metaNow = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
        if (metaNow.va_status === 'processing') {
            const lastAttemptAt = metaNow.va_last_attempt_at ? new Date(metaNow.va_last_attempt_at) : null;
            if (lastAttemptAt && Number.isFinite(lastAttemptAt.getTime())) {
                const ageMs = Date.now() - lastAttemptAt.getTime();
                if (ageMs >= 0 && ageMs < 60 * 1000) {
                    return res.status(202).json({
                        success: false,
                        code: 'PROVIDER_PROCESSING',
                        message: 'Virtual account generation is currently processing. Please check again shortly.',
                    });
                }
            }
        }
        if (user.virtual_account_number) {
            if (!virtualAccountService.isDisplayableVirtualAccount(user)) {
                logger.info(`[VirtualAccount] Quarantining obsolete virtual account during request for user ${userId} (${user.virtual_account_bank})`);
                await virtualAccountService.quarantineUnauthorizedVirtualAccount(user);
                user.virtual_account_number = null;
                user.virtual_account_bank = null;
                user.virtual_account_name = null;
            } else {
                const masked = maskAccountNumber(user.virtual_account_number);
                return res.json({
                    success: true,
                    message: 'You already have a virtual account assigned.',
                    hasVirtualAccount: true,
                    accountNumberMasked: masked,
                    last4: String(user.virtual_account_number).slice(-4),
                    bankName: user.virtual_account_bank,
                    accountName: user.virtual_account_name
                });
            }
        }

        const readiness = await virtualAccountService.getProvisioningReadiness(user);
        if (!readiness.canAttempt) {
            return res.json({
                success: false,
                code: readiness.code,
                message: readiness.message,
            });
        }

        // #region debug-point A:manual-request-entry
        (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'backend/controllers/userController.js:manual-request',msg:'[DEBUG] manual VA request entering assignVirtualAccount',data:{userId,hasExistingVa:Boolean(user.virtual_account_number),vaStatus:user.metadata?.va_status||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        logger.info(`[VirtualAccount] Manual request initiated by user ${userId} (${user.email})`);
        await virtualAccountService.recordProvisioningAttempt(userId);
        
        const account = await virtualAccountService.assignVirtualAccount(user, { force: true });
        await virtualAccountService.recordProvisioningSuccess(userId);

        // #region debug-point B:manual-request-success
        (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'backend/controllers/userController.js:manual-request',msg:'[DEBUG] manual VA request completed successfully',data:{userId,bankName:account?.bankName||null,accountNumberLast4:String(account?.accountNumber||'').slice(-4)||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion

        res.json({
            message: 'Virtual account generated successfully!',
            ...account
        });
        setImmediate(() => {
            virtualAccountService.notifyUserOfNewAccount(user).catch((e) => {
                logger.error(`[VirtualAccount] Notification failed for user ${userId}: ${e.message}`);
            });
        });
    } catch (error) {
        // #region debug-point C:manual-request-error
        (()=>{const fs=require('fs'),p='.dbg/manual-va-no-response.env';let u='http://127.0.0.1:7777/event',s='manual-va-no-response';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'backend/controllers/userController.js:manual-request',msg:'[DEBUG] manual VA request threw error',data:{userId,errorMessage:String(error?.message||''),attemptedBanks:Array.isArray(error?.details?.attemptedBanks)?error.details.attemptedBanks:[],code:error?.code||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        logger.error(`[VirtualAccount] Manual request failed for user ${userId}: ${error.message}`);
        await virtualAccountService.recordProvisioningFailure(userId, error.message);
        const msg = String(error.message || '');
        const lower = msg.toLowerCase();
        const isKyc = lower.includes('kyc') || lower.includes('bvn');
        const isConfig = lower.includes('configured') || lower.includes('provider');
        const isTransient = typeof virtualAccountService.isTransientProviderError === 'function'
            ? virtualAccountService.isTransientProviderError(msg)
            : false;
        if (isKyc) {
            return res.json({ success: false, code: 'KYC_REQUIRED', message: 'KYC/BVN verification is required to generate a virtual account.' });
        }
        if (isConfig) {
            return res.json({ success: false, code: 'PROVIDER_NOT_CONFIGURED', message: msg });
        }
        if (isTransient) {
            try {
                const fresh = await User.findByPk(userId);
                const meta = fresh?.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : {};
                const nextRetryAt = meta.va_next_retry_at ? new Date(meta.va_next_retry_at) : null;
                const retryAfterSeconds =
                    nextRetryAt && Number.isFinite(nextRetryAt.getTime()) && nextRetryAt.getTime() > Date.now()
                        ? Math.max(1, Math.ceil((nextRetryAt.getTime() - Date.now()) / 1000))
                        : null;
                if (retryAfterSeconds) res.set('Retry-After', String(retryAfterSeconds));
                return res.json({
                    success: false,
                    code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
                    message: 'Virtual account generation is temporarily unavailable. Please try again later.',
                    nextRetryAt: nextRetryAt && Number.isFinite(nextRetryAt.getTime()) ? nextRetryAt.toISOString() : null,
                    retryAfterSeconds,
                });
            } catch (e) {
                void e;
            }
            return res.json({
                success: false,
                code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
                message: 'Virtual account generation is temporarily unavailable. Please try again later.',
            });
        }
        return res.status(500).json({ 
            success: false, 
            message: msg || 'Failed to generate virtual account. Please try again later.' 
        });
    }
};

const getVirtualAccountSummary = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        logger.info('[AUDIT] Virtual account summary viewed', {
            userId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        const hasActiveAccount = user.virtual_account_number && virtualAccountService.hasActiveSupportedVirtualAccount(user);

        if (user.virtual_account_number && !hasActiveAccount) {
            logger.info(`[VirtualAccount] Quarantining obsolete virtual account for user ${userId} (${user.virtual_account_bank})`);
            await virtualAccountService.quarantineUnauthorizedVirtualAccount(user);
            user.virtual_account_number = null;
            user.virtual_account_bank = null;
            user.virtual_account_name = null;
        }

        if (!hasActiveAccount || !user.virtual_account_number) {
            const meta = user.metadata || {};
            const lastAttemptAt = meta.va_last_attempt_at ? new Date(meta.va_last_attempt_at) : null;
            if (meta.va_status === 'processing' && lastAttemptAt && Number.isFinite(lastAttemptAt.getTime())) {
                const ageMs = Date.now() - lastAttemptAt.getTime();
                if (ageMs >= 0 && ageMs < 2 * 60 * 1000) {
                    return res.json({ success: true, hasVirtualAccount: false, message: 'Your virtual account is being generated. Please refresh in a few minutes.' });
                }
            }
            if (meta.va_status === 'pending' && meta.va_next_retry_at) {
                const nextRetryAt = new Date(meta.va_next_retry_at);
                if (Number.isFinite(nextRetryAt.getTime()) && nextRetryAt.getTime() > Date.now()) {
                    return res.json({
                        success: true,
                        hasVirtualAccount: false,
                        message: 'Virtual account generation is temporarily unavailable. Please try again later.',
                        nextRetryAt: nextRetryAt.toISOString(),
                    });
                }
            }
            const readiness = await virtualAccountService.getProvisioningReadiness(user);
            if (!readiness.canAttempt) {
                return res.json({
                    success: true,
                    hasVirtualAccount: false,
                    code: readiness.code,
                    message: readiness.message,
                });
            }
            try {
                await virtualAccountService.recordProvisioningAttempt(user.id);
                const account = await virtualAccountService.assignVirtualAccount(user, { force: true });
                if (account) {
                    await virtualAccountService.recordProvisioningSuccess(user.id);
                    const masked = maskAccountNumber(user.virtual_account_number);
                    res.json({
                        success: true,
                        hasVirtualAccount: true,
                        accountNumberMasked: masked,
                        last4: String(user.virtual_account_number).slice(-4),
                        bankName: user.virtual_account_bank,
                        accountName: user.virtual_account_name,
                        needsMigrationWarning: Boolean(user.metadata?.needs_provider_migration_warning),
                    });
                    setImmediate(() => {
                        virtualAccountService.notifyUserOfNewAccount(user).catch((err) => {
                            logger.error(`[VirtualAccount] Notification failed for user ${user.id}: ${err.message}`);
                        });
                    });
                    return;
                }
                return res.json({
                  success: true,
                  hasVirtualAccount: false,
                  message: 'No virtual account assigned yet.'
                });
            } catch (e) {
                logger.warn(`[VirtualAccount] On-demand assignment failed for user ${user.id}: ${e.message}`);
                await virtualAccountService.recordProvisioningFailure(user.id, e.message);
                const msg = String(e.message || '');
                const lower = msg.toLowerCase();
                const isKyc = lower.includes('kyc') || lower.includes('bvn');
                const isPhone = lower.includes('phone');
                if (isKyc) {
                    return res.json({ success: true, hasVirtualAccount: false, message: 'KYC/BVN verification is required to generate a virtual account.' });
                }
                if (isPhone) {
                    return res.json({ success: true, hasVirtualAccount: false, message: 'A valid phone number is required to generate a virtual account.' });
                }
                return res.json({ success: true, hasVirtualAccount: false, message: 'Virtual account generation is temporarily unavailable. Please try again later.' });
            }
        }

        if (!virtualAccountService.isDisplayableVirtualAccount(user)) {
            return res.json({
                success: true,
                hasVirtualAccount: false,
                message: 'No valid virtual account assigned yet.'
            });
        }

        const masked = maskAccountNumber(user.virtual_account_number);

        return res.json({
            success: true,
            hasVirtualAccount: true,
            accountNumberMasked: masked,
            last4: String(user.virtual_account_number).slice(-4),
            bankName: user.virtual_account_bank,
            accountName: user.virtual_account_name,
            needsMigrationWarning: Boolean(user.metadata?.needs_provider_migration_warning),
        });
    } catch (error) {
        logger.error(`[VirtualAccount] Failed to fetch summary for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load virtual account details' });
    }
};

const revealVirtualAccountNumber = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.virtual_account_number) {
            return res.status(404).json({ success: false, message: 'No virtual account assigned yet.' });
        }
        if (!virtualAccountService.isDisplayableVirtualAccount(user)) {
            return res.status(404).json({ success: false, message: 'No valid virtual account assigned yet.' });
        }

        logger.info('[AUDIT] Virtual account revealed', {
            userId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.json({
            success: true,
            accountNumber: user.virtual_account_number
        });
    } catch (error) {
        logger.error(`[VirtualAccount] Reveal failed for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to reveal account number' });
    }
};

const auditVirtualAccountAccess = async (req, res) => {
    const userId = req.user.id;
    const { action } = req.body;

    try {
        const user = await User.findByPk(userId, { attributes: ['id'] });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        logger.info('[AUDIT] Virtual account access event', {
            userId: user.id,
            action,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.json({ success: true });
    } catch (error) {
        logger.error(`[VirtualAccount] Audit log failed for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to record audit event' });
    }
};

const fetchDualVirtualAccounts = async (req, res) => {
    const userId = req.user.id;
    try {
        const timeoutMsRaw = parseInt(req.body?.timeoutMs, 10);
        const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.min(10000, Math.max(500, timeoutMsRaw)) : 10000;
        const retry = req.body?.retry && typeof req.body.retry === 'object' ? req.body.retry : undefined;
        const retryConfig = retry
            ? {
                  retries: Number.isFinite(parseInt(retry.retries, 10)) ? Math.min(5, Math.max(0, parseInt(retry.retries, 10))) : undefined,
                  baseDelayMs: Number.isFinite(parseInt(retry.baseDelayMs, 10)) ? Math.min(2000, Math.max(0, parseInt(retry.baseDelayMs, 10))) : undefined,
                  maxDelayMs: Number.isFinite(parseInt(retry.maxDelayMs, 10)) ? Math.min(5000, Math.max(0, parseInt(retry.maxDelayMs, 10))) : undefined
              }
            : undefined;

        const result = await dualVirtualAccountService.ensureDualVirtualAccounts(userId, { timeoutMs, retry: retryConfig });
        if (result.overallStatus === 'failed') {
            return res.status(502).json({ success: false, ...result });
        }
        return res.json(result);
    } catch (error) {
        logger.error(`[DualVA] Failed for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to retrieve dual virtual accounts' });
    }
};

const getDualVirtualAccountsSnapshot = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await dualVirtualAccountService.getDualVirtualAccountsSnapshot(userId);
        return res.json(result);
    } catch (error) {
        logger.error(`[DualVA] Snapshot failed for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load dual virtual accounts snapshot' });
    }
};

// @desc    Get API Key
// @route   GET /api/users/apikey
// @access  Private
const getApiKey = async (req, res) => {
    const userId = req.user.id;
    try {
        let apiKey = await ApiKey.findOne({ where: { userId } });
        
        if (!apiKey) {
            const key = 'pk_live_' + crypto.randomBytes(16).toString('hex');
            const secret = 'sk_live_' + crypto.randomBytes(16).toString('hex');
            
            apiKey = await ApiKey.create({
                userId,
                name: 'Default Key',
                key: key,
                secret: secret
            });

            logger.info(`[APIKey] New key generated for user ${userId}`);

            return res.json({
                key: apiKey.key,
                secret: apiKey.secret,
                isActive: apiKey.is_active,
                message: 'API Key generated successfully. Please save your secret key securely.'
            });
        }
        
        res.json({
            key: apiKey.key,
            secret: '********************', // Masked
            isActive: apiKey.is_active
        });
    } catch (error) {
        logger.error(`[APIKey] Fetch error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve API key' 
        });
    }
};

// @desc    Generate New API Key
// @route   POST /api/users/apikey/regenerate
// @access  Private
const regenerateApiKey = async (req, res) => {
    const userId = req.user.id;
    try {
        const key = 'pk_live_' + crypto.randomBytes(16).toString('hex');
        const secret = 'sk_live_' + crypto.randomBytes(16).toString('hex');
        
        let apiKey = await ApiKey.findOne({ where: { userId } });
        
        if (apiKey) {
            apiKey.key = key;
            apiKey.secret = secret;
            await apiKey.save();
        } else {
            apiKey = await ApiKey.create({
                userId,
                name: 'Default Key',
                key: key,
                secret: secret
            });
        }
        
        logger.info(`[APIKey] Key regenerated for user ${userId}`);

        res.json({
            key: apiKey.key,
            secret: apiKey.secret,
            isActive: apiKey.is_active,
            message: 'New API Key generated successfully. Previous keys are now invalid.'
        });
    } catch (error) {
        logger.error(`[APIKey] Regeneration error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to regenerate API key' 
        });
    }
};

// @desc    Get Affiliate Stats
// @route   GET /api/users/affiliate-stats
// @access  Private
const getAffiliateStats = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId, {
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        if (!user.referral_code) {
            try {
                const newRefCode = await referralService.generateUniqueCode(user.name);
                user.referral_code = newRefCode;
                await user.update({ referral_code: newRefCode });
            } catch (refErr) {
                logger.warn(`[Affiliate] Failed to generate referral code for ${user.id}: ${refErr.message}`);
            }
        }

        const referrals = await Referral.findAll({
            where: { referrerId: userId },
            include: [{ 
                model: User, 
                as: 'ReferredUser',
                attributes: ['name', 'createdAt', 'kyc_status'] 
            }],
            order: [['createdAt', 'DESC']]
        });

        const pendingPayout = await Commission.sum('amount', {
            where: {
                referrerId: userId,
                status: 'pending',
            }
        });
        const totalClicks = await ReferralClick.count({
            where: { referrerId: userId }
        });
        const totalConvertedClicks = await ReferralClick.count({
            where: {
                referrerId: userId,
                converted_at: { [Op.ne]: null },
            }
        });
        const totalRefereeRewardsIssued = referrals.reduce(
            (sum, ref) => sum + parseFloat(ref.referee_signup_bonus_amount || 0),
            0,
        );
        const totalEarnings = user.wallet
            ? (parseFloat(user.wallet.bonus_balance || 0) + parseFloat(user.wallet.commission_balance || 0))
            : 0;
        const conversionRate = totalClicks > 0 ? Number(((totalConvertedClicks / totalClicks) * 100).toFixed(2)) : 0;
        
        const recentReferrals = referrals.map(ref => ({
            name: ref.ReferredUser ? ref.ReferredUser.name : 'Unknown',
            date: ref.createdAt,
            status: ref.status || (ref.referrer_signup_bonus_awarded_at ? 'rewarded' : 'pending'),
            isRewarded: Boolean(ref.referrer_signup_bonus_awarded_at),
            qualifyingDepositAmount: ref.qualifying_deposit_amount || 0,
            qualifyingDepositAt: ref.qualifying_deposit_at || null,
            commission: ref.total_commissions_earned,
            referrerReward: ref.referrer_signup_bonus_amount || 0,
            refereeReward: ref.referee_signup_bonus_amount || 0,
        }));

        res.json({
            referralCode: user.referral_code,
            referralLink: `https://peacebundlle.com/register?ref=${user.referral_code}`,
            totalEarnings,
            pendingPayout: pendingPayout || 0,
            totalClicks,
            totalConvertedClicks,
            conversionRate,
            totalRefereeRewardsIssued,
            referredUsersCount: referrals.length,
            recentReferrals
        });
    } catch (error) {
        logger.error(`[Affiliate] Stats fetch error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve affiliate statistics' 
        });
    }
};

// @desc    Get User Beneficiaries
// @route   GET /api/users/beneficiaries/:userId
// @access  Private
const getBeneficiaries = async (req, res) => {
    const userId = req.user.id;

    try {
        const beneficiaries = await Beneficiary.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });
        res.json(beneficiaries);
    } catch (error) {
        logger.error(`[Beneficiary] Fetch error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve beneficiaries' 
        });
    }
};

// @desc    Add Beneficiary
// @route   POST /api/users/beneficiaries
// @access  Private
const addBeneficiary = async (req, res) => {
    const { name, phone, network, accountNumber, bankName } = req.body;
    const userId = req.user.id;

    if (!name || (!phone && !accountNumber)) {
        return res.status(400).json({ 
            success: false,
            message: 'Name and at least one contact method (Phone or Account Number) are required' 
        });
    }

    try {
        const newBeneficiary = await Beneficiary.create({
            userId,
            name,
            phoneNumber: phone,
            network: (network || 'others').toLowerCase(),
            accountNumber,
            bankName
        });

        const beneficiaries = await Beneficiary.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });

        logger.info(`[Beneficiary] Added for user ${userId}: ${name}`);

        res.status(201).json({
            message: 'Beneficiary added successfully',
            beneficiary: newBeneficiary,
            beneficiaries
        });
    } catch (error) {
        logger.error(`[Beneficiary] Add error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to add beneficiary' 
        });
    }
};

// @desc    Delete Beneficiary
// @route   DELETE /api/users/beneficiaries/:userId/:beneficiaryId
// @access  Private
const deleteBeneficiary = async (req, res) => {
    const userId = req.user.id;
    const beneficiaryId = req.params.beneficiaryId;

    try {
        const deleted = await Beneficiary.destroy({
            where: {
                id: beneficiaryId,
                userId
            }
        });

        if (deleted) {
            const beneficiaries = await Beneficiary.findAll({
                where: { userId },
                order: [['createdAt', 'DESC']]
            });

            logger.info(`[Beneficiary] Deleted for user ${userId}: ID ${beneficiaryId}`);

            res.json({
                message: 'Beneficiary removed successfully',
                beneficiaries
            });
        } else {
            res.status(404).json({ 
                message: 'Beneficiary not found or unauthorized' 
            });
        }
    } catch (error) {
        logger.error(`[Beneficiary] Delete error for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to remove beneficiary' 
        });
    }
};

// @desc    Update user's Firebase Cloud Messaging token
// @route   POST /api/users/fcm-token
// @access  Private
const updateFcmToken = async (req, res) => {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'FCM Token is required'
        });
    }

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userMeta = user.metadata || {};
        await user.update({
            metadata: {
                ...userMeta,
                fcmToken: token
            }
        });

        logger.info(`[FCM] Token updated for user ${userId}`);

        res.json({
            success: true,
            message: 'FCM Token updated successfully'
        });
    } catch (error) {
        logger.error(`[FCM] Token update failed for user ${userId}: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to update FCM Token'
        });
    }
};

const getWalletSummary = async (req, res) => {
    const userId = req.user.id;
    try {
        let user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Lazy re-provisioning if user lacks active supported account
        const hasActiveAccount = user.virtual_account_number && virtualAccountService.hasActiveSupportedVirtualAccount(user);
        if (!hasActiveAccount) {
            const readiness = await virtualAccountService.getProvisioningReadiness(user);
            if (readiness.canAttempt) {
                try {
                    await virtualAccountService.recordProvisioningAttempt(user.id);
                    const account = await virtualAccountService.assignVirtualAccount(user, { force: true });
                    if (account) {
                        await virtualAccountService.recordProvisioningSuccess(user.id);
                        await user.reload();
                    }
                } catch (e) {
                    logger.warn(`[Wallet] Lazy provisioning in getWalletSummary failed for user ${user.id}: ${e.message}`);
                }
            }
        }

        const walletBalance = Number(user.wallet_balance || 0);
        const hasValidVa = virtualAccountService.isDisplayableVirtualAccount(user);

        return res.json({
            success: true,
            walletBalance,
            balance: walletBalance,
            needs_provider_migration_warning: Boolean(user.metadata?.needs_provider_migration_warning),
            hasVirtualAccount: hasValidVa,
            virtualAccount: hasValidVa ? {
                accountNumberMasked: maskAccountNumber(user.virtual_account_number),
                last4: String(user.virtual_account_number).slice(-4),
                bankName: user.virtual_account_bank,
                accountName: user.virtual_account_name,
            } : null,
        });
    } catch (error) {
        logger.error(`[Wallet] Failed to fetch wallet summary for user ${userId}: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load wallet summary' });
    }
};

// @desc    Get dynamic leaderboard of top users (privacy-safe)
// @route   GET /api/users/leaderboard
// @access  Private
const getLeaderboard = async (req, res) => {
    try {
        const period = String(req.query.period || 'all_time').toLowerCase();
        const category = String(req.query.category || 'volume').toLowerCase();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 5), 50);
        const currentUserId = req.user?.id;

        let startDate = null;
        const now = new Date();
        if (period === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (category === 'referrals') {
            const whereRef = {
                status: { [Op.in]: ['qualified', 'rewarded'] }
            };
            if (startDate) {
                whereRef.createdAt = { [Op.gte]: startDate };
            }

            const referralAgg = await Referral.findAll({
                attributes: [
                    'referrerId',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                ],
                where: whereRef,
                group: ['referrerId'],
                order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
                raw: true,
            });

            const topUserIds = referralAgg.map(r => r.referrerId).filter(Boolean);
            const users = await User.findAll({
                where: {
                    id: { [Op.in]: topUserIds },
                    role: { [Op.in]: ['user', 'reseller'] }
                },
                attributes: ['id', 'name', 'avatar'],
                raw: true,
            });
            const userMap = new Map(users.map(u => [String(u.id), u]));

            const leaderboard = [];
            let myRank = null;
            let rankCounter = 1;

            for (const item of referralAgg) {
                const u = userMap.get(String(item.referrerId));
                if (!u) continue;

                const count = parseInt(item.count, 10) || 0;
                const isCurrentUser = currentUserId && String(u.id) === String(currentUserId);
                if (isCurrentUser) {
                    myRank = rankCounter;
                }

                if (leaderboard.length < limit) {
                    leaderboard.push({
                        rank: rankCounter,
                        displayName: maskUserName(u.name),
                        avatar: u.avatar || null,
                        score: count,
                        qualifiedReferrals: count,
                        isCurrentUser: Boolean(isCurrentUser)
                    });
                }
                rankCounter++;
            }

            let myScore = 0;
            if (currentUserId) {
                const myAgg = referralAgg.find(r => String(r.referrerId) === String(currentUserId));
                if (myAgg) myScore = parseInt(myAgg.count, 10) || 0;
            }

            return res.json({
                success: true,
                period,
                category,
                leaderboard,
                myStats: {
                    rank: myRank || '-',
                    score: myScore,
                    qualifiedReferrals: myScore,
                    category
                }
            });
        }

        // 'volume' or 'transactions'
        const whereTxn = {
            status: 'completed',
            type: 'debit',
            source: { [Op.ne]: 'refund' }
        };
        if (startDate) {
            whereTxn.createdAt = { [Op.gte]: startDate };
        }

        const txnAgg = await Transaction.findAll({
            attributes: [
                'userId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalVolume'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
            ],
            where: whereTxn,
            group: ['userId'],
            order: category === 'transactions'
                ? [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
                : [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
            raw: true,
        });

        const userIds = txnAgg.map(t => t.userId).filter(Boolean);
        const users = await User.findAll({
            where: {
                id: { [Op.in]: userIds },
                role: { [Op.in]: ['user', 'reseller'] }
            },
            attributes: ['id', 'name', 'avatar'],
            raw: true,
        });
        const userMap = new Map(users.map(u => [String(u.id), u]));

        const leaderboard = [];
        let myRank = null;
        let rankCounter = 1;

        for (const item of txnAgg) {
            const u = userMap.get(String(item.userId));
            if (!u) continue;

            const volume = parseFloat(item.totalVolume) || 0;
            const count = parseInt(item.transactionCount, 10) || 0;
            const score = category === 'transactions' ? count : volume;
            const isCurrentUser = currentUserId && String(u.id) === String(currentUserId);
            if (isCurrentUser) {
                myRank = rankCounter;
            }

            if (leaderboard.length < limit) {
                leaderboard.push({
                    rank: rankCounter,
                    displayName: maskUserName(u.name),
                    avatar: u.avatar || null,
                    score,
                    volume,
                    transactionCount: count,
                    isCurrentUser: Boolean(isCurrentUser)
                });
            }
            rankCounter++;
        }

        let myVolume = 0;
        let myCount = 0;
        if (currentUserId) {
            const myTxn = txnAgg.find(t => String(t.userId) === String(currentUserId));
            if (myTxn) {
                myVolume = parseFloat(myTxn.totalVolume) || 0;
                myCount = parseInt(myTxn.transactionCount, 10) || 0;
            }
        }

        return res.json({
            success: true,
            period,
            category,
            leaderboard,
            myStats: {
                rank: myRank || '-',
                score: category === 'transactions' ? myCount : myVolume,
                volume: myVolume,
                transactionCount: myCount,
                category
            }
        });
    } catch (error) {
        logger.error(`[Leaderboard] Failed to fetch leaderboard: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load leaderboard' });
    }
};

module.exports = {
    getBeneficiaries,
    addBeneficiary,
    deleteBeneficiary,
    getAffiliateStats,
    getApiKey,
    regenerateApiKey,
    requestVirtualAccount,
    getVirtualAccountSummary,
    revealVirtualAccountNumber,
    auditVirtualAccountAccess,
    fetchDualVirtualAccounts,
    getDualVirtualAccountsSnapshot,
    updateFcmToken,
    getWalletSummary,
    getLeaderboard
};

