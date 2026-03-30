const User = require('../models/User');
const Beneficiary = require('../models/Beneficiary');
const Referral = require('../models/Referral');
const Wallet = require('../models/Wallet');
const ApiKey = require('../models/ApiKey');
const crypto = require('crypto');

const virtualAccountService = require('../services/virtualAccountService');
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
            return res.status(400).json({
                success: false,
                message: 'Your profile is incomplete. Please update your name and email before requesting a virtual account.'
            });
        }

        const rawPhone = String(user.phone || '').trim();
        const phoneDigits = rawPhone.replace(/\D/g, '');
        const isPhoneValid =
            /^0\d{10}$/.test(rawPhone) ||
            (phoneDigits.startsWith('234') && phoneDigits.length === 13) ||
            (phoneDigits.startsWith('0') && phoneDigits.length === 11);

        if (!rawPhone || !isPhoneValid) {
            return res.status(400).json({
                success: false,
                message: 'A valid Nigerian phone number is required on your profile before requesting a virtual account.'
            });
        }

        if (user.virtual_account_number) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already have a virtual account assigned.',
                data: {
                    bank: user.virtual_account_bank,
                    accountNumber: user.virtual_account_number,
                    accountName: user.virtual_account_name
                }
            });
        }

        // Check if KYC is required for VA creation (some providers require BVN/KYC)
        // If BVN is missing and required, we might need to prompt for it
        // Note: For PayVessel, some business models allow initial creation without full BVN, 
        // but it's safer to have it if required by your settings.
        const allowMockBvnSetting = await virtualAccountService.getSetting('allow_mock_bvn');
        const allowMockBvn =
            allowMockBvnSetting === true ||
            allowMockBvnSetting === 1 ||
            allowMockBvnSetting === '1' ||
            allowMockBvnSetting === 'true';
        if (!user.bvn && !user.is_bvn_verified && !allowMockBvn) {
            return res.status(400).json({ 
                success: false, 
                message: 'KYC/BVN verification is required to generate a virtual account. Please verify your identity first.' 
            });
        }

        logger.info(`[VirtualAccount] Manual request initiated by user ${userId} (${user.email})`);
        
        const account = await virtualAccountService.assignVirtualAccount(user);
        
        // Notify user immediately
        await virtualAccountService.notifyUserOfNewAccount(user);

        res.json({
            message: 'Virtual account generated successfully!',
            ...account
        });
    } catch (error) {
        logger.error(`[VirtualAccount] Manual request failed for user ${userId}: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to generate virtual account. Please try again later.' 
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
            try {
                const account = await virtualAccountService.assignVirtualAccount(user);
                if (account) {
                    const masked = maskAccountNumber(user.virtual_account_number);
                    return res.json({
                        success: true,
                        hasVirtualAccount: true,
                        accountNumberMasked: masked,
                        last4: String(user.virtual_account_number).slice(-4),
                        bankName: user.virtual_account_bank,
                        accountName: user.virtual_account_name
                    });
                }
            } catch (e) {
                logger.warn(`[VirtualAccount] On-demand assignment failed for user ${user.id}: ${e.message}`);
            }
            return res.json({
              success: true,
              hasVirtualAccount: false,
              message: 'No virtual account assigned yet.'
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
    auditVirtualAccountAccess
};
