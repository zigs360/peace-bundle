const Beneficiary = require('../models/Beneficiary');
const logger = require('../utils/logger');

// @desc    Get user beneficiaries
// @route   GET /api/beneficiaries
// @access  Private
const getBeneficiaries = async (req, res) => {
    try {
        const beneficiaries = await Beneficiary.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json({
            success: true,
            data: beneficiaries
        });
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

        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        const beneficiary = await Beneficiary.create({
            userId: req.user.id,
            name,
            phoneNumber,
            network,
            accountNumber,
            bankName
        });

        res.status(201).json({
            success: true,
            message: 'Beneficiary created successfully',
            data: beneficiary
        });
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
        res.json({ success: true, message: 'Beneficiary removed' });
    } catch (error) {
        logger.error('Delete Beneficiary Error:', { error: error.message, userId: req.user.id, id: req.params.id });
        res.status(500).json({ success: false, message: 'Failed to delete beneficiary' });
    }
};

module.exports = {
    getBeneficiaries,
    createBeneficiary,
    deleteBeneficiary
};