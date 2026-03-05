const SubscriptionPlan = require('../models/SubscriptionPlan');
const logger = require('../utils/logger');

// @desc    Get all subscription plans
// @route   GET /api/plans/subscriptions
// @access  Public
const getSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            where: { is_active: true },
            order: [['sort_order', 'ASC']]
        });
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        logger.error(`[SubscriptionPlan] Fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve subscription plans' 
        });
    }
};

// @desc    Get all subscription plans (including inactive) for admin
// @route   GET /api/admin/subscription-plans
// @access  Private/Admin
const adminGetSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            order: [['sort_order', 'ASC']]
        });
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        logger.error(`[SubscriptionPlan] Admin fetch error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve subscription plans for admin' 
        });
    }
};

// @desc    Create a new subscription plan
// @route   POST /api/admin/subscription-plans
// @access  Private/Admin
const createSubscriptionPlan = async (req, res) => {
    try {
        const { name, price, duration_days } = req.body;
        
        if (!name || !price) {
            return res.status(400).json({
                success: false,
                message: 'Plan name and price are required'
            });
        }

        const plan = await SubscriptionPlan.create(req.body);
        
        logger.info(`[SubscriptionPlan] Admin ${req.user.id} created plan: ${plan.name} (${plan.id})`);
        
        res.status(201).json({
            success: true,
            message: 'Subscription plan created successfully',
            data: plan
        });
    } catch (error) {
        logger.error(`[SubscriptionPlan] Creation error: ${error.message}`);
        res.status(400).json({ 
            success: false,
            message: error.message || 'Failed to create subscription plan' 
        });
    }
};

// @desc    Update a subscription plan
// @route   PUT /api/admin/subscription-plans/:id
// @access  Private/Admin
const updateSubscriptionPlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Subscription plan not found' 
            });
        }

        const oldName = plan.name;
        await plan.update(req.body);

        logger.info(`[SubscriptionPlan] Admin ${req.user.id} updated plan: ${oldName} -> ${plan.name} (${plan.id})`);

        res.json({
            success: true,
            message: 'Subscription plan updated successfully',
            data: plan
        });
    } catch (error) {
        logger.error(`[SubscriptionPlan] Update error for ID ${req.params.id}: ${error.message}`);
        res.status(400).json({ 
            success: false,
            message: error.message || 'Failed to update subscription plan' 
        });
    }
};

// @desc    Delete a subscription plan (Soft delete)
// @route   DELETE /api/admin/subscription-plans/:id
// @access  Private/Admin
const deleteSubscriptionPlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ 
                success: false,
                message: 'Subscription plan not found' 
            });
        }

        const planName = plan.name;
        await plan.destroy();

        logger.info(`[SubscriptionPlan] Admin ${req.user.id} deleted plan: ${planName} (${req.params.id})`);

        res.json({ 
            success: true,
            message: 'Subscription plan removed successfully' 
        });
    } catch (error) {
        logger.error(`[SubscriptionPlan] Delete error for ID ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to delete subscription plan' 
        });
    }
};

module.exports = {
    getSubscriptionPlans,
    adminGetSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan
};
