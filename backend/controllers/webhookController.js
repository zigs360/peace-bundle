const crypto = require('crypto');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const notificationRealtimeService = require('../services/notificationRealtimeService');

const maskAccountNumber = (value) => {
    const s = String(value || '').replace(/\s+/g, '');
    if (!s) return null;
    const last4 = s.slice(-4);
    return `****${last4}`;
};

// @desc    Handle Paystack Webhook
// @route   POST /api/webhooks/paystack
// @access  Public (Secured by Signature)
const handlePaystackWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
        const hash = crypto.createHmac('sha512', secret).update(raw).digest('hex');
        
        if (hash !== req.headers['x-paystack-signature']) {
            logger.warn('[Webhook] Paystack: Invalid signature');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        logger.info(`[Webhook] Paystack received: ${event.event}`, { reference: event.data?.reference });
        
        if (event.event === 'charge.success') {
            const { reference, amount, status, customer } = event.data;
            
            if (status === 'success') {
                const t = await sequelize.transaction();
                try {
                    const user = await User.findOne({ where: { email: customer.email } });
                    if (!user) {
                        await t.rollback();
                        logger.error(`[Webhook] Paystack: User with email ${customer.email} not found`);
                        return res.status(404).send('User not found');
                    }

                    const creditAmount = amount / 100; // kobo to Naira
                    let creditedTxn = null;
                    try {
                        const result = await walletService.creditFundingWithFraudChecks(
                            user,
                            creditAmount,
                            `Paystack Funding: ${reference}`,
                            { reference, gateway: 'paystack' },
                            t
                        );
                        if (result.status === 'pending_review') {
                            await t.commit();
                            logger.warn(`[Webhook] Paystack: Funding held for review ${reference}`, { userId: user.id });
                            return res.status(200).json({ success: true, message: 'Pending review' });
                        }
                        creditedTxn = result.transaction || null;
                    } catch (error) {
                        if (error?.name === 'SequelizeUniqueConstraintError') {
                            await t.rollback();
                            logger.info(`[Webhook] Paystack: Duplicate transaction ignored ${reference}`);
                            return res.status(200).json({ success: true, message: 'Transaction already exists' });
                        }
                        throw error;
                    }
                    
                    await t.commit();
                    logger.info(`[Webhook] Paystack: Wallet funded successfully for ${user.email} - ₦${creditAmount}`);
                    try {
                        notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                            reference,
                            amount: creditAmount,
                            gateway: 'paystack',
                            balance: creditedTxn?.balance_after ?? null
                        });
                    } catch (e) {
                        void e;
                    }
                } catch (error) {
                    if (t && !t.finished) await t.rollback();
                    logger.error(`[Webhook] Paystack processing error: ${error.message}`, { reference });
                    return res.status(500).send('Processing failed');
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        logger.error(`[Webhook] Paystack error: ${error.message}`);
        res.sendStatus(500);
    }
};

