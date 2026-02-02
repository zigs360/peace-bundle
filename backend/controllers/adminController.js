const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const Sim = require('../models/Sim');
const DataPlan = require('../models/DataPlan');
const { sendEmail, sendSMS } = require('../services/notificationService');

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

        res.json({
            plans: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
            return res.status(400).json({ message: 'Please fill all required fields' });
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
            message: 'Data plan created successfully',
            plan
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update Data Plan
// @route   PUT /api/admin/plans/:id
// @access  Private (Admin)
const updateDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ message: 'Data plan not found' });
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
            message: 'Data plan updated successfully',
            plan
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete Data Plan
// @route   DELETE /api/admin/plans/:id
// @access  Private (Admin)
const deleteDataPlan = async (req, res) => {
    try {
        const plan = await DataPlan.findByPk(req.params.id);

        if (!plan) {
            return res.status(404).json({ message: 'Data plan not found' });
        }

        await plan.destroy();

        res.json({ message: 'Data plan deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
            include: [{ model: User, attributes: ['name', 'email'] }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        res.json({
            sims: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve SIM
// @route   POST /api/admin/sims/:id/approve
// @access  Private (Admin)
const approveSim = async (req, res) => {
    try {
        const sim = await Sim.findByPk(req.params.id);

        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        sim.isVerified = true;
        sim.verifiedAt = new Date();
        sim.status = 'active';

        await sim.save();

        res.json({ message: 'SIM approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Suspend SIM
// @route   POST /api/admin/sims/:id/suspend
// @access  Private (Admin)
const suspendSim = async (req, res) => {
    try {
        const sim = await Sim.findByPk(req.params.id);

        if (!sim) {
            return res.status(404).json({ message: 'SIM not found' });
        }

        sim.status = 'paused';

        await sim.save();

        res.json({ message: 'SIM suspended successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
            stats: {
                total_sims: totalSims,
                active_sims: activeSims,
                banned_sims: bannedSims,
                by_provider: byProvider,
                avg_dispenses_per_sim: avgDispenses[0]?.get('avg') || 0,
                total_dispenses: totalDispenses || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        res.json({
            users: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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

const walletService = require('../services/walletService');

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
                { model: User, attributes: ['id', 'name', 'email'] },
                { model: DataPlan, attributes: ['id', 'name', 'provider'] },
                { model: Sim, attributes: ['id', 'phoneNumber', 'provider'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            transactions: rows,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            filters: { status, provider, user_id, date_from, date_to }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Refund Transaction
// @route   POST /api/admin/transactions/:id/refund
// @access  Private (Admin)
const refundTransaction = async (req, res) => {
    const { id } = req.params;

    try {
        const transaction = await Transaction.findByPk(id, {
            include: [{ model: User }]
        });

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        if (transaction.status === 'refunded') {
            return res.status(400).json({ message: 'Transaction already refunded' });
        }

        // Check permission (Optional: assuming admin middleware covers generic admin rights)
        // if (!req.user.hasPermission('process-refunds')) ...

        // Process Refund
        const t = await sequelize.transaction();

        try {
            // Credit user wallet
            await walletService.credit(
                transaction.User, // Note: Sequelize capitalizes model name in instance if alias not set, but here standard
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
                message: 'Transaction refunded successfully',
                transaction
            });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Refund failed: ' + error.message });
    }
};

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getAdminStats = async (req, res) => {
    try {
        // Platform statistics
        const totalUsers = await User.count();
        const totalResellers = await User.count({ where: { role: 'reseller' } });
        const totalTransactions = await Transaction.count();
        const successfulTransactions = await Transaction.count({ where: { status: 'completed' } });
        
        // Calculate total revenue from completed transactions
        const totalRevenue = await Transaction.sum('amount', {
            where: { status: 'completed' }
        }) || 0;
        
        const pendingTransactions = await Transaction.count({ where: { status: 'pending' } });
        const totalSims = await Sim.count();
        const activeSims = await Sim.count({ where: { status: 'active' } });

        // Revenue by provider
        const revenueByProvider = await Transaction.findAll({
            attributes: [
                'provider',
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            where: { status: 'completed', provider: { [Op.not]: null } },
            group: ['provider']
        });

        // Recent transactions
        const recentTransactions = await Transaction.findAll({
            include: [
                { model: User, attributes: ['name', 'email'] },
                // { model: DataPlan, as: 'dataPlan' } // Include if DataPlan association exists
            ],
            order: [['createdAt', 'DESC']],
            limit: 10
        });

        // Transaction trends (last 30 days)
        const trends = await getTransactionTrends();

        res.json({
            stats: {
                total_users: totalUsers,
                total_resellers: totalResellers,
                total_transactions: totalTransactions,
                successful_transactions: successfulTransactions,
                total_revenue: totalRevenue,
                pending_transactions: pendingTransactions,
                total_sims: totalSims,
                active_sims: activeSims
            },
            revenueByProvider,
            recentTransactions,
            trendData: trends
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getTransactionTrends = async () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);

        const count = await Transaction.count({
            where: {
                status: 'completed',
                createdAt: {
                    [Op.gte]: date,
                    [Op.lt]: nextDate
                }
            }
        });

        const revenue = await Transaction.sum('amount', {
            where: {
                status: 'completed',
                createdAt: {
                    [Op.gte]: date,
                    [Op.lt]: nextDate
                }
            }
        }) || 0;

        days.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }), // Format: Mmm dd
            transactions: count,
            revenue: revenue
        });
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
            return res.status(404).json({ message: 'User not found' });
        }

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;
        user.role = role || user.role;

        await user.save();

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Toggle Block User (Admin)
// @route   PATCH /api/admin/users/:id/block
// @access  Private (Admin)
const toggleBlockUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Toggle status: 'active' <-> 'banned'
        user.account_status = user.account_status === 'banned' ? 'active' : 'banned';
        await user.save();

        res.json({
            id: user.id,
            account_status: user.account_status,
            message: `User ${user.account_status === 'banned' ? 'blocked' : 'unblocked'} successfully`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Fund User Wallet (Admin)
// @route   POST /api/admin/users/:id/fund
// @access  Private (Admin)
const fundUserWallet = async (req, res) => {
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
        await Transaction.create({
            userId: user.id,
            type: 'credit',
            amount: numericAmount,
            description: 'Admin Wallet Funding',
            status: 'completed',
            reference: `ADMIN_FUND_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            source: 'wallet_funding'
        }, { transaction: t });

        await t.commit();

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
                value: setting.value,
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

        // Use Promise.all to update in parallel
        await Promise.all(Object.keys(settings).map(async (key) => {
            // Upsert logic matching PHP: SystemSetting::where('key', $key)->update(['value' => $value]);
            // However, PHP assumes keys exist. We will do update if exists, or ignore/create?
            // PHP code: SystemSetting::where('key', $key)->update(['value' => $value]);
            // This implies only updating existing keys.
            
            const [setting] = await SystemSetting.findOrCreate({
                where: { key },
                defaults: { 
                    value: String(settings[key]), 
                    type: 'string', 
                    group: 'general' 
                }
            });

            if (setting) {
                 // Cast value to string for storage if it's not
                 const valueToStore = typeof settings[key] === 'object' 
                    ? JSON.stringify(settings[key]) 
                    : String(settings[key]);
                 
                 if (setting.value !== valueToStore) {
                     setting.value = valueToStore;
                     await setting.save();
                 }
            }
        }));

        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get KYC Requests
// @route   GET /api/admin/kyc
// @access  Private (Admin)
const getKycRequests = async (req, res) => {
    try {
        const users = await User.findAll({
            where: { kyc_status: 'pending' },
            attributes: ['id', 'name', 'email', 'phone', 'kyc_document', 'kyc_submitted_at']
        });
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve KYC
// @route   PUT /api/admin/users/:id/kyc/approve
// @access  Private (Admin)
const approveKyc = async (req, res) => {
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
            'KYC Approved - Peace Bundle',
            `Hello ${user.name},\n\nYour KYC document has been approved. You are now a verified user.\n\nRegards,\nPeace Bundle Team`,
            `<h3>KYC Approved</h3><p>Hello ${user.name},</p><p>Your KYC document has been approved. You are now a verified user.</p>`
        );

        // Send SMS Notification
        if (user.phone) {
            await sendSMS(user.phone, `Hello ${user.name}, your KYC has been approved. You can now access all features. - Peace Bundle`);
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
            'KYC Rejected - Peace Bundle',
            `Hello ${user.name},\n\nYour KYC document was rejected.\nReason: ${reason}\n\nPlease re-upload a valid document.\n\nRegards,\nPeace Bundle Team`,
            `<h3>KYC Rejected</h3><p>Hello ${user.name},</p><p>Your KYC document was rejected.</p><p><strong>Reason:</strong> ${reason}</p><p>Please re-upload a valid document.</p>`
        );

        // Send SMS Notification
        if (user.phone) {
            await sendSMS(user.phone, `Hello ${user.name}, your KYC was rejected. Reason: ${reason}. Please re-upload. - Peace Bundle`);
        }

        res.json({ message: 'User KYC rejected', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
    getSimAnalytics,
    getTransactions,
    refundTransaction,
    getKycRequests
};
