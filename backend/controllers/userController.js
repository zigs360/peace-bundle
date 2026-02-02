const User = require('../models/User');
const Beneficiary = require('../models/Beneficiary');
const Referral = require('../models/Referral');
const Wallet = require('../models/Wallet');
const ApiKey = require('../models/ApiKey');
const crypto = require('crypto');

// @desc    Get API Key
// @route   GET /api/users/apikey
// @access  Private
const getApiKey = async (req, res) => {
    const userId = req.user.id;
    try {
        let apiKey = await ApiKey.findOne({ where: { userId } });
        
        if (!apiKey) {
            // Generate one if not exists
            const key = 'pk_live_' + crypto.randomBytes(16).toString('hex');
            const secret = 'sk_live_' + crypto.randomBytes(16).toString('hex');
            
            apiKey = await ApiKey.create({
                userId,
                name: 'Default Key',
                key: key,
                secret: secret
            });

            // Return secret on creation
            return res.json({
                key: apiKey.key,
                secret: apiKey.secret,
                isActive: apiKey.is_active,
                message: 'API Key generated. Save your secret now!'
            });
        }
        
        // Return masked secret for existing key
        res.json({
            key: apiKey.key,
            secret: '********************', // Masked
            isActive: apiKey.is_active
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
        
        res.json({
            key: apiKey.key,
            secret: apiKey.secret,
            isActive: apiKey.is_active,
            message: 'New API Key generated successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Affiliate Stats
// @route   GET /api/users/affiliate-stats
// @access  Private
const getAffiliateStats = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId, {
            include: [{ model: Wallet }]
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
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

        const totalEarnings = user.Wallet ? user.Wallet.commission_balance : 0;
        const pendingPayout = 0; // Logic for pending payout can be added later

        const recentReferrals = referrals.map(ref => ({
            name: ref.ReferredUser ? ref.ReferredUser.name : 'Unknown',
            date: ref.createdAt,
            status: ref.ReferredUser && ref.ReferredUser.kyc_status === 'verified' ? 'Active' : 'Inactive',
            commission: ref.total_commissions_earned
        }));

        res.json({
            referralCode: user.referral_code,
            referralLink: `https://peacebundle.com/register?ref=${user.referral_code}`,
            totalEarnings,
            referredUsersCount: referrals.length,
            pendingPayout,
            recentReferrals
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Add Beneficiary
// @route   POST /api/users/beneficiaries
// @access  Private
const addBeneficiary = async (req, res) => {
    const { name, phone, network, accountNumber, bankName } = req.body;
    const userId = req.user.id;

    // Validation
    if (!name) {
        return res.status(400).json({ message: 'Name is required' });
    }

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const newBeneficiary = await Beneficiary.create({
            userId,
            name,
            phoneNumber: phone,
            network: network || 'others',
            accountNumber,
            bankName
        });

        const beneficiaries = await Beneficiary.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });

        res.json({
            message: 'Beneficiary added successfully',
            beneficiary: newBeneficiary,
            beneficiaries
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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

            res.json({
                message: 'Beneficiary removed successfully',
                beneficiaries
            });
        } else {
            res.status(404).json({ message: 'Beneficiary not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getBeneficiaries,
    addBeneficiary,
    deleteBeneficiary,
    getAffiliateStats,
    getApiKey,
    regenerateApiKey
};