// @desc    Handle PayVessel Webhook
// @route   POST /api/webhooks/payvessel
// @access  Public (Secured by Signature and IP)
const handlePayvesselWebhook = async (req, res) => {
    const payvesselService = require('../services/payvesselService');
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const payload = req.body;
        const signature = req.headers['http_payvessel_http_signature'];
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const allowedIps = ["3.255.23.38", "162.246.254.36"];

        const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(payload));
        const isValidSignature = payvesselService.verifySignature(raw, signature);
        const isAllowedIp = allowedIps.some(ip => ipAddress.includes(ip));

        if (!isValidSignature || !isAllowedIp) {
            logger.warn(`[Webhook] PayVessel: Permission denied (Invalid signature or IP: ${ipAddress})`);
            return res.status(400).json({ message: 'Permission denied, invalid hash or ip address.' });
        }

        const { order, transaction, customer } = payload;
        const reference = transaction.reference;
        const amount = parseFloat(order.settlement_amount || order.amount);
        
        const t = await sequelize.transaction();
        try {
            const user = await User.findOne({ where: { email: customer.email } });
            if (!user) {
                await t.rollback();
                logger.error(`[Webhook] PayVessel: User with email ${customer.email} not found`);
                return res.status(404).json({ success: false, message: 'user not found' });
            }

            let creditedTxn = null;
            try {
                const result = await walletService.creditFundingWithFraudChecks(
                    user,
                    amount,
                    `PayVessel Funding: ${reference}`,
                    { 
                        reference, 
                        gateway: 'payvessel',
                        fee: order.fee,
                        description: order.description
                    },
                    t
                );
                if (result.status === 'pending_review') {
                    await t.commit();
                    logger.warn(`[Webhook] PayVessel: Funding held for review ${reference}`, { userId: user.id });
                    return res.status(200).json({ success: true, message: 'pending_review' });
                }
                creditedTxn = result.transaction || null;
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    await t.rollback();
                    logger.info(`[Webhook] PayVessel: Duplicate transaction ignored ${reference}`);
                    return res.status(200).json({ success: true, message: 'transaction already exist' });
                }
                throw error;
            }

            await t.commit();
            logger.info(`[Webhook] PayVessel: Wallet funded successfully for ${user.email} - ₦${amount}`);
            try {
                notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                    reference,
                    amount,
                    gateway: 'payvessel',
                    balance: creditedTxn?.balance_after ?? null
                });
            } catch (e) {
                void e;
            }
            res.status(200).json({ success: true, message: 'success' });

        } catch (error) {
            if (t && !t.finished) await t.rollback();
            logger.error(`[Webhook] PayVessel processing error: ${error.message}`, { reference });
            res.status(500).json({ success: false, message: 'Internal server error during processing' });
        }

    } catch (error) {
        logger.error(`[Webhook] PayVessel error: ${error.message}`);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Handle Monnify Webhook
// @route   POST /api/webhooks/monnify
// @access  Public (Secured by Signature)
const handleMonnifyWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const secret = process.env.MONNIFY_SECRET_KEY;
        const signature = req.headers['monnify-signature'];

        if (!signature) {
            return res.status(400).send('No signature provided');
        }

        const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
        const hash = crypto.createHmac('sha512', secret).update(raw).digest('hex');
        
        if (hash !== signature) {
            logger.warn('[Webhook] Monnify: Invalid signature');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        
        if (event.eventType === 'SUCCESSFUL_TRANSACTION') {
            const { transactionReference, amountPaid, paymentStatus, customerDTO } = event.eventData;
            
            if (paymentStatus === 'PAID') {
                const t = await sequelize.transaction();
                try {
                    const user = await User.findOne({ where: { email: customerDTO.email } });
                    if (!user) {
                        await t.rollback();
                        logger.error(`[Webhook] Monnify: User with email ${customerDTO.email} not found`);
                        return res.status(404).send('User not found');
                    }

                    let creditedTxn = null;
                    try {
                        const result = await walletService.creditFundingWithFraudChecks(
                            user,
                            amountPaid,
                            `Monnify Funding: ${transactionReference}`,
                            { reference: transactionReference, gateway: 'monnify' },
                            t
                        );
                        if (result.status === 'pending_review') {
                            await t.commit();
                            logger.warn(`[Webhook] Monnify: Funding held for review ${transactionReference}`, { userId: user.id });
                            return res.status(200).json({ success: true, message: 'Transaction pending review' });
                        }
                        creditedTxn = result.transaction || null;
                    } catch (error) {
                        if (error?.name === 'SequelizeUniqueConstraintError') {
                            await t.rollback();
                            logger.info(`[Webhook] Monnify: Duplicate transaction ignored ${transactionReference}`);
                            return res.status(200).json({ success: true, message: 'Transaction already exists' });
                        }
                        throw error;
                    }
                    
                    await t.commit();
                    logger.info(`[Webhook] Monnify: Wallet funded successfully for ${user.email} - ₦${amountPaid}`);
                    try {
                        notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                            reference: transactionReference,
                            amount: amountPaid,
                            gateway: 'monnify',
                            balance: creditedTxn?.balance_after ?? null
                        });
                    } catch (e) {
                        void e;
                    }
                } catch (error) {
                    if (t && !t.finished) await t.rollback();
                    logger.error(`[Webhook] Monnify processing error: ${error.message}`, { reference: transactionReference });
                    return res.status(500).send('Processing failed');
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        logger.error(`[Webhook] Monnify error: ${error.message}`);
        res.sendStatus(500);
    }
};

// @desc    Handle Smeplug Webhook (Transaction Status Updates)
// @route   POST /api/webhooks/smeplug
// @access  Public
const handleSmeplugWebhook = async (req, res) => {
    const { Transaction } = require('../models');
    try {
        const { reference, status } = req.body;
        logger.info(`[Webhook] SMEPlug received: ${reference} - ${status}`);
        
        if (reference && status) {
            const t = await sequelize.transaction();
            try {
                const transaction = await Transaction.findOne({ where: { reference } });
                
                if (transaction) {
                    if (status === 'success' && transaction.status !== 'completed') {
                        await transaction.markAsCompleted(req.body);
                        logger.info(`[Webhook] SMEPlug: Transaction ${reference} marked as completed`);
                    } else if (status === 'failed' && transaction.status !== 'failed') {
                        await transaction.markAsFailed(req.body.reason || 'SMEPlug reports failure');
                        logger.warn(`[Webhook] SMEPlug: Transaction ${reference} marked as failed`);
                    }
                }
                
                await t.commit();
            } catch (error) {
                if (t && !t.finished) await t.rollback();
                logger.error(`[Webhook] SMEPlug processing error: ${error.message}`, { reference });
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        logger.error(`[Webhook] SMEPlug error: ${error.message}`);
        res.sendStatus(500);
    }
};

const handleBillstackWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const payload = req.body;
        const secret = process.env.BILLSTACK_WEBHOOK_SECRET;
        const signature =
            req.headers['x-billstack-signature'] ||
            req.headers['x-wiaxy-signature'] ||
            req.headers['x-signature'] ||
            req.headers['wiaxy-signature'];

        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                logger.error('[Webhook] BillStack: BILLSTACK_WEBHOOK_SECRET not set; rejecting webhook');
                return res.status(500).json({ message: 'Webhook not configured' });
            }
            logger.warn('[Webhook] BillStack: BILLSTACK_WEBHOOK_SECRET not set; signature verification skipped');
        } else {
            const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(payload));
            const sig = String(signature || '').trim().toLowerCase();
            const computed256 = crypto.createHmac('sha256', secret).update(raw).digest('hex').toLowerCase();
            const computed512 = crypto.createHmac('sha512', secret).update(raw).digest('hex').toLowerCase();
            if (!sig || (sig !== computed256 && sig !== computed512)) {
                logger.warn('[Webhook] BillStack: Invalid signature');
                return res.status(400).json({ message: 'Invalid signature' });
            }
        }

        const data = payload?.data;
        const reference = data?.reference;
        const amount = parseFloat(data?.amount);
        const accountNumber = data?.account?.account_number;

        if (!reference || !accountNumber || Number.isNaN(amount)) {
            return res.status(400).json({ message: 'Invalid payload' });
        }

        const t = await sequelize.transaction();
        try {
            const virtualAccountService = require('../services/virtualAccountService');
            const user = await virtualAccountService.findUserByAccountNumber(accountNumber);
            if (!user) {
                await t.rollback();
                logger.error(`[Webhook] BillStack: User not found for account ${maskAccountNumber(accountNumber)}`);
                return res.status(404).json({ message: 'User not found' });
            }

            let creditedTxn = null;
            try {
                const result = await walletService.creditFundingWithFraudChecks(
                    user,
                    amount,
                    `BillStack Funding: ${reference}`,
                    {
                        reference,
                        gateway: 'billstack',
                        merchant_reference: data?.merchant_reference,
                        inter_bank_reference: data?.wiaxy_ref,
                        payer: data?.payer,
                        account: data?.account
                    },
                    t
                );
                if (result.status === 'pending_review') {
                    await t.commit();
                    logger.warn(`[Webhook] BillStack: Funding held for review ${reference}`, { userId: user.id });
                    return res.status(200).json({ success: true, message: 'pending_review' });
                }
                creditedTxn = result.transaction || null;
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    await t.rollback();
                    logger.info(`[Webhook] BillStack: Duplicate transaction ignored ${reference}`);
                    return res.status(200).json({ success: true, message: 'Transaction already exists' });
                }
                throw error;
            }

            await t.commit();
            logger.info(`[Webhook] BillStack: Wallet funded successfully for ${user.email} - ₦${amount}`);
            try {
                notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                    reference,
                    amount,
                    gateway: 'billstack',
                    balance: creditedTxn?.balance_after ?? null
                });
            } catch (e) {
                void e;
            }
            return res.status(200).json({ success: true });
        } catch (error) {
            if (t && !t.finished) await t.rollback();
            logger.error(`[Webhook] BillStack processing error: ${error.message}`, { reference });
            return res.status(500).json({ message: 'Processing failed' });
        }
    } catch (error) {
        logger.error(`[Webhook] BillStack error: ${error.message}`);
        return res.sendStatus(500);
    }
};

module.exports = {
    handlePaystackWebhook,
    handlePayvesselWebhook,
    handleMonnifyWebhook,
    handleSmeplugWebhook,
    handleBillstackWebhook
};
