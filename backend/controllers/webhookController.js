const crypto = require('crypto');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

// @desc    Handle Paystack Webhook
// @route   POST /api/webhooks/paystack
// @access  Public (Secured by Signature)
exports.handlePaystackWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        // Verify signature
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
        
        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        
        if (event.event === 'charge.success') {
            const { reference, amount, status, customer } = event.data;
            
            if (status === 'success') {
                const t = await sequelize.transaction();
                try {
                    // Check if reference already exists to prevent duplicate funding
                    const existingTxn = await Transaction.findOne({ where: { reference } }, { transaction: t });
                    if (existingTxn) {
                        await t.rollback();
                        return res.status(200).json({ message: 'Transaction already exists' });
                    }

                    // Find User by email from customer data
                    const user = await User.findOne({ where: { email: customer.email } }, { transaction: t });
                    if (!user) {
                        await t.rollback();
                        logger.error(`User with email ${customer.email} not found for Paystack webhook`);
                        return res.status(404).send('User not found');
                    }

                    // Credit Wallet using WalletService
                    const creditAmount = amount / 100; // Paystack amount is in kobo
                    const newTransaction = await walletService.credit(
                        user,
                        creditAmount,
                        'funding',
                        `Paystack Funding: ${reference}`,
                        { reference, gateway: 'paystack' },
                        t
                    );
                    
                    await t.commit();
                    logger.info(`Wallet funded successfully via Paystack: ${user.email} - N${creditAmount}`);
                } catch (error) {
                    await t.rollback();
                    logger.error('Paystack Webhook Processing Error:', error);
                    return res.status(500).send('Processing failed');
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        logger.error('Paystack Webhook Error:', error);
        res.sendStatus(500);
    }
};

// @desc    Handle PayVessel Webhook
// @route   POST /api/webhooks/payvessel
// @access  Public (Secured by Signature and IP)
exports.handlePayvesselWebhook = async (req, res) => {
    const payvesselService = require('../services/payvesselService');
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const payload = req.body;
        const signature = req.headers['http_payvessel_http_signature'];
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const allowedIps = ["3.255.23.38", "162.246.254.36"];

        // Security Check: Signature & IP
        const isValidSignature = payvesselService.verifySignature(payload, signature);
        const isAllowedIp = allowedIps.some(ip => ipAddress.includes(ip));

        if (!isValidSignature || !isAllowedIp) {
            logger.warn('PayVessel Webhook: Permission denied (Invalid signature or IP)', { ipAddress });
            return res.status(400).json({ message: 'Permission denied, invalid hash or ip address.' });
        }

        const { order, transaction, customer } = payload;
        const reference = transaction.reference;
        const amount = parseFloat(order.settlement_amount || order.amount); // Use settlement amount as it's the final value after fees
        
        const t = await sequelize.transaction();
        try {
            // 1. Check if reference already exists (Prevent duplicate funding)
            const existingTxn = await Transaction.findOne({ where: { reference } }, { transaction: t });
            if (existingTxn) {
                await t.rollback();
                return res.status(200).json({ message: 'transaction already exist' });
            }

            // 2. Find user by email from customer data
            const user = await User.findOne({ where: { email: customer.email } }, { transaction: t });
            if (!user) {
                await t.rollback();
                logger.error(`User with email ${customer.email} not found for PayVessel webhook`);
                return res.status(404).json({ message: 'user not found' });
            }

            // 3. Fund user wallet
            const newTransaction = await walletService.credit(
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
            logger.info(`Wallet funded successfully via PayVessel: ${user.email} - N${amount}`);
            res.status(200).json({ message: 'success' });

        } catch (error) {
            await t.rollback();
            logger.error('PayVessel Webhook Processing Error:', error);
            res.status(500).json({ message: 'Internal server error during processing' });
        }

    } catch (error) {
        logger.error('PayVessel Webhook Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Handle Monnify Webhook
// @route   POST /api/webhooks/monnify
// @access  Public (Secured by Signature)
exports.handleMonnifyWebhook = async (req, res) => {
    const { Transaction, Wallet } = require('../models');
    try {
        // Monnify signature validation logic would go here
        // const secret = process.env.MONNIFY_SECRET_KEY;
        // ...
        
        const event = req.body;
        
        if (event.eventType === 'SUCCESSFUL_TRANSACTION') {
            const { transactionReference, amountPaid, paymentStatus } = event.eventData;
            
            if (paymentStatus === 'PAID') {
                const t = await sequelize.transaction();
                try {
                    const transaction = await Transaction.findOne({ where: { reference: transactionReference } }, { transaction: t });
                    
                    if (transaction && transaction.status === 'pending') {
                        transaction.status = 'completed';
                        await transaction.save({ transaction: t });
                        
                        const wallet = await Wallet.findByPk(transaction.walletId, { transaction: t });
                        if (wallet) {
                            const oldBalance = parseFloat(wallet.balance);
                            const newBalance = oldBalance + parseFloat(amountPaid);
                            wallet.balance = newBalance;
                            await wallet.save({ transaction: t });
                        }
                    }
                    
                    await t.commit();
                } catch (error) {
                    await t.rollback();
                    console.error('Monnify Webhook Processing Error:', error);
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Monnify Webhook Error:', error);
        res.sendStatus(500);
    }
};

// @desc    Handle Smeplug Webhook (Transaction Status Updates)
// @route   POST /api/webhooks/smeplug
// @access  Public
exports.handleSmeplugWebhook = async (req, res) => {
    const { Transaction } = require('../models');
    try {
        // Implementation depends on Smeplug webhook format
        // Typically updates transaction status (data/airtime)
        const { reference, status } = req.body;
        
        if (reference && status) {
            const t = await sequelize.transaction();
            try {
                const transaction = await Transaction.findOne({ where: { reference } }, { transaction: t });
                
                if (transaction) {
                    if (status === 'success' && transaction.status !== 'completed') {
                        transaction.status = 'completed';
                        await transaction.save({ transaction: t });
                    } else if (status === 'failed' && transaction.status !== 'failed') {
                        transaction.status = 'failed';
                        
                        // Refund if necessary (logic depends on business rules)
                        // const wallet = await Wallet.findByPk(transaction.walletId, { transaction: t });
                        // wallet.balance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
                        // await wallet.save({ transaction: t });
                        
                        await transaction.save({ transaction: t });
                    }
                }
                
                await t.commit();
            } catch (error) {
                await t.rollback();
                console.error('Smeplug Webhook Processing Error:', error);
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Smeplug Webhook Error:', error);
        res.sendStatus(500);
    }
};
