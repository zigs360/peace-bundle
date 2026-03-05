const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

// @desc    Get System Stats (Admin)
// @route   GET /api/reports/stats
// @access  Private/Admin
const getSystemStats = async (req, res) => {
    const { timeRange } = req.query; // 24h, 7d, 30d

    let startDate = new Date();
    if (timeRange === '24h') startDate.setHours(startDate.getHours() - 24);
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

        // Total Volume (Sum of completed debits)
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
            col: 'userId',
            where: {
                createdAt: { [Op.gte]: startDate }
            }
        });

        // Mock response time for now
        const avgResponseTime = (Math.random() * 0.5 + 0.3).toFixed(2);

        res.json({
            success: true,
            data: {
                totalTransactions,
                successRate: parseFloat(successRate),
                totalVolume: parseFloat(totalVolume || 0),
                activeUsers: activeUsersCount,
                avgResponseTime: parseFloat(avgResponseTime)
            }
        });
    } catch (error) {
        logger.error(`[Report] System stats error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve system statistics' 
        });
    }
};

// @desc    Get Transaction Chart Data
// @route   GET /api/reports/chart
// @access  Private/Admin
const getChartData = async (req, res) => {
    const { timeRange } = req.query;
    
    let days = 7;
    if (timeRange === '30d') days = 30;
    if (timeRange === '24h') days = 1;

    try {
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

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        logger.error(`[Report] Chart data error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve chart data' 
        });
    }
};

module.exports = {
    getSystemStats,
    getChartData
};
