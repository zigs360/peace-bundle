const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { sequelize } = require('../config/db');

// @desc    Handle Paystack Webhook
// @route   POST /api/webhooks/paystack
// @access  Public (Secured by Signature)
const handlePaystackWebhook = async (req, res) => {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        // Verify signature
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
        
        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        
        if (event.event === 'charge.success') {
            const { reference, amount, status } = event.data;
            
            if (status === 'success') {
                const t = await sequelize.transaction();
                try {
                    // Find the transaction
                    const transaction = await Transaction.findOne({ where: { reference } }, { transaction: t });
                    
                    if (transaction && transaction.status === 'pending') {
                        // Update transaction status
                        transaction.status = 'completed';
                        await transaction.save({ transaction: t });
                        
                        // Credit User Wallet
                        const wallet = await Wallet.findByPk(transaction.walletId, { transaction: t });
                        if (wallet) {
                            const oldBalance = parseFloat(wallet.balance);
                            const newBalance = oldBalance + (amount / 100); // Paystack amount is in kobo
                            wallet.balance = newBalance;
                            await wallet.save({ transaction: t });

                            // Process Affiliate Commission
                            const user = await User.findByPk(wallet.userId, { transaction: t });
                            if (user) {
                                await affiliateService.processFundingCommission(user, transaction, t);
                            }
                        }
                    }
                    
                    await t.commit();
                } catch (error) {
                    await t.rollback();
                    console.error('Paystack Webhook Processing Error:', error);
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Paystack Webhook Error:', error);
        res.sendStatus(500);
    }
};

// @desc    Handle Monnify Webhook
// @route   POST /api/webhooks/monnify
// @access  Public (Secured by Signature)
const handleMonnifyWebhook = async (req, res) => {
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
const handleSmeplugWebhook = async (req, res) => {
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

module.exports = {
    handlePaystackWebhook,
    handleMonnifyWebhook,
    handleSmeplugWebhook
};
