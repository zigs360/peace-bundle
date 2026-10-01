const { Op } = require('sequelize');
const { WebhookEvent, Transaction, User } = require('../models');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const { processBillstackFunding } = require('./webhookController');

/**
 * Get BillStack overview statistics and wallet balance
 */
const getOverview = async (req, res) => {
    try {
        const isConfigured = billstackVirtualAccountService.isConfigured();
        let balanceData = { ok: false, balance: null };

        if (isConfigured) {
            try {
                balanceData = await billstackVirtualAccountService.getWalletBalance();
            } catch (err) {
                logger.warn('[BillstackMonitor] getWalletBalance failed', { error: err.message });
            }
        }

        // Webhook counts for BillStack
        const [totalWebhooks, processedWebhooks, failedWebhooks, rejectedWebhooks, pendingWebhooks] = await Promise.all([
            WebhookEvent.count({ where: { provider: 'billstack' } }),
            WebhookEvent.count({ where: { provider: 'billstack', status: 'processed' } }),
            WebhookEvent.count({ where: { provider: 'billstack', status: 'failed' } }),
            WebhookEvent.count({ where: { provider: 'billstack', status: 'rejected' } }),
            WebhookEvent.count({ where: { provider: 'billstack', status: { [Op.in]: ['received', 'verified'] } } }),
        ]);

        // Virtual account users count
        const totalVaUsers = await User.count({
            where: {
                [Op.or]: [
                    { virtual_account_number: { [Op.ne]: null } },
                    sequelize.literal(`metadata->>'billstack' IS NOT NULL`),
                    sequelize.literal(`metadata->'dual_virtual_accounts'->'accounts'->'billstack' IS NOT NULL`)
                ]
            }
        });

        // Funding volume from BillStack
        let totalVolume = 0;
        let successfulDeposits = 0;
        try {
            const fundingTxns = await Transaction.findAll({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'total_volume'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'total_count']
                ],
                where: {
                    type: 'credit',
                    source: 'funding',
                    [Op.or]: [
                        sequelize.literal(`metadata->>'gateway' = 'billstack'`),
                        { description: { [Op.iLike]: '%billstack%' } }
                    ]
                },
                raw: true
            });
            if (fundingTxns && fundingTxns.length > 0) {
                totalVolume = parseFloat(fundingTxns[0].total_volume || 0);
                successfulDeposits = parseInt(fundingTxns[0].total_count || 0, 10);
            }
        } catch (txnErr) {
            logger.warn('[BillstackMonitor] Transaction aggregation failed', { error: txnErr.message });
        }

        return res.json({
            success: true,
            data: {
                provider: {
                    name: 'BillStack',
                    configured: isConfigured,
                    baseUrl: billstackVirtualAccountService.baseUrl,
                    walletBalance: balanceData.balance,
                    currency: balanceData.currency || 'NGN',
                    liveStatus: balanceData.ok ? 'connected' : (isConfigured ? 'degraded' : 'unconfigured')
                },
                metrics: {
                    totalVaUsers,
                    successfulDeposits,
                    totalVolume,
                    webhooks: {
                        total: totalWebhooks,
                        processed: processedWebhooks,
                        pending: pendingWebhooks,
                        failed: failedWebhooks,
                        rejected: rejectedWebhooks
                    }
                }
            }
        });
    } catch (error) {
        logger.error('[BillstackMonitor] getOverview Error', { error: error.message });
        return res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * List BillStack Webhook events with filtering and search
 */
const getEvents = async (req, res) => {
    try {
        const { page = 1, limit = 25, status, q } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const where = { provider: 'billstack' };

        if (status && status !== 'all') {
            where.status = String(status).toLowerCase();
        }

        if (q && String(q).trim()) {
            const query = String(q).trim();
            where[Op.or] = [
                { reference: { [Op.iLike]: `%${query}%` } },
                sequelize.literal(`payload::text ILIKE '%${query.replace(/'/g, "''")}%'`),
                sequelize.literal(`error ILIKE '%${query.replace(/'/g, "''")}%'`)
            ];
        }

        const { count, rows } = await WebhookEvent.findAndCountAll({
            where,
            limit: limitNum,
            offset,
            order: [['createdAt', 'DESC']],
        });

        return res.json({
            success: true,
            data: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum),
                events: rows
            }
        });
    } catch (error) {
        logger.error('[BillstackMonitor] getEvents Error', { error: error.message });
        return res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * Reconcile & Credit all pending, uncredited, or failed BillStack webhook events
 */
const reconcileAll = async (req, res) => {
    try {
        logger.info('[BillstackMonitor] Starting automatic reconciliation of all BillStack events');

        // Fetch candidate events: received, verified, failed, rejected
        const candidateEvents = await WebhookEvent.findAll({
            where: {
                provider: 'billstack',
                status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] }
            },
            order: [['createdAt', 'DESC']],
            limit: 200
        });

        let scanned = candidateEvents.length;
        let creditedCount = 0;
        let duplicateCount = 0;
        let failedCount = 0;
        const results = [];

        for (const event of candidateEvents) {
            try {
                const payload = event.payload || {};
                const data = payload?.data || payload;
                const eventName = payload?.event || payload?.type || data?.event || 'PAYMENT_NOTIFICATION';

                const providerReference = 
                    data?.reference || 
                    data?.transaction_ref || 
                    data?.merchant_reference || 
                    payload?.reference || 
                    event.reference;

                const amount = parseFloat(
                    data?.amount ?? 
                    data?.amount_paid ?? 
                    payload?.amount ?? 
                    event.amount ?? 
                    0
                );

                const accountNumber = 
                    data?.account_number || 
                    data?.virtual_account_number || 
                    data?.destination_account_number || 
                    payload?.account_number || 
                    data?.account?.number || 
                    null;

                const billstackReference = 
                    data?.billstack_reference || 
                    data?.wiaxy_ref || 
                    payload?.billstack_reference || 
                    null;

                if (!providerReference || !amount || amount <= 0) {
                    continue;
                }

                const processingArgs = {
                    webhookEventId: event.id,
                    payload,
                    data,
                    providerReference,
                    amount,
                    accountNumber,
                    billstackReference
                };

                const result = await processBillstackFunding(processingArgs);

                if (result.ok && !result.duplicate) {
                    creditedCount++;
                    results.push({ id: event.id, reference: providerReference, status: 'credited', userId: result.userId });
                } else if (result.duplicate) {
                    duplicateCount++;
                    results.push({ id: event.id, reference: providerReference, status: 'already_credited', userId: result.userId });
                } else {
                    failedCount++;
                    results.push({ id: event.id, reference: providerReference, status: 'failed', reason: result.reason });
                }
            } catch (eventErr) {
                failedCount++;
                logger.error(`[BillstackMonitor] Failed to reconcile event ${event.id}:`, { error: eventErr.message });
                results.push({ id: event.id, status: 'error', error: eventErr.message });
            }
        }

        logger.info('[BillstackMonitor] Reconciliation complete', {
            scanned,
            creditedCount,
            duplicateCount,
            failedCount
        });

        return res.json({
            success: true,
            message: `Reconciliation completed: ${creditedCount} newly credited, ${duplicateCount} already credited, ${failedCount} unresolved out of ${scanned} scanned events.`,
            data: {
                scanned,
                creditedCount,
                duplicateCount,
                failedCount,
                results
            }
        });
    } catch (error) {
        logger.error('[BillstackMonitor] reconcileAll Error', { error: error.message });
        return res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * Reprocess a specific webhook event by ID
 */
const reprocessWebhookEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await WebhookEvent.findByPk(id);

        if (!event) {
            return res.status(404).json({ success: false, message: 'Webhook event not found' });
        }

        const payload = event.payload || {};
        const data = payload?.data || payload;

        const providerReference = 
            data?.reference || 
            data?.transaction_ref || 
            data?.merchant_reference || 
            payload?.reference || 
            event.reference;

        const amount = parseFloat(
            data?.amount ?? 
            data?.amount_paid ?? 
            payload?.amount ?? 
            event.amount ?? 
            0
        );

        const accountNumber = 
            data?.account_number || 
            data?.virtual_account_number || 
            data?.destination_account_number || 
            payload?.account_number || 
            data?.account?.number || 
            null;

        const billstackReference = 
            data?.billstack_reference || 
            data?.wiaxy_ref || 
            payload?.billstack_reference || 
            null;

        if (!providerReference || !amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Webhook event missing valid payment reference or amount' 
            });
        }

        const processingArgs = {
            webhookEventId: event.id,
            payload,
            data,
            providerReference,
            amount,
            accountNumber,
            billstackReference
        };

        const result = await processBillstackFunding(processingArgs);

        return res.json({
            success: true,
            message: result.ok ? (result.duplicate ? 'Transaction was already processed' : 'Wallet credited successfully') : 'Failed to process funding',
            data: result
        });
    } catch (error) {
        logger.error('[BillstackMonitor] reprocessWebhookEvent Error', { error: error.message });
        return res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

module.exports = {
    getOverview,
    getEvents,
    reconcileAll,
    reprocessWebhookEvent
};
