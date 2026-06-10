const User = require('../models/User');
const Beneficiary = require('../models/Beneficiary');
const Referral = require('../models/Referral');
const Wallet = require('../models/Wallet');
const ApiKey = require('../models/ApiKey');
const crypto = require('crypto');

const virtualAccountService = require('../services/virtualAccountService');
const dualVirtualAccountService = require('../services/dualVirtualAccountService');
const logger = require('../utils/logger');

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
        if (metaNow.va_status === 'pending' && metaNow.va_next_retry_at) {
            const nextRetryAt = new Date(metaNow.va_next_retry_at);
            if (Number.isFinite(nextRetryAt.getTime()) && nextRetryAt.getTime() > Date.now()) {
                const retryAfterSeconds = Math.max(1, Math.ceil((nextRetryAt.getTime() - Date.now()) / 1000));
                res.set('Retry-After', String(retryAfterSeconds));
                return res.json({
                    success: false,
                    code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
                    message: 'Virtual account generation is temporarily unavailable. Please try again later.',
                    nextRetryAt: nextRetryAt.toISOString(),
                    retryAfterSeconds,
                });
            }
        }

        if (user.virtual_account_number) {
            if (!virtualAccountService.isDisplayableVirtualAccount(user)) {
                await virtualAccountService.quarantineUnauthorizedVirtualAccount(user);
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
        
        const account = await virtualAccountService.assignVirtualAccount(user);
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

        if (!user.virtual_account_number) {
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
                const account = await virtualAccountService.assignVirtualAccount(user);
                if (account) {
                    await virtualAccountService.recordProvisioningSuccess(user.id);
                    const masked = maskAccountNumber(user.virtual_account_number);
                    res.json({
                        success: true,
                        hasVirtualAccount: true,
                        accountNumberMasked: masked,
                        last4: String(user.virtual_account_number).slice(-4),
                        bankName: user.virtual_account_bank,
                        accountName: user.virtual_account_name
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
            accountName: user.virtual_account_name
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

        const referrals = await Referral.findAll({
            where: { referrerId: userId },
            include: [{ 
                model: User, 
                as: 'ReferredUser',
                attributes: ['name', 'createdAt', 'kyc_status'] 
            }],
            order: [['createdAt', 'DESC']]
        });

        const totalEarnings = user.wallet ? user.wallet.commission_balance : 0;
        
        const recentReferrals = referrals.map(ref => ({
            name: ref.ReferredUser ? ref.ReferredUser.name : 'Unknown',
            date: ref.createdAt,
            status: ref.ReferredUser && ref.ReferredUser.kyc_status === 'verified' ? 'Active' : 'Inactive',
            commission: ref.total_commissions_earned
        }));

        res.json({
            referralCode: user.referral_code,
            referralLink: `https://peacebundlle.com/register?ref=${user.referral_code}`,
            totalEarnings,
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
    updateFcmToken
};
