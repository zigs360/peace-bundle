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
        res.json(plans);
    } catch (error) {
        logger.error(`Error fetching subscription plans: ${error.message}`);
        res.status(500).json({ message: 'Server error' });
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
        res.json(plans);
    } catch (error) {
        logger.error(`Admin error fetching subscription plans: ${error.message}`);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Create a new subscription plan
// @route   POST /api/admin/subscription-plans
// @access  Private/Admin
const createSubscriptionPlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.create(req.body);
        
        logger.info(`[AUDIT] Admin ${req.user.id} created subscription plan: ${plan.name} (${plan.id})`);
        
        res.status(201).json(plan);
    } catch (error) {
        logger.error(`Error creating subscription plan: ${error.message}`);
        res.status(400).json({ message: error.message || 'Validation failed' });
    }
};

// @desc    Update a subscription plan
// @route   PUT /api/admin/subscription-plans/:id
// @access  Private/Admin
const updateSubscriptionPlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        const oldName = plan.name;
        await plan.update(req.body);

        logger.info(`[AUDIT] Admin ${req.user.id} updated subscription plan: ${oldName} -> ${plan.name} (${plan.id})`);

        res.json(plan);
    } catch (error) {
        logger.error(`Error updating subscription plan: ${error.message}`);
        res.status(400).json({ message: error.message || 'Update failed' });
    }
};

// @desc    Delete a subscription plan (Soft delete)
// @route   DELETE /api/admin/subscription-plans/:id
// @access  Private/Admin
const deleteSubscriptionPlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        const planName = plan.name;
        await plan.destroy();

        logger.info(`[AUDIT] Admin ${req.user.id} deleted subscription plan: ${planName} (${req.params.id})`);

        res.json({ message: 'Plan removed successfully' });
    } catch (error) {
        logger.error(`Error deleting subscription plan: ${error.message}`);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getSubscriptionPlans,
    adminGetSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan
};
