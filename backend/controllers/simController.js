const Sim = require('../models/Sim');
const simManagementService = require('../services/simManagementService');
const { validationResult } = require('express-validator');

// @desc    Get all SIMs for the authenticated user
// @route   GET /api/sims
// @access  Private
exports.getSims = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { count, rows } = await Sim.findAndCountAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.json({
            sims: {
                data: rows,
                current_page: page,
                total: count,
                per_page: limit,
                last_page: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Add New SIM
// @route   POST /api/sims
// @access  Private
exports.addSim = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const sim = await simManagementService.addSim(req.user, req.body);
        
        res.status(201).json({
            success: true,
            message: 'SIM added successfully!',
            data: sim
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ 
            success: false,
            message: error.message 
        });
    }
};

// @desc    Get Single SIM
// @route   GET /api/sims/:id
// @access  Private
exports.getSim = async (req, res) => {
    const { id } = req.params;

    try {
        const sim = await Sim.findByPk(id);
        
        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        if (sim.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        res.json({
            success: true,
            data: sim
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update SIM
// @route   PUT /api/sims/:id
// @access  Private
exports.updateSim = async (req, res) => {
    const { id } = req.params;
    const { low_balance_threshold, notes } = req.body;

    try {
        const sim = await Sim.findByPk(id);
        
        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        if (sim.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        if (low_balance_threshold !== undefined) sim.lowBalanceThreshold = low_balance_threshold;
        if (notes !== undefined) sim.notes = notes;
        
        await sim.save();
        
        res.json({
            success: true,
            message: 'SIM updated successfully!',
            data: sim
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete SIM
// @route   DELETE /api/sims/:id
// @access  Private
exports.deleteSim = async (req, res) => {
    const { id } = req.params;

    try {
        const sim = await Sim.findByPk(id);
        
        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        if (sim.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        await sim.destroy();
        
        res.json({
            success: true,
            message: 'SIM deleted successfully!'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Check SIM Balance
// @route   POST /api/sims/:id/check-balance
// @access  Private
exports.checkBalance = async (req, res) => {
    const { id } = req.params;

    try {
        const sim = await Sim.findByPk(id);
        
        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        if (sim.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const balance = await simManagementService.checkBalance(sim);
        
        res.json({
            success: true,
            balance: balance,
            sim: await sim.reload() // Reload to get fresh data
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Bundles (Mock/Placeholder)
// @route   GET /api/sims/:id/bundles
// @access  Private
exports.getBundles = async (req, res) => {
    // Keep existing mock implementation or remove if not needed. 
    // The user didn't ask for this explicitly in the PHP file, but it was there before.
    // I'll keep it simple and focus on the PHP file's methods.
    // The PHP file didn't have getBundles, so I'll omit it to strictly follow the PHP file
    // unless it breaks frontend.
    // Since I'm overwriting, I'll stick to what was requested.
    res.status(501).json({ message: 'Not implemented' });
};
