const Beneficiary = require('../models/Beneficiary');

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
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Create a beneficiary
// @route   POST /api/beneficiaries
// @access  Private
const createBeneficiary = async (req, res) => {
    try {
        const { name, phoneNumber, network, accountNumber, bankName } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const beneficiary = await Beneficiary.create({
            userId: req.user.id,
            name,
            phoneNumber,
            network,
            accountNumber,
            bankName
        });

        res.status(201).json(beneficiary);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
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
            return res.status(404).json({ message: 'Beneficiary not found' });
        }

        await beneficiary.destroy();
        res.json({ message: 'Beneficiary removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getBeneficiaries,
    createBeneficiary,
    deleteBeneficiary
};