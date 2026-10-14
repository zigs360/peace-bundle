const { User, Transaction, Wallet, Referral } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const walletService = require('../services/walletService');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const { sendEmail } = require('../services/notificationService');
const logger = require('../utils/logger');

// @desc    Get comprehensive rankings for administrators
// @route   GET /api/admin/leaderboard
// @access  Private (Admin)
const getAdminLeaderboard = async (req, res) => {
    try {
        const period = String(req.query.period || 'all_time').toLowerCase();
        const category = String(req.query.category || 'volume').toLowerCase();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 5), 100);

        let startDate = null;
        const now = new Date();
        if (period === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (category === 'referrals') {
            const whereRef = {
                status: { [Op.in]: ['qualified', 'rewarded'] }
            };
            if (startDate) {
                whereRef.createdAt = { [Op.gte]: startDate };
            }

            const referralAgg = await Referral.findAll({
                attributes: [
                    'referrerId',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                ],
                where: whereRef,
                group: ['referrerId'],
                order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
                raw: true,
            });

            const topUserIds = referralAgg.map(r => r.referrerId).filter(Boolean);
            const users = await User.findAll({
                where: {
                    id: { [Op.in]: topUserIds },
                },
                attributes: ['id', 'name', 'email', 'phone', 'role', 'avatar', 'account_status'],
                include: [{
                    model: Wallet,
                    as: 'wallet',
                    attributes: ['balance']
                }]
            });
            const userMap = new Map(users.map(u => [String(u.id), u]));

            const leaderboard = [];
            let rankCounter = 1;

            for (const item of referralAgg) {
                const u = userMap.get(String(item.referrerId));
                if (!u) continue;

                const count = parseInt(item.count, 10) || 0;
                if (leaderboard.length < limit) {
                    leaderboard.push({
                        rank: rankCounter,
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        phone: u.phone,
                        role: u.role,
                        avatar: u.avatar || null,
                        accountStatus: u.account_status || 'active',
                        walletBalance: parseFloat(u.wallet?.balance || 0),
                        score: count,
                        qualifiedReferrals: count,
                    });
                }
                rankCounter++;
            }

            const totalReferrals = referralAgg.reduce((acc, cur) => acc + (parseInt(cur.count, 10) || 0), 0);

            return res.json({
                success: true,
                period,
                category,
                summary: {
                    totalRankedUsers: leaderboard.length,
                    totalReferrals,
                    topPerformer: leaderboard[0] || null,
                },
                leaderboard,
            });
        }

        // 'volume' or 'transactions'
        const whereTxn = {
            status: 'completed',
            type: 'debit',
            source: { [Op.ne]: 'refund' }
        };
        if (startDate) {
            whereTxn.createdAt = { [Op.gte]: startDate };
        }

        const txnAgg = await Transaction.findAll({
            attributes: [
                'userId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalVolume'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
            ],
            where: whereTxn,
            group: ['userId'],
            order: category === 'transactions'
                ? [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
                : [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
            raw: true,
        });

        const userIds = txnAgg.map(t => t.userId).filter(Boolean);
        const users = await User.findAll({
            where: {
                id: { [Op.in]: userIds },
            },
            attributes: ['id', 'name', 'email', 'phone', 'role', 'avatar', 'account_status'],
            include: [{
                model: Wallet,
                as: 'wallet',
                attributes: ['balance']
            }]
        });
        const userMap = new Map(users.map(u => [String(u.id), u]));

        const leaderboard = [];
        let rankCounter = 1;
        let aggregateVolume = 0;
        let aggregateTransactions = 0;

        for (const item of txnAgg) {
            const u = userMap.get(String(item.userId));
            if (!u) continue;

            const volume = parseFloat(item.totalVolume) || 0;
            const count = parseInt(item.transactionCount, 10) || 0;
            aggregateVolume += volume;
            aggregateTransactions += count;

            if (leaderboard.length < limit) {
                leaderboard.push({
                    rank: rankCounter,
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    role: u.role,
                    avatar: u.avatar || null,
                    accountStatus: u.account_status || 'active',
                    walletBalance: parseFloat(u.wallet?.balance || 0),
                    score: category === 'transactions' ? count : volume,
                    totalVolume: volume,
                    transactionCount: count,
                });
            }
            rankCounter++;
        }

        return res.json({
            success: true,
            period,
            category,
            summary: {
                totalRankedUsers: leaderboard.length,
                totalVolume: aggregateVolume,
                totalTransactions: aggregateTransactions,
                topPerformer: leaderboard[0] || null,
            },
            leaderboard,
        });
    } catch (error) {
        logger.error(`[Admin Leaderboard] Failed to fetch admin leaderboard: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load admin rankings' });
    }
};

// @desc    Reward a ranked user directly from rankings
// @route   POST /api/admin/leaderboard/reward
// @access  Private (Admin)
const rewardRankedUser = async (req, res) => {
    const { userId, amount, reason, title, notifyUser = true } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid reward amount' });
    }

    const rewardTitle = (title && String(title).trim()) || 'Top User Activity Award';
    const rewardReason = (reason && String(reason).trim()) || 'Excellence and high activity on Peace Bundle';

    const t = await sequelize.transaction();
    try {
        let user = await User.findByPk(userId, {
            include: [{ model: Wallet, as: 'wallet' }]
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.wallet) {
            user.wallet = await walletService.ensureWallet(user, t);
        }

        const reference = `ADMIN-REWARD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const description = `Activity Reward: ${rewardTitle}`;

        const result = await walletService.adminAdjust(
            user,
            numericAmount,
            'funding',
            description,
            {
                reference,
                kind: 'activity_reward',
                admin_id: req.user?.id || null,
                user_id: user.id,
                reward_title: rewardTitle,
                reward_reason: rewardReason,
            },
            t
        );

        const txn = result.txn;
        await t.commit();

        if (globalThis.__peacebundle_dashboard_stats_cache) {
            globalThis.__peacebundle_dashboard_stats_cache.delete(`stats:${user.id}`);
            globalThis.__peacebundle_dashboard_stats_cache.delete(`dashboard:${user.id}`);
        }

        const newBalance = parseFloat(String(txn.balance_after));

        if (notifyUser) {
            try {
                notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                    reference: txn.reference,
                    amount: numericAmount,
                    gateway: 'admin_reward',
                    balance: newBalance
                });

                await notificationRealtimeService.sendToUser(user.id, {
                    title: `🏆 ${rewardTitle}`,
                    message: `Congratulations! You have received a reward bonus of ₦${Number(numericAmount).toLocaleString()} for your outstanding activity: "${rewardReason}". Your wallet has been credited!`,
                    type: 'success',
                    priority: 'high',
                    link: '/dashboard',
                    metadata: { kind: 'activity_reward', reference: txn.reference, amount: numericAmount, balance: newBalance }
                });
            } catch (notifyErr) {
                logger.warn(`[Admin Reward] Failed to send real-time notification: ${notifyErr.message}`);
            }

            try {
                await sendEmail(
                    user.email,
                    `🏆 ${rewardTitle} - Peace Bundle`,
                    `Congratulations ${user.name || 'Valued User'}!\n\nYou have been awarded a bonus of ₦${numericAmount.toLocaleString()} on Peace Bundle for: ${rewardReason}.\n\nYour new wallet balance is ₦${newBalance.toLocaleString()}.\n\nThank you for choosing Peace Bundle!`
                );
            } catch (emailErr) {
                logger.warn(`[Admin Reward] Failed to send reward email: ${emailErr.message}`);
            }
        }

        logger.info(`[Admin Leaderboard] Admin ${req.user?.id} rewarded user ${user.id} with ₦${numericAmount} for "${rewardTitle}"`);

        return res.json({
            success: true,
            message: `Successfully rewarded ${user.name || user.email} with ₦${numericAmount.toLocaleString()}!`,
            newBalance,
            transaction: txn,
        });
    } catch (error) {
        await t.rollback();
        logger.error(`[Admin Leaderboard] Reward error: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to process reward' });
    }
};

module.exports = {
    getAdminLeaderboard,
    rewardRankedUser,
};
