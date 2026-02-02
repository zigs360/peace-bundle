const { DataPlan, Sim, Wallet } = require('../models');
const dataPurchaseService = require('../services/dataPurchaseService');
const transactionLimitService = require('../services/transactionLimitService');
const { validationResult } = require('express-validator');

class DataPurchaseController {
    
    // GET /api/user/data/purchase
    async index(req, res) {
        try {
            const user = req.user;

            // Get active plans
            const activePlans = await DataPlan.findAll({
                where: { is_active: true },
                order: [['provider', 'ASC'], ['sort_order', 'ASC']]
            });

            // Group by provider
            const plans = activePlans.reduce((acc, plan) => {
                if (!acc[plan.provider]) acc[plan.provider] = [];
                acc[plan.provider].push(plan);
                return acc;
            }, {});

            // Get user's SIMs (for resellers)
            // Assuming checkRole logic or property exists
            let sims = [];
            // We can check roles if loaded, or query DB. 
            // Assuming req.user has roles populated or we check simply:
            // For now, let's fetch if user has 'reseller' role.
            // Since role logic might vary, we'll assume we can fetch SIMs for everyone or filter.
            // The Laravel code checks `user->hasRole('reseller')`.
            // We'll check if roles are loaded or fetch them.
            // Assuming user instance has helper or we check roles array
            // Simple check:
            const isReseller = user.Roles && user.Roles.some(r => r.name === 'reseller');
            
            if (isReseller) {
                sims = await Sim.findAll({
                    where: { userId: user.id, status: 'active' }
                });
            }

            // Get Wallet Balance
            const wallet = await Wallet.findOne({ where: { userId: user.id } });

            res.json({
                plans,
                sims,
                walletBalance: wallet ? wallet.balance : 0
            });

        } catch (error) {
            console.error('DataPurchaseController.index error:', error);
            res.status(500).json({ message: 'Failed to fetch purchase data' });
        }
    }

    // POST /api/user/data/purchase
    async store(req, res) {
        // Validation handled by middleware, check results here
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        const user = req.user;

        // Check transaction limits
        try {
            const limitCheck = await transactionLimitService.canTransact(user);
            if (!limitCheck.allowed) {
                return res.status(403).json({ message: limitCheck.reason });
            }

            const { plan_id, recipient_phone, sim_id } = req.body;

            const plan = await DataPlan.findByPk(plan_id);
            if (!plan) {
                return res.status(404).json({ message: 'Data plan not found' });
            }

            let sim = null;
            if (sim_id) {
                sim = await Sim.findByPk(sim_id);
                if (!sim) {
                    return res.status(404).json({ message: 'SIM not found' });
                }
            }

            const transaction = await dataPurchaseService.purchase(
                user,
                plan,
                recipient_phone,
                sim
            );

            res.json({
                message: 'Data purchase initiated successfully!',
                transaction
            });

        } catch (error) {
            console.error('DataPurchaseController.store error:', error);
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new DataPurchaseController();
