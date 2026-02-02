const DataPlan = require('../models/DataPlan');
const { Op } = require('sequelize');

// @desc    Get all data plans
// @route   GET /api/plans
// @access  Public (or Private based on needs, usually Public for users to see)
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
        res.json(plans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
        res.json(plans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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

    try {
        const plan = await DataPlan.create({
            provider: provider.toLowerCase(),
            category: category || 'sme',
            name,
            size,
            size_mb: size_mb || parseInt(size), // Fallback if simple string
            validity,
            admin_price,
            api_cost,
            smeplug_plan_id
        });

        res.status(201).json(plan);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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

        if (plan) {
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
            res.json(updatedPlan);
        } else {
            res.status(404).json({ message: 'Plan not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete data plan
// @route   DELETE /api/plans/:id
// @access  Private/Admin
const deleteDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (plan) {
            await plan.destroy();
            res.json({ message: 'Plan removed' });
        } else {
            res.status(404).json({ message: 'Plan not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getDataPlans,
    getAdminDataPlans,
    createDataPlan,
    updateDataPlan,
    deleteDataPlan
};
