const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// @desc    Get System Stats (Admin)
// @route   GET /api/reports/stats
// @access  Private/Admin
exports.getSystemStats = async (req, res) => {
    const { timeRange } = req.query; // 24h, 7d, 30d

    let startDate = new Date();
    if (timeRange === '24h') startDate.setDate(startDate.getDate() - 1);
    else if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
    else if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
    else startDate.setDate(startDate.getDate() - 7); // Default 7d

    try {
        // Total Transactions Count
        const totalTransactions = await Transaction.count({
            where: {
                createdAt: { [Op.gte]: startDate }
            }
        });

        // Successful Transactions
        const successfulTransactions = await Transaction.count({
            where: {
                status: 'completed',
                createdAt: { [Op.gte]: startDate }
            }
        });

        // Success Rate
        const successRate = totalTransactions > 0 
            ? ((successfulTransactions / totalTransactions) * 100).toFixed(1) 
            : 0;

        // Total Revenue (Total debits - refunds/reversals usually, but simplified here as sum of completed debits)
        // Actually revenue is profit, but for now let's just show total volume of sales
        const totalVolume = await Transaction.sum('amount', {
            where: {
                type: 'debit',
                status: 'completed',
                createdAt: { [Op.gte]: startDate }
            }
        });

        // Active Users (Users who made a transaction in range)
        const activeUsersCount = await Transaction.count({
            distinct: true,
            col: 'walletId', // Approximation if 1 wallet per user
            where: {
                createdAt: { [Op.gte]: startDate }
            }
        });

        // Average Response Time (Mock, as we don't track this in DB yet)
        const avgResponseTime = (Math.random() * 0.5 + 0.5).toFixed(2); // 0.5s - 1.0s

        res.json({
            totalTransactions,
            successRate,
            totalVolume: totalVolume || 0,
            activeUsers: activeUsersCount,
            avgResponseTime
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Transaction Chart Data
// @route   GET /api/reports/chart
// @access  Private/Admin
exports.getChartData = async (req, res) => {
    const { timeRange } = req.query;
    // Implementation simplified: Group by date
    // For 7d, group by day
    
    let days = 7;
    if (timeRange === '30d') days = 30;
    if (timeRange === '24h') days = 1;

    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Group by day (YYYY-MM-DD)
        const transactions = await Transaction.findAll({
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'volume']
            ],
            where: {
                createdAt: { [Op.gte]: startDate },
                status: 'completed',
                type: 'debit' // Sales volume
            },
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
        });

        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
