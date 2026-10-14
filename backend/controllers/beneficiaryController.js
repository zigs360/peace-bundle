const Beneficiary = require('../models/Beneficiary');
const logger = require('../utils/logger');

const normalizePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
    return digits;
};

const saveBeneficiaryForUser = async ({ userId, phone, network, name, accountNumber, bankName }) => {
    if (!userId || (!phone && !accountNumber)) return null;
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    const cleanNetwork = network ? String(network).toLowerCase().trim() : null;
    const cleanName = (name && String(name).trim()) || (normalizedPhone ? `${(cleanNetwork || 'VTU').toUpperCase()} - ${normalizedPhone}` : 'Beneficiary');

    const whereClause = { userId };
    if (normalizedPhone) {
        whereClause.phoneNumber = normalizedPhone;
    } else if (accountNumber) {
        whereClause.accountNumber = accountNumber;
    }

    const existing = await Beneficiary.findOne({ where: whereClause });

    if (existing) {
        const updateData = {
            name: (name && String(name).trim()) || existing.name || cleanName,
            network: cleanNetwork || existing.network,
            accountNumber: accountNumber || existing.accountNumber,
            bankName: bankName || existing.bankName,
        };
        if (typeof existing.update === 'function') {
            return await existing.update(updateData);
        }
        Object.assign(existing, updateData);
        if (typeof existing.save === 'function') {
            await existing.save();
        }
        return existing;
    }

    return await Beneficiary.create({
        userId,
        name: cleanName,
        phoneNumber: normalizedPhone,
        network: cleanNetwork,
        accountNumber,
        bankName,
    });
};

// @desc    Get user beneficiaries
// @route   GET /api/beneficiaries
// @access  Private
const getBeneficiaries = async (req, res) => {
    try {
        const beneficiaries = await Beneficiary.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json(beneficiaries);
    } catch (error) {
        logger.error('Get Beneficiaries Error:', { error: error.message, userId: req.user.id });
        res.status(500).json({ success: false, message: 'Failed to fetch beneficiaries' });
    }
};

// @desc    Create a beneficiary
// @route   POST /api/beneficiaries
// @access  Private
const createBeneficiary = async (req, res) => {
    try {
        const { name, phoneNumber, network, accountNumber, bankName } = req.body;

        if (!name && !phoneNumber && !accountNumber) {
            return res.status(400).json({ success: false, message: 'Phone number or account number is required' });
        }

        const beneficiary = await saveBeneficiaryForUser({
            userId: req.user.id,
            phone: phoneNumber,
            network,
            name,
            accountNumber,
            bankName,
        });

        res.status(201).json(beneficiary);
    } catch (error) {
        logger.error('Create Beneficiary Error:', { error: error.message, userId: req.user.id });
        res.status(500).json({ success: false, message: 'Failed to create beneficiary' });
    }
};

// @desc    Delete a beneficiary
// @route   DELETE /api/beneficiaries/:id
// @access  Private
const deleteBeneficiary = async (req, res) => {
    try {
        const beneficiary = await Beneficiary.findOne({
            where: { 
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!beneficiary) {
            return res.status(404).json({ success: false, message: 'Beneficiary not found' });
        }

        await beneficiary.destroy();
        res.json({ message: 'Beneficiary removed' });
    } catch (error) {
        logger.error('Delete Beneficiary Error:', { error: error.message, userId: req.user.id, id: req.params.id });
        res.status(500).json({ success: false, message: 'Failed to delete beneficiary' });
    }
};

module.exports = {
    getBeneficiaries,
    createBeneficiary,
    deleteBeneficiary,
    saveBeneficiaryForUser,
};