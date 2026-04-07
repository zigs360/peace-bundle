const { User, Transaction, Wallet, Sim, DataPlan, SystemSetting, SupportTicket } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const walletService = require('../services/walletService');
const WebhookEvent = require('../models/WebhookEvent');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

// @desc    Get All Data Plans (Admin)
// @route   GET /api/admin/plans
// @access  Private (Admin)
const getDataPlans = async (req, res) => {
    try {
        const { page = 1, limit = 20, provider, category } = req.query;
        const offset = (page - 1) * limit;

        const where = {};

        if (provider) {
            where.provider = provider;
        }

        if (category) {
            where.category = category;
        }

        const { count, rows } = await DataPlan.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [
                ['provider', 'ASC'],
                ['sort_order', 'ASC']
            ]
        });

        res.json(rows);
    } catch (error) {
        logger.error('Admin Get Data Plans Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create Data Plan
// @route   POST /api/admin/plans
// @access  Private (Admin)
const createDataPlan = async (req, res) => {
    try {
        const {
            provider, category, name, size, size_mb, validity,
            admin_price, api_cost, is_active, is_featured
        } = req.body;

        // Validation (Basic)
        if (!provider || !category || !name || !size || !size_mb || !validity || !admin_price) {
            return res.status(400).json({ success: false, message: 'Please fill all required fields' });
        }

        const plan = await DataPlan.create({
            provider,
            category,
            name,
            size,
            size_mb,
            validity,
            admin_price,
            api_cost,
            is_active: is_active !== undefined ? is_active : true,
            is_featured: is_featured !== undefined ? is_featured : false
        });

        res.status(201).json({
            success: true,
            message: 'Data plan created successfully',
            data: plan
        });
    } catch (error) {
        logger.error('Admin Create Data Plan Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update Data Plan
// @route   PUT /api/admin/plans/:id
// @access  Private (Admin)
const updateDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Data plan not found' });
        }

        const updates = req.body;
        // Whitelist allowed updates
        const allowedUpdates = [
            'name', 'size', 'size_mb', 'validity', 'admin_price',
            'api_cost', 'is_active', 'is_featured', 'provider', 'category'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                plan[field] = updates[field];
            }
        });

        await plan.save();

        res.json({
            success: true,
            message: 'Data plan updated successfully',
            data: plan
        });
    } catch (error) {
        logger.error('Admin Update Data Plan Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete Data Plan
// @route   DELETE /api/admin/plans/:id
// @access  Private (Admin)
const deleteDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Data plan not found' });
        }

        await plan.destroy();

        res.json({ success: true, message: 'Data plan deleted successfully' });
    } catch (error) {
        logger.error('Admin Delete Data Plan Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get All SIMs (Admin)
// @route   GET /api/admin/sims
// @access  Private (Admin)
const getSims = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, provider, status, user_id } = req.query;
        const offset = (page - 1) * limit;

        const where = {};

        if (search) {
            where.phoneNumber = { [Op.like]: `%${search}%` };
        }

        if (provider) {
            where.provider = provider;
        }

        if (status) {
            where.status = status;
        }

        if (user_id) {
            where.userId = user_id;
        }

        const { count, rows } = await Sim.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        res.json(rows);
    } catch (error) {
        logger.error('Admin Get Sims Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve SIM
// @route   POST /api/admin/sims/:id/approve
// @access  Private (Admin)
const approveSim = async (req, res) => {
    try {
        const sim = await Sim.findByPk(req.params.id);

        if (!sim) {
            return res.status(404).json({ success: false, message: 'SIM not found' });
        }

        sim.isVerified = true;
        sim.verifiedAt = new Date();
        sim.status = 'active';

        await sim.save();

        res.json({ success: true, message: 'SIM approved successfully' });
    } catch (error) {
        logger.error('Admin Approve SIM Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Suspend SIM
// @route   POST /api/admin/sims/:id/suspend
// @access  Private (Admin)
const suspendSim = async (req, res) => {
    try {
        const sim = await Sim.findByPk(req.params.id);

        if (!sim) {
            return res.status(404).json({ success: false, message: 'SIM not found' });
        }

        sim.status = 'paused';

        await sim.save();

        res.json({ success: true, message: 'SIM suspended successfully' });
    } catch (error) {
        logger.error('Admin Suspend SIM Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete SIM
// @route   DELETE /api/admin/sims/:id
// @access  Private (Admin)
const deleteSim = async (req, res) => {
    try {
        const sim = await Sim.findByPk(req.params.id);

        if (!sim) {
            return res.status(404).json({ success: false, message: 'SIM not found' });
        }

        await sim.destroy();

        res.json({ success: true, message: 'SIM removed successfully' });
    } catch (error) {
        logger.error('Admin Delete SIM Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Connect SIM (Admin)
// @route   POST /api/admin/sims/:id/connect
// @access  Private (Admin)
const connectSim = async (req, res) => {
    const simManagementService = require('../services/simManagementService');
    try {
        const sim = await Sim.findByPk(req.params.id);
        if (!sim) return res.status(404).json({ success: false, message: 'SIM not found' });

        await simManagementService.connectSim(sim);
        
        res.json({
            success: true,
            message: 'SIM connected successfully!',
            data: await sim.reload()
        });
    } catch (error) {
        logger.error('Admin Connect SIM Error:', { error: error.message, id: req.params.id });
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Disconnect SIM (Admin)
// @route   POST /api/admin/sims/:id/disconnect
// @access  Private (Admin)
const disconnectSim = async (req, res) => {
    const simManagementService = require('../services/simManagementService');
    try {
        const sim = await Sim.findByPk(req.params.id);
        if (!sim) return res.status(404).json({ success: false, message: 'SIM not found' });

        await simManagementService.disconnectSim(sim);
        
        res.json({
            success: true,
            message: 'SIM disconnected successfully!',
            data: await sim.reload()
        });
    } catch (error) {
        logger.error('Admin Disconnect SIM Error:', { error: error.message, id: req.params.id });
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Check SIM Balance (Admin)
// @route   POST /api/admin/sims/:id/check-balance
// @access  Private (Admin)
const checkSimBalance = async (req, res) => {
    const simManagementService = require('../services/simManagementService');
    try {
        const { force = false } = req.body;
        const sim = await Sim.findByPk(req.params.id);
        if (!sim) return res.status(404).json({ success: false, message: 'SIM not found' });

        const balance = await simManagementService.checkBalance(sim, 3, force);
        
        res.json({
            success: true,
            balance: balance,
            sim: await sim.reload()
        });
    } catch (error) {
        logger.error('Admin Check SIM Balance Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get SIM Analytics
// @route   GET /api/admin/sims/analytics
// @access  Private (Admin)
const getSimAnalytics = async (req, res) => {
    try {
        const totalSims = await Sim.count();
        const activeSims = await Sim.count({ where: { status: 'active' } });
        const bannedSims = await Sim.count({ where: { status: 'banned' } });
        
        const byProvider = await Sim.findAll({
            attributes: [
                'provider',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['provider']
        });

        const avgDispenses = await Sim.findAll({
            attributes: [[sequelize.fn('AVG', sequelize.col('total_dispenses')), 'avg']]
        });
        
        const totalDispenses = await Sim.sum('total_dispenses');

        res.json({
            total_sims: totalSims,
            active_sims: activeSims,
            banned_sims: bannedSims,
            by_provider: byProvider,
            avg_dispenses_per_sim: avgDispenses[0]?.get('avg') || 0,
            total_dispenses: totalDispenses || 0
        });
    } catch (error) {
        logger.error('Admin Get SIM Analytics Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Sync SIMs from Smeplug
// @route   POST /api/admin/sims/sync
// @access  Private (Admin)
const syncSmeplugSims = async (req, res) => {
    const simManagementService = require('../services/simManagementService');
    try {
        logger.info('Admin requested SIM sync from Smeplug');
        const results = await simManagementService.syncSmeplugSims();
        res.json({
            success: true,
            message: `SIM synchronization completed: ${results.created} new SIMs added, ${results.updated} updated.`,
            data: results
        });
    } catch (error) {
        logger.error('Admin Sync SIMs Error:', { error: error.message });
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Users (Admin)
// @route   GET /api/admin/users
// @access  Private (Admin)
const getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, role, status } = req.query;
        const offset = (page - 1) * limit;

        const where = {};

        // Search functionality
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by role
        if (role) {
            where.role = role;
        }

        // Filter by status (account_status)
        if (status) {
            where.account_status = status;
        }

        const { count, rows } = await User.findAndCountAll({
            where,
            include: [{ model: Wallet, as: 'wallet' }],
            attributes: {
                exclude: ['password', 'two_factor_secret'] // Exclude sensitive fields
            },
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        res.json(rows);
    } catch (error) {
        logger.error('Admin Get Users Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve KYC
// @route   POST /api/admin/users/:id/kyc/approve
// @access  Private (Admin)
// Removed duplicate approveKyc implementation
// ...

// @desc    Reject KYC
// @route   POST /api/admin/users/:id/kyc/reject
// @access  Private (Admin)
// Removed Duplicate rejectKyc Implementation
// ...

// ...

// @desc    Get All Transactions (Admin Monitor)
// @route   GET /api/admin/transactions
// @access  Private (Admin)
const getTransactions = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            provider, 
            reference,
            user_id, 
            date_from, 
            date_to 
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // Filters
        if (status) {
            where.status = status;
        }

        if (provider) {
            where.provider = provider;
        }

        if (reference) {
            where.reference = reference;
        }

        if (user_id) {
            where.userId = user_id;
        }

        if (date_from || date_to) {
            where.createdAt = {};
            if (date_from) {
                where.createdAt[Op.gte] = new Date(date_from);
            }
            if (date_to) {
                // Adjust to end of day if only date provided, or use as is
                const endDate = new Date(date_to);
                endDate.setHours(23, 59, 59, 999);
                where.createdAt[Op.lte] = endDate;
            }
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
                { model: DataPlan, as: 'dataPlan', attributes: ['id', 'name', 'provider'] },
                { model: Sim, as: 'sim', attributes: ['id', 'phoneNumber', 'provider'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            transactions: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        logger.error('Admin Get Transactions Error:', { error: error.message });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    List webhook events (Admin)
// @route   GET /api/admin/webhook-events
// @access  Private (Admin)
const getWebhookEvents = async (req, res) => {
    try {
        const { page = 1, limit = 20, provider, reference, status } = req.query;
        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const where = {};
        if (provider) where.provider = String(provider).toLowerCase();
        if (status) where.status = String(status).toLowerCase();
        if (reference) where.reference = { [Op.iLike]: `%${String(reference).trim()}%` };

        const { count, rows } = await WebhookEvent.findAndCountAll({
            where,
            limit: parseInt(limit, 10),
            offset,
            order: [['createdAt', 'DESC']],
        });

        return res.json({
            success: true,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            total: count,
            data: rows,
        });
    } catch (error) {
        logger.error('Admin Get Webhook Events Error:', { error: error.message });
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Refund Transaction
// @route   POST /api/admin/transactions/:id/refund
// @access  Private (Admin)
const refundTransaction = async (req, res) => {
    const walletService = require('../services/walletService');
    const { id } = req.params;

    try {
        const transaction = await Transaction.findByPk(id, {
            include: [{ model: User, as: 'user' }]
        });

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        if (transaction.status === 'refunded') {
            return res.status(400).json({ success: false, message: 'Transaction already refunded' });
        }

        // Process Refund
        const t = await sequelize.transaction();

        try {
            // Credit user wallet
            await walletService.credit(
                transaction.user,
                parseFloat(transaction.amount),
                'refund',
                `Admin refund for transaction: ${transaction.reference}`,
                { original_transaction_id: transaction.id },
                t
            );

            // Update transaction status
            transaction.status = 'refunded';
            await transaction.save({ transaction: t });

            await t.commit();

            res.json({
                success: true,
                message: 'Transaction refunded successfully',
                data: transaction
            });

        } catch (error) {
            if (t) await t.rollback();
            throw error;
        }

    } catch (error) {
        logger.error('Admin Refund Transaction Error:', { error: error.message, id });
        res.status(500).json({ success: false, message: 'Refund failed: ' + error.message });
    }
};

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getAdminStats = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [
            totalUsers,
            totalResellers,
            totalTransactions,
            successfulTransactions,
            totalRevenue,
            pendingTransactions,
            totalSims,
            activeSims,
            revenueByProvider,
            recentTransactions,
            trends,
            systemWalletBalance
        ] = await Promise.all([
            User.count(),
            User.count({ where: { role: 'reseller' } }),
            Transaction.count(),
            Transaction.count({ where: { status: 'completed' } }),
            Transaction.sum('amount', { 
                where: { 
                    status: 'completed',
                    type: 'debit' // Real revenue is from debits (purchases)
                } 
            }).then(sum => parseFloat(sum || 0)),
            Transaction.count({ where: { status: 'pending' } }),
            Sim.count(),
            Sim.count({ where: { status: 'active' } }),
            Transaction.findAll({
                attributes: [
                    'provider',
                    [sequelize.fn('SUM', sequelize.col('amount')), 'total']
                ],
                where: { 
                    status: 'completed', 
                    type: 'debit',
                    provider: { [Op.not]: null } 
                },
                group: ['provider'],
                raw: true
            }),
            Transaction.findAll({
                include: [
                    { model: User, as: 'user', attributes: ['name', 'email'] },
                ],
                order: [['createdAt', 'DESC']],
                limit: 10
            }),
            getTransactionTrends(),
            Wallet.sum('balance').then(sum => parseFloat(sum || 0))
        ]);

        res.json({
            stats: {
                total_users: totalUsers,
                total_resellers: totalResellers,
                total_transactions: totalTransactions,
                successful_transactions: successfulTransactions,
                total_revenue: totalRevenue,
                pending_transactions: pendingTransactions,
                total_sims: totalSims,
                active_sims: activeSims,
                system_wallet_balance: systemWalletBalance
            },
            revenueByProvider: revenueByProvider.map(r => ({
                provider: r.provider,
                total: parseFloat(r.total || 0)
            })),
            recentTransactions,
            trendData: trends
        });
    } catch (error) {
        logger.error('Admin Get Stats Error:', { error: error.message, stack: error.stack });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const getTransactionTrends = async () => {
    // Optimized: Use DB aggregation instead of loop
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const results = await Transaction.findAll({
        attributes: [
            [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
            [sequelize.fn('COUNT', '*'), 'transactions'],
            [sequelize.fn('SUM', sequelize.col('amount')), 'revenue']
        ],
        where: {
            status: 'completed',
            createdAt: { [Op.gte]: thirtyDaysAgo }
        },
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
    });

    // Fill in missing days (DB only returns days with data)
    const days = [];
    const resultMap = {};
    results.forEach(r => {
        // Handle different DB date formats (string or Date object)
        const dateKey = new Date(r.date).toISOString().split('T')[0];
        resultMap[dateKey] = r;
    });

    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (resultMap[dateStr]) {
            days.push({
                date: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
                transactions: parseInt(resultMap[dateStr].transactions),
                revenue: parseFloat(resultMap[dateStr].revenue || 0)
            });
        } else {
            days.push({
                date: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
                transactions: 0,
                revenue: 0
            });
        }
    }

    return days;
};

// @desc    Update User (Admin)
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
const updateUser = async (req, res) => {
    try {
        const { name, email, phone, role } = req.body;
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;
        user.role = role || user.role;

        await user.save();

        res.json({
            success: true,
            message: 'User updated successfully',
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('Admin Update User Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Toggle Block User (Admin)
// @route   PATCH /api/admin/users/:id/block
// @access  Private (Admin)
const toggleBlockUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Toggle status: 'active' <-> 'banned'
        user.account_status = user.account_status === 'banned' ? 'active' : 'banned';
        await user.save();

        res.json({
            success: true,
            message: `User ${user.account_status === 'banned' ? 'blocked' : 'unblocked'} successfully`,
            data: {
                id: user.id,
                account_status: user.account_status
            }
        });
    } catch (error) {
        logger.error('Admin Toggle Block User Error:', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Fund User Wallet (Admin)
// @route   POST /api/admin/users/:id/fund
// @access  Private (Admin)
const fundUserWallet = async (req, res) => {
    const walletService = require('../services/walletService');
    const { sendEmail } = require('../services/notificationService');
    const notificationRealtimeService = require('../services/notificationRealtimeService');
    const t = await sequelize.transaction();
    try {
        const { amount } = req.body;
        const user = await User.findByPk(req.params.id, {
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.wallet) {
            await t.rollback();
            return res.status(404).json({ message: 'User wallet not found' });
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid amount' });
        }

        // Credit Wallet
        user.wallet.balance = parseFloat(user.wallet.balance) + numericAmount;
        await user.wallet.save({ transaction: t });

        // Create Transaction Record
        const txn = await Transaction.create({
            userId: user.id,
            type: 'credit',
            amount: numericAmount,
            description: 'Admin Wallet Funding',
            status: 'completed',
            reference: `ADMIN_FUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            source: 'wallet_funding'
        }, { transaction: t });

        await t.commit();

        try {
            const balance = parseFloat(user.wallet.balance);
            notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                reference: txn.reference,
                amount: numericAmount,
                gateway: 'admin',
                balance
            });
            await notificationRealtimeService.sendToUser(user.id, {
                title: 'Wallet funded',
                message: `Your wallet has been credited with ₦${Number(numericAmount).toLocaleString()} by admin.`,
                type: 'success',
                priority: 'medium',
                link: '/dashboard',
                metadata: { kind: 'wallet_funding_admin', reference: txn.reference, amount: numericAmount, balance }
            });
        } catch (e) {
            void e;
        }

        try {
            await sendEmail(user.email, 'Wallet Funded', `Your wallet has been funded with ₦${numericAmount}.`);
        } catch (e) {
            void e;
        }

        res.json({
            message: 'Wallet funded successfully',
            newBalance: user.wallet.balance
        });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get System Settings (Admin)
// @route   GET /api/admin/settings
// @access  Private (Admin)
const getSystemSettings = async (req, res) => {
    try {
        const settings = await SystemSetting.findAll({
            order: [
                ['group', 'ASC'],
                ['key', 'ASC']
            ]
        });

        // Group by 'group'
        const groupedSettings = settings.reduce((acc, setting) => {
            const group = setting.group || 'general';
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push({
                key: setting.key,
                value: (setting.key.includes('secret') || setting.key.includes('password')) ? '********' : setting.value,
                type: setting.type,
                description: setting.description
            });
            return acc;
        }, {});

        res.json({ settings: groupedSettings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update System Settings (Admin)
// @route   PUT /api/admin/settings
// @access  Private (Admin)
const updateSystemSettings = async (req, res) => {
    try {
        const { settings } = req.body; // Expects { settings: { key: value, ... } }
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ message: 'Invalid settings format' });
        }

        const entries = Object.entries(settings);
        await Promise.all(entries.map(async ([key, incomingValue]) => {
            const existing = await SystemSetting.findOne({ where: { key } });

            let type = existing?.type || 'string';
            if (!existing) {
                if (typeof incomingValue === 'boolean') type = 'boolean';
                else if (typeof incomingValue === 'number' && Number.isFinite(incomingValue)) type = 'integer';
                else if (typeof incomingValue === 'object') type = 'json';
            }

            await SystemSetting.set(
                key,
                incomingValue,
                type,
                existing?.group || 'general',
                existing?.description || null
            );
        }));

        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get KYC Requests
// @route   GET /api/admin/users/kyc-requests
// @access  Private (Admin)
const getKycRequests = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        
        // Filter by status if provided, otherwise show all non-'none' by default or filter by specific statuses
        if (status && status !== 'all') {
            where.kyc_status = status;
        } else {
            where.kyc_status = { [Op.ne]: 'none' };
        }

        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { phone: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await User.findAndCountAll({
            where,
            attributes: [
                'id', 'name', 'email', 'phone', 'kyc_status', 
                'kyc_document', 'kyc_submitted_at', 'kyc_verified_at', 
                'kyc_rejection_reason', 'account_status', 'bvn', 'is_bvn_verified'
            ],
            order: [['kyc_submitted_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            data: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Bulk Process KYC
// @route   POST /api/admin/users/kyc/bulk
// @access  Private (Admin)
const bulkProcessKyc = async (req, res) => {
    const { sendEmail } = require('../services/notificationService');
    const t = await sequelize.transaction();
    try {
        const { userIds, action, reason } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'No user IDs provided' });
        }

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'Invalid action' });
        }

        const status = action === 'approve' ? 'verified' : 'rejected';
        const updateData = {
            kyc_status: status,
            kyc_verified_at: action === 'approve' ? new Date() : null,
            kyc_rejection_reason: action === 'reject' ? reason : null
        };

        await User.update(updateData, {
            where: { id: { [Op.in]: userIds } },
            transaction: t
        });

        await t.commit();

        // Send notifications asynchronously (simplified for bulk)
        // In a real app, this should be a background job
        const users = await User.findAll({ where: { id: { [Op.in]: userIds } } });
        for (const user of users) {
            if (action === 'approve') {
                sendEmail(user.email, 'KYC Approved', `Your KYC has been approved.`).catch(console.error);
            } else {
                sendEmail(user.email, 'KYC Rejected', `Your KYC was rejected. Reason: ${reason}`).catch(console.error);
            }
        }

        res.json({ message: `Bulk KYC ${action} successful for ${userIds.length} users` });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve KYC
// @route   PUT /api/admin/users/:id/kyc/approve
// @access  Private (Admin)
const approveKyc = async (req, res) => {
    const { sendEmail, sendSMS } = require('../services/notificationService');
    const VirtualAccountService = require('../services/virtualAccountService');
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.kyc_status = 'verified';
        user.kyc_verified_at = new Date();
        user.kyc_rejection_reason = null;
        
        await user.save();

        // Send Email Notification
        await sendEmail(
            user.email,
            'KYC Approved - Peace Bundlle',
            `Hello ${user.name},\n\nYour KYC document has been approved. You are now a verified user.\n\nRegards,\nPeace Bundlle Team`,
            `<h3>KYC Approved</h3><p>Hello ${user.name},</p><p>Your KYC document has been approved. You are now a verified user.</p>`
        );

        // Send SMS Notification
        if (user.phone) {
            await sendSMS(user.phone, `Hello ${user.name}, your KYC has been approved. You can now access all features. - Peace Bundlle`);
        }

        // Attempt to assign a virtual account now that KYC is approved
        try {
            const account = await VirtualAccountService.assignVirtualAccount(user);
            if (account) {
                logger.info(`Virtual account created for user ${user.id} after KYC approval.`);
            } else {
                logger.warn(`Virtual account assignment did not return an account for user ${user.id} after KYC approval, but no error was thrown.`);
            }
        } catch (error) {
            logger.error(`Failed to assign virtual account for user ${user.id} after KYC approval: ${error.message}`);
            // We don't block the response for this failure, just log it.
        }

        try {
            const upgrade = await VirtualAccountService.upgradeBillstackVirtualAccountIfEligible(user);
            if (upgrade?.ok) {
                logger.info(`BillStack virtual account upgraded for user ${user.id} after KYC approval.`);
            }
        } catch (error) {
            logger.error(`Failed to upgrade BillStack virtual account for user ${user.id} after KYC approval: ${error.message}`);
        }

        res.json({ message: 'User KYC approved', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Reject KYC
// @route   PUT /api/admin/users/:id/kyc/reject
// @access  Private (Admin)
const rejectKyc = async (req, res) => {
    const { sendEmail, sendSMS } = require('../services/notificationService');
    try {
        const { reason } = req.body;
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.kyc_status = 'rejected';
        user.kyc_rejection_reason = reason;
        
        await user.save();

        // Send Email Notification
        await sendEmail(
            user.email,
            'KYC Rejected - Peace Bundlle',
            `Hello ${user.name},\n\nYour KYC document was rejected.\nReason: ${reason}\n\nPlease re-upload a valid document.\n\nRegards,\nPeace Bundlle Team`,
            `<h3>KYC Rejected</h3><p>Hello ${user.name},</p><p>Your KYC document was rejected.</p><p><strong>Reason:</strong> ${reason}</p><p>Please re-upload a valid document.</p>`
        );

        // Send SMS Notification
        if (user.phone) {
            await sendSMS(user.phone, `Hello ${user.name}, your KYC was rejected. Reason: ${reason}. Please re-upload. - Peace Bundlle`);
        }

        res.json({ message: 'User KYC rejected', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Referral Analytics
// @route   GET /api/admin/referrals/analytics
// @access  Private (Admin)
const getReferralAnalytics = async (req, res) => {
    try {
        const totalReferrals = await User.count({
            where: { referred_by: { [Op.ne]: null } }
        });

        // Use a simpler query first to check if the issue is with GROUP BY or associations
        const topReferrers = await User.findAll({
            attributes: [
                'id',
                'referral_code',
                'name',
                [sequelize.literal('(SELECT COUNT(*) FROM "Users" AS "referrals" WHERE "referrals"."referred_by" = "User"."referral_code")'), 'referral_count']
            ],
            where: { 
                referral_code: { [Op.ne]: null }
            },
            order: [[sequelize.literal('referral_count'), 'DESC']],
            limit: 10,
            subQuery: false
        });

        res.json({
            totalReferrals,
            topReferrers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    View KYC Document (Secure)
// @route   GET /api/admin/users/kyc-document/:filename
// @access  Private (Admin)
const viewKycDocument = async (req, res) => {
    try {
        const { filename } = req.params;
        // Basic path traversal protection
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ message: 'Invalid filename' });
        }

        const filePath = path.join(__dirname, '../secure_uploads/', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Audit Logging for KYC Access
        logger.info(`Admin ${req.user.id} accessed KYC document: ${filename}`);

        let fileBuffer = fs.readFileSync(filePath);
        
        // Attempt decryption
        try {
            fileBuffer = decrypt(fileBuffer);
        } catch (decryptError) {
            // If decryption fails, it might be an older unencrypted file
            // We just log it and serve as is
            logger.warn(`Failed to decrypt KYC document ${filename}. Serving as-is.`);
        }

        // Determine content type
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.pdf') contentType = 'application/pdf';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';

        res.setHeader('Content-Type', contentType);
        // Set inline disposition so it can be previewed
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(fileBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Bulk SMS History
// @route   GET /api/admin/bulk-sms
// @access  Private (Admin)
const getBulkSMSHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        const where = {
            source: 'bulk_sms_payment'
        };

        const { count, rows } = await Transaction.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            history: rows.map((r) => {
                const json = r.toJSON();
                if (json.user && !json.User) {
                    json.User = json.user;
                }
                return json;
            }),
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Send Bulk SMS (Admin)
// @route   POST /api/admin/bulk-sms
// @access  Private (Admin)
const sendAdminBulkSMS = async (req, res) => {
    const { senderId, message, recipients, targetGroup } = req.body;
    const { sendSMS } = require('../services/notificationService');
    
    try {
        let recipientList = [];

        if (targetGroup === 'all_users') {
            const users = await User.findAll({ attributes: ['phoneNumber'] });
            recipientList = users.map(u => u.phoneNumber).filter(Boolean);
        } else if (targetGroup === 'resellers') {
             const users = await User.findAll({ where: { role: 'reseller' }, attributes: ['phoneNumber'] });
             recipientList = users.map(u => u.phoneNumber).filter(Boolean);
        } else if (recipients) {
            recipientList = (Array.isArray(recipients) ? recipients : recipients.split(',')).map(r => r.trim()).filter(r => r.length > 0);
        }

        if (recipientList.length === 0) {
            return res.status(400).json({ message: 'No recipients found' });
        }

        // Fire and forget
        Promise.allSettled(recipientList.map(recipient => 
            sendSMS(recipient, message, { senderId }) 
        ));
        
        res.json({ message: `SMS sending initiated to ${recipientList.length} recipients` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Generate Virtual Account for User
// @route   POST /api/admin/users/:id/virtual-account
// @access  Private (Admin)
const generateMissingVirtualAccounts = async (req, res) => {
    const virtualAccountService = require('../services/virtualAccountService');
    const { limit = 50, batchSize, notify = true, includeInactive = false, dryRun = false } = req.body;
    
    try {
        logger.info(`[Admin] Initiating bulk virtual account migration. Limit: ${limit}, Notify: ${notify}`);
        
        const summary = await virtualAccountService.bulkAssignMissingVirtualAccounts({
            maxUsers: parseInt(limit),
            batchSize: batchSize ? parseInt(batchSize) : parseInt(limit),
            notify: notify !== false,
            includeInactive: includeInactive === true,
            dryRun: dryRun === true
        });

        res.json({
            success: true,
            message: `Migration process completed. ${summary.created} accounts created, ${summary.failed} failed.`,
            data: summary
        });

    } catch (error) {
        logger.error(`[Admin] Error during bulk virtual account generation: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'An unexpected error occurred during the bulk generation process.',
            error: error.message 
        });
    }
};

const upgradeBillstackVirtualAccount = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const VirtualAccountService = require('../services/virtualAccountService');
        const result = await VirtualAccountService.upgradeBillstackVirtualAccountIfEligible(user);
        return res.json({ success: true, result, user: await User.findByPk(user.id) });
    } catch (e) {
        logger.error(`[Admin] BillStack upgrade failed for user ${req.params.id}: ${e.message}`);
        return res.status(500).json({ success: false, message: 'Upgrade failed' });
    }
};

const retryUserVirtualAccount = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.virtual_account_number) {
            return res.status(400).json({
                success: false,
                message: 'User already has a virtual account',
                data: {
                    bank: user.virtual_account_bank,
                    accountNumber: user.virtual_account_number,
                    accountName: user.virtual_account_name
                }
            });
        }

        const virtualAccountService = require('../services/virtualAccountService');
        await virtualAccountService.recordProvisioningAttempt(user.id);
        const details = await virtualAccountService.assignVirtualAccount(user);
        await virtualAccountService.recordProvisioningSuccess(user.id);
        try {
            await virtualAccountService.notifyUserOfNewAccount(user);
        } catch (e) {
            void e;
        }

        return res.json({ success: true, message: 'Virtual account generated', data: details, user: await User.findByPk(user.id) });
    } catch (e) {
        logger.error(`[Admin] Virtual account retry failed for user ${req.params.id}: ${e.message}`);
        try {
            const virtualAccountService = require('../services/virtualAccountService');
            await virtualAccountService.recordProvisioningFailure(req.params.id, e.message);
        } catch (e2) {
            void e2;
        }
        return res.status(500).json({ success: false, message: 'Virtual account retry failed' });
    }
};

const getVirtualAccountHealth = async (req, res) => {
    try {
        const enabled = await SystemSetting.get('virtual_account_generation_enabled');
        const provider = await SystemSetting.get('virtual_account_provider');
        const allowMockBvn = await SystemSetting.get('allow_mock_bvn');

        const forwardedProto = req.headers['x-forwarded-proto'];
        const forwardedHost = req.headers['x-forwarded-host'];
        const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req.protocol;
        const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.get('host');
        const baseUrl = proto && host ? `${proto}://${host}` : null;

        const billstackBaseUrl =
            process.env.BILLSTACK_BASE_URL ||
            process.env.BILL_STACK_BASE_URL ||
            process.env.Bill_Stack_BASE_URL ||
            process.env.BillSTACK_BASE_URL ||
            null;
        let billstackHost = null;
        try {
            billstackHost = billstackBaseUrl ? new URL(billstackBaseUrl).host : null;
        } catch (e) {
            billstackHost = null;
        }

        const payvesselBaseUrl = process.env.PAYVESSEL_BASE_URL || null;
        let payvesselHost = null;
        try {
            payvesselHost = payvesselBaseUrl ? new URL(payvesselBaseUrl).host : null;
        } catch (e) {
            payvesselHost = null;
        }

        return res.json({
            success: true,
            settings: {
                virtual_account_generation_enabled: enabled,
                virtual_account_provider: provider,
                allow_mock_bvn: allowMockBvn
            },
            providers: {
                billstack: {
                    configured: Boolean(
                        (process.env.BILLSTACK_SECRET_KEY ||
                            process.env.BILL_STACK_SECRET_KEY ||
                            process.env.Bill_Stack_SECRET_KEY ||
                            process.env.BillSTACK_SECRET_KEY) &&
                            billstackBaseUrl
                    ),
                    baseUrlHost: billstackHost,
                    env: {
                        baseUrlSources: {
                            BILLSTACK_BASE_URL: Boolean(process.env.BILLSTACK_BASE_URL),
                            BILL_STACK_BASE_URL: Boolean(process.env.BILL_STACK_BASE_URL),
                            Bill_Stack_BASE_URL: Boolean(process.env.Bill_Stack_BASE_URL),
                            BillSTACK_BASE_URL: Boolean(process.env.BillSTACK_BASE_URL)
                        },
                        secretKeySources: {
                            BILLSTACK: Boolean(process.env.BILLSTACK_SECRET_KEY),
                            BILL_STACK: Boolean(process.env.BILL_STACK_SECRET_KEY),
                            Bill_Stack: Boolean(process.env.Bill_Stack_SECRET_KEY),
                            BillSTACK: Boolean(process.env.BillSTACK_SECRET_KEY)
                        },
                        publicKeySources: {
                            BILLSTACK: Boolean(process.env.BILLSTACK_PUBLIC_KEY),
                            BILL_STACK: Boolean(process.env.BILL_STACK_PUBLIC_KEY),
                            Bill_Stack: Boolean(process.env.Bill_Stack_PUBLIC_KEY),
                            BillSTACK: Boolean(process.env.BillSTACK_PUBLIC_KEY)
                        },
                        webhookSecretPresent: Boolean(process.env.BILLSTACK_WEBHOOK_SECRET)
                    }
                },
                payvessel: {
                    configured: Boolean(process.env.PAYVESSEL_API_KEY && process.env.PAYVESSEL_SECRET_KEY && process.env.PAYVESSEL_BUSINESS_ID),
                    baseUrlHost: payvesselHost,
                    businessIdSet: Boolean(process.env.PAYVESSEL_BUSINESS_ID)
                }
            },
            webhooks: {
                billstack: baseUrl ? `${baseUrl}/api/webhooks/billstack` : '/api/webhooks/billstack',
                payvessel: baseUrl ? `${baseUrl}/api/webhooks/payvessel` : '/api/webhooks/payvessel',
                paystack: baseUrl ? `${baseUrl}/api/webhooks/paystack` : '/api/webhooks/paystack',
                monnify: baseUrl ? `${baseUrl}/api/webhooks/monnify` : '/api/webhooks/monnify'
            }
        });
    } catch (e) {
        logger.error(`[Admin] Virtual account health failed: ${e.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load virtual account health' });
    }
};

const listPendingFundingReviews = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Transaction.findAndCountAll({
            where: {
                status: 'pending',
                type: 'credit',
                source: 'funding'
            },
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        const pendingReview = rows.filter((t) => t?.metadata?.review_status === 'pending_review');

        return res.json({
            success: true,
            transactions: pendingReview,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (e) {
        logger.error(`[Admin] List pending funding reviews failed: ${e.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load pending reviews' });
    }
};

const approvePendingFundingReview = async (req, res) => {
    const { id } = req.params;
    try {
        const t = await sequelize.transaction();
        try {
            const txn = await Transaction.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!txn) {
                await t.rollback();
                return res.status(404).json({ success: false, message: 'Transaction not found' });
            }

            if (txn.metadata?.review_status !== 'pending_review' || txn.status !== 'pending' || txn.type !== 'credit' || txn.source !== 'funding') {
                if (txn.metadata?.review_status === 'approved') {
                    await t.rollback();
                    return res.json({ success: true, message: 'Already approved', transaction: txn });
                }
                if (txn.metadata?.review_status === 'rejected') {
                    await t.rollback();
                    return res.status(400).json({ success: false, message: 'Already rejected' });
                }
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Transaction is not pending review' });
            }

            const user = await User.findByPk(txn.userId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!user) {
                await t.rollback();
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            const wallet = await Wallet.findOne({ where: { userId: user.id }, transaction: t, lock: t.LOCK.UPDATE });
            if (!wallet) {
                await t.rollback();
                return res.status(404).json({ success: false, message: 'Wallet not found' });
            }

            const balanceBefore = parseFloat(wallet.balance);
            const amount = parseFloat(txn.amount);
            const balanceAfter = balanceBefore + amount;

            await wallet.update({ balance: balanceAfter }, { transaction: t });

            txn.balance_before = balanceBefore;
            txn.balance_after = balanceAfter;
            txn.status = 'completed';
            txn.completed_at = new Date();
            txn.metadata = {
                ...(txn.metadata || {}),
                review_status: 'approved',
                reviewed_by: req.user.id,
                reviewed_at: new Date().toISOString()
            };
            await txn.save({ transaction: t });

            await t.commit();
            return res.json({ success: true, message: 'Approved', transaction: txn });
        } catch (err) {
            if (t && !t.finished) await t.rollback();
            throw err;
        }
    } catch (e) {
        logger.error(`[Admin] Approve pending funding review failed: ${e.message}`, { id });
        return res.status(500).json({ success: false, message: 'Approval failed' });
    }
};

const rejectPendingFundingReview = async (req, res) => {
    const { id } = req.params;
    try {
        const t = await sequelize.transaction();
        try {
            const txn = await Transaction.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!txn) {
                await t.rollback();
                return res.status(404).json({ success: false, message: 'Transaction not found' });
            }

            if (txn.metadata?.review_status !== 'pending_review' || txn.status !== 'pending' || txn.type !== 'credit' || txn.source !== 'funding') {
                if (txn.metadata?.review_status === 'rejected') {
                    await t.rollback();
                    return res.json({ success: true, message: 'Already rejected', transaction: txn });
                }
                if (txn.metadata?.review_status === 'approved') {
                    await t.rollback();
                    return res.status(400).json({ success: false, message: 'Already approved' });
                }
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Transaction is not pending review' });
            }

            txn.status = 'failed';
            txn.failure_reason = 'Rejected by admin';
            txn.metadata = {
                ...(txn.metadata || {}),
                review_status: 'rejected',
                reviewed_by: req.user.id,
                reviewed_at: new Date().toISOString()
            };
            await txn.save({ transaction: t });

            await t.commit();
            return res.json({ success: true, message: 'Rejected', transaction: txn });
        } catch (err) {
            if (t && !t.finished) await t.rollback();
            throw err;
        }
    } catch (e) {
        logger.error(`[Admin] Reject pending funding review failed: ${e.message}`, { id });
        return res.status(500).json({ success: false, message: 'Rejection failed' });
    }
};

module.exports = {
    getAdminStats,
    updateUser,
    toggleBlockUser,
    fundUserWallet,
    getSystemSettings,
    updateSystemSettings,
    getUsers,
    approveKyc,
    rejectKyc,
    getDataPlans,
    createDataPlan,
    updateDataPlan,
    deleteDataPlan,
    getSims,
    approveSim,
    suspendSim,
    deleteSim,
    connectSim,
    disconnectSim,
    checkSimBalance,
    syncSmeplugSims,
    getSimAnalytics,
    getTransactions,
    getWebhookEvents,
    refundTransaction,
    getKycRequests,
    viewKycDocument,
    bulkProcessKyc,
    getReferralAnalytics,
    getBulkSMSHistory,
    sendAdminBulkSMS,
    generateMissingVirtualAccounts,
    upgradeBillstackVirtualAccount,
    retryUserVirtualAccount,
    getVirtualAccountHealth,
    listPendingFundingReviews,
    approvePendingFundingReview,
    rejectPendingFundingReview
};
