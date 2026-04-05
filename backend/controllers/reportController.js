const { Transaction, User, Wallet, Sim, Commission } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
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

        // Profit estimation (Admin Price - API Cost for completed data transactions)
        // Note: This requires the DataPlan model to be associated and api_cost to be present
        let dataProfit = 0;
        try {
            const [rows] = await sequelize.query(
                `
                SELECT COALESCE(SUM(t.amount - COALESCE(dp.api_cost, 0)), 0) AS profit
                FROM transactions t
                LEFT JOIN data_plans dp ON dp.id = t."dataPlanId"
                WHERE t.source = 'data_purchase'
                  AND t.status = 'completed'
                  AND t."createdAt" >= :startDate
                `,
                { replacements: { startDate }, type: QueryTypes.SELECT }
            );

            const profit = rows?.profit ?? 0;
            dataProfit = parseFloat(String(profit)) || 0;
        } catch (e) {
            dataProfit = 0;
        }

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
            totalTransactions,
            successRate: parseFloat(successRate),
            totalVolume: parseFloat(totalVolume || 0),
            totalProfit: parseFloat(dataProfit),
            activeUsers: activeUsersCount,
            avgResponseTime: parseFloat(avgResponseTime)
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

        res.json(transactions);
    } catch (error) {
        logger.error(`[Report] Chart data error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve chart data' 
        });
    }
};

// @desc    Get Airtime Provider Stats (Ogdams vs Smeplug)
// @route   GET /api/reports/airtime-providers
// @access  Private/Admin
const getAirtimeProviderStats = async (req, res) => {
    const { timeRange } = req.query;

    let startDate = new Date();
    if (timeRange === '24h') startDate.setHours(startDate.getHours() - 24);
    else if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
    else if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
    else startDate.setDate(startDate.getDate() - 7);

    try {
        const providerExpr = sequelize.literal(`COALESCE(metadata->>'service_provider','unknown')`);

        const rows = await Transaction.findAll({
            attributes: [
                [providerExpr, 'provider'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
                [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'completed' THEN 1 ELSE 0 END`)), 'success'],
                [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'failed' THEN 1 ELSE 0 END`)), 'failed'],
                [sequelize.fn('SUM', sequelize.literal(`CASE WHEN (metadata->'provider_switch') IS NOT NULL THEN 1 ELSE 0 END`)), 'switched']
            ],
            where: {
                source: 'airtime_purchase',
                type: 'debit',
                createdAt: { [Op.gte]: startDate }
            },
            group: [providerExpr],
            order: [[providerExpr, 'ASC']]
        });

        const stats = rows.map((row) => {
            const provider = row.get('provider');
            const total = Number(row.get('total') || 0);
            const success = Number(row.get('success') || 0);
            const failed = Number(row.get('failed') || 0);
            const switched = Number(row.get('switched') || 0);
            const successRate = total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0;
            return { provider, total, success, failed, switched, successRate };
        });

        res.json({
            timeRange: timeRange || '7d',
            from: startDate.toISOString(),
            stats
        });
    } catch (error) {
        logger.error(`[Report] Airtime provider stats error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve airtime provider statistics'
        });
    }
};

module.exports = {
    getSystemStats,
    getChartData,
    getAirtimeProviderStats
};
