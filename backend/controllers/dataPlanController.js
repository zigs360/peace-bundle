const DataPlan = require('../models/DataPlan');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// @desc    Get all data plans
// @route   GET /api/plans
// @access  Public
const getDataPlans = async (req, res) => {
    try {
        const { provider } = req.query;
        const where = { is_active: true };
        
        if (provider) {
            where.provider = provider.toLowerCase();
        }

        const plans = await DataPlan.findAll({
            where,
            order: [['sort_order', 'ASC'], ['admin_price', 'ASC']]
        });
        
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        logger.error(`[DataPlan] Fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve data plans' 
        });
    }
};

// @desc    Get all data plans (Admin)
// @route   GET /api/plans/admin
// @access  Private/Admin
const getAdminDataPlans = async (req, res) => {
    try {
        const plans = await DataPlan.findAll({
            order: [['createdAt', 'DESC']]
        });
        
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        logger.error(`[DataPlan] Admin fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve data plans for admin' 
        });
    }
};

// @desc    Create data plan
// @route   POST /api/plans
// @access  Private/Admin
const createDataPlan = async (req, res) => {
    const { 
        provider, 
        category, 
        name, 
        size, 
        size_mb, 
        validity, 
        admin_price, 
        api_cost, 
        smeplug_plan_id 
    } = req.body;

    if (!provider || !name || !admin_price) {
        return res.status(400).json({ 
            success: false,
            message: 'Please provide all required fields: provider, name, admin_price' 
        });
    }

    try {
        const plan = await DataPlan.create({
            provider: provider.toLowerCase(),
            category: category || 'sme',
            name,
            size,
            size_mb: size_mb || (size ? parseInt(size) : 0),
            validity,
            admin_price,
            api_cost,
            smeplug_plan_id
        });

        logger.info(`[DataPlan] Created new plan: ${name} for ${provider}`);

        res.status(201).json({
            success: true,
            message: 'Data plan created successfully',
            data: plan
        });
    } catch (error) {
        logger.error(`[DataPlan] Creation error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to create data plan' 
        });
    }
};

// @desc    Update data plan
// @route   PUT /api/plans/:id
// @access  Private/Admin
const updateDataPlan = async (req, res) => {
    const { 
        provider, 
        category, 
        name, 
        size, 
        size_mb, 
        validity, 
        admin_price, 
        api_cost, 
        smeplug_plan_id,
        is_active
    } = req.body;

    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Data plan not found' 
            });
        }

        plan.provider = provider ? provider.toLowerCase() : plan.provider;
        plan.category = category || plan.category;
        plan.name = name || plan.name;
        plan.size = size || plan.size;
        plan.size_mb = size_mb || plan.size_mb;
        plan.validity = validity || plan.validity;
        plan.admin_price = admin_price || plan.admin_price;
        plan.api_cost = api_cost || plan.api_cost;
        plan.smeplug_plan_id = smeplug_plan_id || plan.smeplug_plan_id;
        
        if (is_active !== undefined) plan.is_active = is_active;

        const updatedPlan = await plan.save();
        logger.info(`[DataPlan] Updated plan ID: ${req.params.id}`);

        res.json({
            success: true,
            message: 'Data plan updated successfully',
            data: updatedPlan
        });
    } catch (error) {
        logger.error(`[DataPlan] Update error for ID ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update data plan' 
        });
    }
};

// @desc    Delete data plan
// @route   DELETE /api/plans/:id
// @access  Private/Admin
const deleteDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Data plan not found' 
            });
        }

        await plan.destroy();
        logger.info(`[DataPlan] Deleted plan ID: ${req.params.id}`);

        res.json({ 
            success: true,
            message: 'Data plan removed successfully' 
        });
    } catch (error) {
        logger.error(`[DataPlan] Delete error for ID ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to delete data plan' 
        });
    }
};

module.exports = {
    getDataPlans,
    getAdminDataPlans,
    createDataPlan,
    updateDataPlan,
    deleteDataPlan
};
