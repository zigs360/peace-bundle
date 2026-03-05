const crypto = require('crypto');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

// @desc    Handle Paystack Webhook
// @route   POST /api/webhooks/paystack
// @access  Public (Secured by Signature)
const handlePaystackWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
        
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
                    const existingTxn = await Transaction.findOne({ where: { reference } });
                    if (existingTxn) {
                        await t.rollback();
                        logger.info(`[Webhook] Paystack: Transaction ${reference} already processed`);
                        return res.status(200).json({ success: true, message: 'Transaction already exists' });
                    }

                    const user = await User.findOne({ where: { email: customer.email } });
                    if (!user) {
                        await t.rollback();
                        logger.error(`[Webhook] Paystack: User with email ${customer.email} not found`);
                        return res.status(404).send('User not found');
                    }

                    const creditAmount = amount / 100; // kobo to Naira
                    await walletService.credit(
                        user,
                        creditAmount,
                        'funding',
                        `Paystack Funding: ${reference}`,
                        { reference, gateway: 'paystack' },
                        t
                    );
                    
                    await t.commit();
                    logger.info(`[Webhook] Paystack: Wallet funded successfully for ${user.email} - ₦${creditAmount}`);
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

        const isValidSignature = payvesselService.verifySignature(payload, signature);
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
            const existingTxn = await Transaction.findOne({ where: { reference } });
            if (existingTxn) {
                await t.rollback();
                logger.info(`[Webhook] PayVessel: Transaction ${reference} already processed`);
                return res.status(200).json({ success: true, message: 'transaction already exist' });
            }

            const user = await User.findOne({ where: { email: customer.email } });
            if (!user) {
                await t.rollback();
                logger.error(`[Webhook] PayVessel: User with email ${customer.email} not found`);
                return res.status(404).json({ success: false, message: 'user not found' });
            }

            await walletService.credit(
                user,
                amount,
                'funding',
                `PayVessel Funding: ${reference}`,
                { 
                    reference, 
                    gateway: 'payvessel',
                    fee: order.fee,
                    description: order.description
                },
                t
            );

            await t.commit();
            logger.info(`[Webhook] PayVessel: Wallet funded successfully for ${user.email} - ₦${amount}`);
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

        const hash = crypto.createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');
        
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
                    const existingTxn = await Transaction.findOne({ where: { reference: transactionReference } });
                    if (existingTxn) {
                        await t.rollback();
                        logger.info(`[Webhook] Monnify: Transaction ${transactionReference} already processed`);
                        return res.status(200).json({ success: true, message: 'Transaction already exists' });
                    }

                    const user = await User.findOne({ where: { email: customerDTO.email } });
                    if (!user) {
                        await t.rollback();
                        logger.error(`[Webhook] Monnify: User with email ${customerDTO.email} not found`);
                        return res.status(404).send('User not found');
                    }

                    await walletService.credit(
                        user,
                        amountPaid,
                        'funding',
                        `Monnify Funding: ${transactionReference}`,
                        { reference: transactionReference, gateway: 'monnify' },
                        t
                    );
                    
                    await t.commit();
                    logger.info(`[Webhook] Monnify: Wallet funded successfully for ${user.email} - ₦${amountPaid}`);
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

module.exports = {
    handlePaystackWebhook,
    handlePayvesselWebhook,
    handleMonnifyWebhook,
    handleSmeplugWebhook
};
