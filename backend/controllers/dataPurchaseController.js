const { DataPlan, Sim, Wallet } = require('../models');
const dataPurchaseService = require('../services/dataPurchaseService');
const transactionLimitService = require('../services/transactionLimitService');
const logger = require('../utils/logger');

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
            let sims = [];
            const isReseller = user.role === 'reseller' || user.role === 'admin';
            
            if (isReseller) {
                sims = await Sim.findAll({
                    where: { userId: user.id, status: 'active' }
                });
            }

            // Get Wallet Balance
            const wallet = await Wallet.findOne({ where: { userId: user.id } });

            res.json(activePlans);

        } catch (error) {
            logger.error('DataPurchaseController.index error:', { error: error.message, userId: req.user.id });
            res.status(500).json({ success: false, message: 'Failed to fetch purchase data' });
        }
    }

    // POST /api/user/data/purchase
    async store(req, res) {
        const user = req.user;

        try {
            const limitCheck = await transactionLimitService.canTransact(user);
            if (!limitCheck.allowed) {
                return res.status(403).json({ 
                    success: false, 
                    message: limitCheck.reason || 'Transaction limit reached' 
                });
            }

            const { plan_id, recipient_phone, sim_id } = req.body;

            if (!plan_id || !recipient_phone) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Both plan_id and recipient_phone are required' 
                });
            }

            const plan = await DataPlan.findByPk(plan_id);
            if (!plan) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'The selected data plan no longer exists' 
                });
            }

            let sim = null;
            if (sim_id) {
                sim = await Sim.findByPk(sim_id);
                if (!sim) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'The selected SIM was not found' 
                    });
                }
            }

            const transaction = await dataPurchaseService.purchase(
                user,
                plan,
                recipient_phone,
                sim
            );

            logger.info(`[DataPurchase] Successful purchase for user ${user.id}: ${plan.name} to ${recipient_phone}`);

            res.json({
                success: true,
                message: 'Data purchase initiated successfully!',
                transaction: transaction
            });

        } catch (error) {
            logger.error(`[DataPurchase] Store error for user ${user.id}: ${error.message}`);
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to process your data purchase request' 
            });
        }
    }
}

module.exports = new DataPurchaseController();
