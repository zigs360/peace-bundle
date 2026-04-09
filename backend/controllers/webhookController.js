const crypto = require('crypto');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const webhookEventService = require('../services/webhookEventService');

const webhookRetryService = require('../services/webhookRetryService');

const maskAccountNumber = (value) => {
    const s = String(value || '').replace(/\s+/g, '');
    if (!s) return null;
    const last4 = s.slice(-4);
    return `****${last4}`;
};

const notifyFundingSuccess = (user, { reference, amount, gateway, balance }) => {
    const startTime = Date.now();
    logger.info(`[Notification] Sending funding success for user ${user.id}, amount ${amount}, gateway ${gateway}`);
    
    try {
        notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
            reference,
            amount,
            gateway,
            balance
        });
    } catch (e) {
        logger.error(`[Notification] Socket emit failed: ${e.message}`);
    }

    try {
        void notificationRealtimeService.sendToUser(user.id, {
            title: 'Wallet funded',
            message: `Your wallet has been credited with ₦${Number(amount).toLocaleString()}${gateway ? ` via ${String(gateway)}` : ''}. Ref: ${reference}`,
            type: 'success',
            priority: 'medium',
            link: '/dashboard',
            metadata: { kind: 'wallet_funding', reference, amount, gateway, balance }
        });
    } catch (e) {
        logger.error(`[Notification] Persistent notification failed: ${e.message}`);
    }

    logger.info(`[Notification] Notifications sent in ${Date.now() - startTime}ms`);
};

const processBillstackFunding = async ({
    webhookEventId,
    payload,
    data,
    providerReference,
    amount,
    accountNumber,
    billstackReference
}) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    const virtualAccountService = require('../services/virtualAccountService');

    const t = await sequelize.transaction();
    try {
        let user = await virtualAccountService.findUserByAccountNumber(accountNumber);
        if (!user) {
            const merchantRef = String(data?.merchant_reference || '').trim();
            const pbPrefix = merchantRef.startsWith('PB-') ? merchantRef.slice(3) : null;
            if (pbPrefix && /^[0-9a-fA-F-]{36}$/.test(pbPrefix)) {
                user = await User.findByPk(pbPrefix);
            }
        }
        if (!user) {
            await t.rollback();
            logger.error(`[Webhook] BillStack: User not found for account ${maskAccountNumber(accountNumber)}`);
            await webhookEventService.markFailed(webhookEventId, { error: 'User not found', userId: null });
            return { ok: false, reason: 'user_not_found' };
        }

        const existingByRef = await Transaction.findOne({ where: { reference: providerReference }, transaction: t });
        if (existingByRef) {
            await t.rollback();
            logger.info(`[Webhook] BillStack: Duplicate transaction ignored ${providerReference}`);
            await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
            return { ok: true, duplicate: true, userId: user.id };
        }

        if (sequelize.getDialect && sequelize.getDialect() !== 'sqlite') {
            const possibleMerchantRef = String(data?.merchant_reference || '').trim();
            const possibleWiaxyRef = String(data?.wiaxy_ref || '').trim();
            const possibleTxnRef = String(data?.transaction_ref || '').trim();
            const possibleBillstackRef = String(data?.reference || '').trim();

            const duplicateSql = `
                SELECT "id", "reference"
                FROM "Transactions"
                WHERE "type" = 'credit'
                  AND "source" = 'funding'
                  AND (
                    ("metadata"::jsonb #>> '{inter_bank_reference}') = :wiaxy_ref
                    OR ("metadata"::jsonb #>> '{transaction_ref}') = :transaction_ref
                    OR ("metadata"::jsonb #>> '{merchant_reference}') = :merchant_reference
                    OR ("metadata"::jsonb #>> '{billstack_reference}') = :billstack_reference
                  )
                LIMIT 1
            `;

            const { QueryTypes } = require('sequelize');
            const existing = await sequelize.query(duplicateSql, {
                replacements: {
                    wiaxy_ref: possibleWiaxyRef || null,
                    transaction_ref: possibleTxnRef || null,
                    merchant_reference: possibleMerchantRef || null,
                    billstack_reference: possibleBillstackRef || null
                },
                type: QueryTypes.SELECT,
                transaction: t
            });

            if (Array.isArray(existing) && existing.length) {
                await t.rollback();
                logger.info(`[Webhook] BillStack: Duplicate transaction ignored ${providerReference}`);
                await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
                return { ok: true, duplicate: true, userId: user.id };
            }
        }

        let creditedTxn = null;
        try {
            const result = await walletService.creditFundingWithFraudChecks(
                user,
                amount,
                `BillStack Funding: ${providerReference}`,
                {
                    reference: providerReference,
                    gateway: 'billstack',
                    billstack_reference: billstackReference,
                    merchant_reference: data?.merchant_reference,
                    inter_bank_reference: data?.wiaxy_ref,
                    transaction_ref: data?.transaction_ref,
                    payer: data?.payer,
                    account: data?.account
                },
                t
            );
            if (result.status === 'pending_review') {
                await t.commit();
                logger.warn(`[Webhook] BillStack: Funding held for review ${providerReference}`, { userId: user.id });
                await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
                return { ok: true, pending_review: true, userId: user.id };
            }
            creditedTxn = result.transaction || null;
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                await t.rollback();
                logger.info(`[Webhook] BillStack: Duplicate transaction ignored ${providerReference}`);
                await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
                return { ok: true, duplicate: true, userId: user.id };
            }
            throw error;
        }

        await t.commit();
        logger.info(`[Webhook] BillStack: Wallet funded successfully for ${user.email} - ₦${amount}`);
        await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
        notifyFundingSuccess(user, { reference: providerReference, amount, gateway: 'billstack', balance: creditedTxn?.balance_after ?? null });
        try {
            const { sendTransactionNotification } = require('../services/notificationService');
            const txnForNotify = creditedTxn || (await Transaction.findOne({ where: { reference: providerReference } }));
            if (txnForNotify) setImmediate(() => { void sendTransactionNotification(user, txnForNotify); });
        } catch (e) {
            void e;
        }
        return { ok: true, userId: user.id, balance: creditedTxn?.balance_after ?? null };
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        logger.error(`[Webhook] BillStack processing error: ${error.message}`, { reference: providerReference });
        await webhookEventService.markFailed(webhookEventId, { error: error.message });
        return { ok: false, reason: 'processing_failed' };
    }
};

const processPaystackFunding = async ({
    webhookEventId,
    payload,
    reference,
    creditAmount,
    email
}) => {
    const walletService = require('../services/walletService');
    const { User, Transaction } = require('../models');

    const t = await sequelize.transaction();
    try {
        const user = await User.findOne({ where: { email }, transaction: t });
        if (!user) {
            await t.rollback();
            logger.error(`[Webhook] Paystack: User with email ${email} not found`);
            await webhookEventService.markFailed(webhookEventId, { error: 'User not found', userId: null });
            return { ok: false, reason: 'user_not_found' };
        }

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
                await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
                return { ok: true, pending_review: true, userId: user.id };
            }
            creditedTxn = result.transaction || null;
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                await t.rollback();
                logger.info(`[Webhook] Paystack: Duplicate transaction ignored ${reference}`);
                await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
                return { ok: true, duplicate: true, userId: user.id };
            }
            throw error;
        }
        
        await t.commit();
        logger.info(`[Webhook] Paystack: Wallet funded successfully for ${user.email} - ₦${creditAmount}`);
        await webhookEventService.markProcessed(webhookEventId, { userId: user.id });
        notifyFundingSuccess(user, { reference, amount: creditAmount, gateway: 'paystack', balance: creditedTxn?.balance_after ?? null });
        return { ok: true, userId: user.id, balance: creditedTxn?.balance_after ?? null };
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        logger.error(`[Webhook] Paystack processing error: ${error.message}`, { reference });
        await webhookEventService.markFailed(webhookEventId, { error: error.message });
        return { ok: false, reason: 'processing_failed', error: error.message };
    }
};

// @desc    Handle Paystack Webhook
// @route   POST /api/webhooks/paystack
// @access  Public (Secured by Signature)
const handlePaystackWebhook = async (req, res) => {
    const walletService = require('../services/walletService');
    const { Transaction, User } = require('../models');
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const event = req.body;
        const reference = event?.data?.reference || null;
        const creditAmount = event?.data?.amount ? Number(event.data.amount) / 100 : null;
        const webhookEvent = await webhookEventService.recordReceived({
            provider: 'paystack',
            reference,
            amount: Number.isFinite(creditAmount) ? creditAmount : null,
            currency: event?.data?.currency || null,
            payload: event,
            req
        });

        const signature = req.headers['x-paystack-signature'];
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                await webhookEventService.markFailed(webhookEvent.id, { error: 'PAYSTACK_SECRET_KEY not configured', signatureHeader: 'x-paystack-signature', signaturePresent: Boolean(signature) });
                return res.status(500).send('Webhook not configured');
            }
            await webhookEventService.markVerified(webhookEvent.id, { signatureHeader: 'x-paystack-signature', signaturePresent: Boolean(signature) });
        } else {
            const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
            const hash = crypto.createHmac('sha512', secret).update(raw).digest('hex');
            if (hash !== signature) {
                logger.warn('[Webhook] Paystack: Invalid signature');
                await webhookEventService.markRejected(webhookEvent.id, { error: 'Invalid signature', signatureHeader: 'x-paystack-signature', signaturePresent: Boolean(signature) });
                return res.status(400).send('Invalid signature');
            }
            await webhookEventService.markVerified(webhookEvent.id, { signatureHeader: 'x-paystack-signature', signaturePresent: true });
        }

        logger.info(`[Webhook] Paystack received: ${event.event}`, { reference: event.data?.reference });
        
        if (event.event === 'charge.success') {
            const { amount, status, customer } = event.data;
            
            if (status === 'success') {
                const startTime = Date.now();
                const result = await webhookRetryService.processWithRetry(
                    webhookEvent.id,
                    processPaystackFunding,
                    {
                        webhookEventId: webhookEvent.id,
                        payload: event,
                        reference,
                        creditAmount,
                        email: customer.email
                    }
                );
                
                const duration = Date.now() - startTime;
                logger.info(`[Webhook] Paystack processed in ${duration}ms (Status: ${result.ok ? 'OK' : 'FAIL'})`);
                
                if (result.ok) {
                    return res.status(200).json({ success: true, balance: result.balance });
                } else {
                    return res.status(200).json({ success: false, reason: result.reason });
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

        const reference = payload?.transaction?.reference || null;
        const amountParsed = payload?.order?.settlement_amount || payload?.order?.amount || null;
        const amount = amountParsed !== null ? Number(amountParsed) : null;
        const webhookEvent = await webhookEventService.recordReceived({
            provider: 'payvessel',
            reference,
            amount: Number.isFinite(amount) ? amount : null,
            currency: payload?.order?.currency || null,
            payload,
            req
        });

        const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(payload));
        const isValidSignature = payvesselService.verifySignature(raw, signature);
        const isAllowedIp = allowedIps.some(ip => ipAddress.includes(ip));

        if (!isValidSignature || !isAllowedIp) {
            logger.warn(`[Webhook] PayVessel: Permission denied (Invalid signature or IP: ${ipAddress})`);
            await webhookEventService.markRejected(webhookEvent.id, { error: 'Permission denied', signatureHeader: 'http_payvessel_http_signature', signaturePresent: Boolean(signature) });
            return res.status(400).json({ message: 'Permission denied, invalid hash or ip address.' });
        }
        await webhookEventService.markVerified(webhookEvent.id, { signatureHeader: 'http_payvessel_http_signature', signaturePresent: Boolean(signature) });

        const { order, transaction, customer } = payload;
        
        const t = await sequelize.transaction();
        try {
            const user = await User.findOne({ where: { email: customer.email } });
            if (!user) {
                await t.rollback();
                logger.error(`[Webhook] PayVessel: User with email ${customer.email} not found`);
                await webhookEventService.markFailed(webhookEvent.id, { error: 'User not found', userId: null });
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
                    await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
                    return res.status(200).json({ success: true, message: 'pending_review' });
                }
                creditedTxn = result.transaction || null;
            } catch (error) {
                if (error?.name === 'SequelizeUniqueConstraintError') {
                    await t.rollback();
                    logger.info(`[Webhook] PayVessel: Duplicate transaction ignored ${reference}`);
                    await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
                    return res.status(200).json({ success: true, message: 'transaction already exist' });
                }
                throw error;
            }

            await t.commit();
            logger.info(`[Webhook] PayVessel: Wallet funded successfully for ${user.email} - ₦${amount}`);
            await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
            notifyFundingSuccess(user, { reference, amount, gateway: 'payvessel', balance: creditedTxn?.balance_after ?? null });
            res.status(200).json({ success: true, message: 'success' });

        } catch (error) {
            if (t && !t.finished) await t.rollback();
            logger.error(`[Webhook] PayVessel processing error: ${error.message}`, { reference });
            await webhookEventService.markFailed(webhookEvent.id, { error: error.message });
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
        const event = req.body;
        const reference = event?.eventData?.transactionReference || null;
        const amountPaid = event?.eventData?.amountPaid ?? null;
        const webhookEvent = await webhookEventService.recordReceived({
            provider: 'monnify',
            reference,
            amount: amountPaid !== null ? Number(amountPaid) : null,
            currency: event?.eventData?.currencyCode || null,
            payload: event,
            req
        });

        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                await webhookEventService.markFailed(webhookEvent.id, { error: 'MONNIFY_SECRET_KEY not configured', signatureHeader: 'monnify-signature', signaturePresent: Boolean(signature) });
                return res.status(500).send('Webhook not configured');
            }
            await webhookEventService.markVerified(webhookEvent.id, { signatureHeader: 'monnify-signature', signaturePresent: Boolean(signature) });
        } else {
            if (!signature) {
                await webhookEventService.markRejected(webhookEvent.id, { error: 'No signature provided', signatureHeader: 'monnify-signature', signaturePresent: false });
                return res.status(400).send('No signature provided');
            }
            const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
            const hash = crypto.createHmac('sha512', secret).update(raw).digest('hex');
            if (hash !== signature) {
                logger.warn('[Webhook] Monnify: Invalid signature');
                await webhookEventService.markRejected(webhookEvent.id, { error: 'Invalid signature', signatureHeader: 'monnify-signature', signaturePresent: true });
                return res.status(400).send('Invalid signature');
            }
            await webhookEventService.markVerified(webhookEvent.id, { signatureHeader: 'monnify-signature', signaturePresent: true });
        }
        
        if (event.eventType === 'SUCCESSFUL_TRANSACTION') {
            const { transactionReference, paymentStatus, customerDTO } = event.eventData;
            
            if (paymentStatus === 'PAID') {
                const t = await sequelize.transaction();
                try {
                    const user = await User.findOne({ where: { email: customerDTO.email } });
                    if (!user) {
                        await t.rollback();
                        logger.error(`[Webhook] Monnify: User with email ${customerDTO.email} not found`);
                        await webhookEventService.markFailed(webhookEvent.id, { error: 'User not found', userId: null });
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
                            await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
                            return res.status(200).json({ success: true, message: 'Transaction pending review' });
                        }
                        creditedTxn = result.transaction || null;
                    } catch (error) {
                        if (error?.name === 'SequelizeUniqueConstraintError') {
                            await t.rollback();
                            logger.info(`[Webhook] Monnify: Duplicate transaction ignored ${transactionReference}`);
                            await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
                            return res.status(200).json({ success: true, message: 'Transaction already exists' });
                        }
                        throw error;
                    }
                    
                    await t.commit();
                    logger.info(`[Webhook] Monnify: Wallet funded successfully for ${user.email} - ₦${amountPaid}`);
                    await webhookEventService.markProcessed(webhookEvent.id, { userId: user.id });
                    notifyFundingSuccess(user, { reference: transactionReference, amount: amountPaid, gateway: 'monnify', balance: creditedTxn?.balance_after ?? null });
                } catch (error) {
                    if (t && !t.finished) await t.rollback();
                    logger.error(`[Webhook] Monnify processing error: ${error.message}`, { reference: transactionReference });
                    await webhookEventService.markFailed(webhookEvent.id, { error: error.message });
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
    try {
        const payload = req.body;
        const secret = process.env.BILLSTACK_WEBHOOK_SECRET || process.env.BILLSTACK_SECRET_KEY;
        
        const signature =
            req.headers['x-billstack-signature'] ||
            req.headers['x-wiaxy-signature'] ||
            req.headers['x-signature'] ||
            req.headers['wiaxy-signature'] ||
            req.headers['X-BillStack-Signature'] ||
            req.headers['X-Wiaxy-Signature'] ||
            req.headers['X-Signature'] ||
            req.headers['Wiaxy-Signature'];

        const signatureHeader =
            req.headers['x-billstack-signature'] ? 'x-billstack-signature' :
            req.headers['x-wiaxy-signature'] ? 'x-wiaxy-signature' :
            req.headers['x-signature'] ? 'x-signature' :
            req.headers['wiaxy-signature'] ? 'wiaxy-signature' :
            null;

        const data = payload?.data || payload;
        const eventName = String(payload?.event || payload?.event_type || data?.event || data?.event_type || '').toUpperCase();
        const billstackReference = data?.reference || data?.transaction_ref || data?.wiaxy_ref || data?.transactionReference || payload?.reference || payload?.transaction_ref;
        const wiaxyRef = data?.wiaxy_ref || data?.transaction_ref || data?.transactionRef || data?.transactionReference || payload?.wiaxy_ref || payload?.transaction_ref || null;
        const providerReference = String(wiaxyRef || billstackReference || '').trim();
        const amountRaw = data?.amount || data?.amount_paid || data?.total_amount || payload?.amount || payload?.amount_paid;
        const sanitizeAmount = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val !== 'string') return NaN;
            return parseFloat(val.replace(/,/g, ''));
        };
        const amount = sanitizeAmount(amountRaw);
        const accountNumber = data?.account?.account_number || data?.account_number || data?.accountNumber || data?.account?.accountNumber || payload?.account_number || payload?.account?.account_number || payload?.accountNumber;

        const webhookEvent = await webhookEventService.recordReceived({
            provider: 'billstack',
            reference: providerReference || null,
            amount: Number.isFinite(amount) ? amount : null,
            currency: data?.currency || null,
            payload,
            req
        });

        logger.info(`[Webhook] BillStack received: ${eventName}`, { reference: providerReference });

        let signatureOk = false;
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                logger.error('[Webhook] BillStack: BILLSTACK_WEBHOOK_SECRET not set; rejecting webhook');
                await webhookEventService.markFailed(webhookEvent.id, { error: 'Webhook secret not configured' });
                return res.status(500).json({ message: 'Webhook not configured' });
            }
            logger.warn('[Webhook] BillStack: BILLSTACK_WEBHOOK_SECRET not set; signature verification skipped');
            await webhookEventService.markVerified(webhookEvent.id, { signatureHeader, signaturePresent: Boolean(signature) });
            signatureOk = true;
        } else {
            const incomingSignature = String(signature || '').trim().toLowerCase();
            const md5 = (value) => crypto.createHash('md5').update(String(value || '')).digest('hex').toLowerCase();
            const candidates = [
                md5(secret),
                process.env.BILLSTACK_WEBHOOK_SECRET ? md5(process.env.BILLSTACK_WEBHOOK_SECRET) : null,
                process.env.BILLSTACK_SECRET_KEY ? md5(process.env.BILLSTACK_SECRET_KEY) : null,
                process.env.BILLSTACK_PUBLIC_KEY ? md5(process.env.BILLSTACK_PUBLIC_KEY) : null,
            ].filter(Boolean);

            signatureOk = Boolean(incomingSignature) && candidates.includes(incomingSignature);

            if (signatureOk) {
                await webhookEventService.markVerified(webhookEvent.id, { signatureHeader, signaturePresent: true });
            } else {
                await webhookEventService.markRejected(webhookEvent.id, { error: 'Invalid or missing signature', signatureHeader, signaturePresent: Boolean(signature) });
                const merchantRef = String(data?.merchant_reference || '').trim();
                if (!merchantRef.startsWith('PB-')) {
                    logger.warn('[Webhook] BillStack: Rejecting unsigned webhook without PB merchant_reference', { reference: providerReference });
                    return res.status(200).json({ success: false, message: 'Signature invalid/missing' });
                }
            }
        }

        // Handle PING or other non-payment events gracefully with 200 OK
        const isPaymentNotification = 
            eventName === 'PAYMENT_NOTIFICATION' || 
            eventName === 'PAYMENT_NOTIFIFICATION' || 
            eventName === 'RESERVED_ACCOUNT_TRANSACTION' ||
            eventName === 'SUCCESSFUL_TRANSACTION' ||
            eventName === 'TRANSACTION_SUCCESS' ||
            eventName === 'CREDIT_SUCCESS' ||
            eventName === 'CHARGE.SUCCESS' ||
            eventName === 'PAYMENT.SUCCESS';
        
        const eventTimestamp = payload?.created_at || data?.created_at || payload?.timestamp;
        if (eventTimestamp) {
            const ts = new Date(eventTimestamp).getTime();
            if (Number.isFinite(ts)) {
                const ageMs = Date.now() - ts;
                if (ageMs > 15 * 60 * 1000) {
                    logger.warn('[Webhook] BillStack: Delayed notification', { reference: providerReference, ageMs });
                }
            }
        }

        if (!isPaymentNotification && !data) {
            logger.info(`[Webhook] BillStack: Ignoring non-payment event ${eventName}`);
            await webhookEventService.markProcessed(webhookEvent.id, { userId: null });
            return res.status(200).json({ success: true, message: 'Event ignored' });
        }

        if (!providerReference || !accountNumber || Number.isNaN(amount)) {
            const missing = [];
            if (!providerReference) missing.push('reference');
            if (!accountNumber) missing.push('accountNumber');
            if (Number.isNaN(amount)) missing.push('amount');
            
            logger.warn(`[Webhook] BillStack: Invalid payload (Missing: ${missing.join(', ')})`, { 
                event: eventName,
                providerReference,
                accountNumber,
                amount,
                payload: JSON.stringify(payload)
            });
            await webhookEventService.markRejected(webhookEvent.id, { error: `Invalid payload (Missing: ${missing.join(', ')})`, signatureHeader, signaturePresent: Boolean(signature) });
            return res.status(200).json({ success: false, message: 'Invalid payload', missing });
        }

        const processingArgs = {
            webhookEventId: webhookEvent.id,
            payload,
            data,
            providerReference,
            amount,
            accountNumber,
            billstackReference
        };

        if (process.env.NODE_ENV === 'test') {
            const startTime = Date.now();
            const result = await webhookRetryService.processWithRetry(
                webhookEvent.id,
                processBillstackFunding,
                processingArgs,
                { maxRetries: 0, retryDelays: [] }
            );
            const duration = Date.now() - startTime;
            logger.info(`[Webhook] BillStack processed in ${duration}ms (Status: ${result.ok ? 'OK' : 'FAIL'})`);
            return res.status(200).json({ success: Boolean(result.ok), balance: result.balance || null, reason: result.reason || null });
        }

        const inlineDeadlineMs = parseInt(process.env.BILLSTACK_CREDIT_DEADLINE_MS || '4500', 10);
        const inlineStart = Date.now();
        let inlineResult = null;
        try {
            inlineResult = await Promise.race([
                webhookRetryService.processWithRetry(
                    webhookEvent.id,
                    processBillstackFunding,
                    processingArgs,
                    { maxRetries: 0, retryDelays: [] }
                ),
                new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: 'deadline_exceeded' }), inlineDeadlineMs))
            ]);
        } catch (e) {
            inlineResult = { ok: false, reason: 'inline_exception', error: e?.message || String(e) };
        }

        const inlineDuration = Date.now() - inlineStart;
        logger.info('[Webhook] BillStack inline result', {
            webhookEventId: webhookEvent.id,
            reference: providerReference,
            ok: Boolean(inlineResult?.ok),
            reason: inlineResult?.reason || null,
            durationMs: inlineDuration
        });

        if (inlineResult?.ok) {
            return res.status(200).json({ success: true, balance: inlineResult.balance || null });
        }

        res.status(200).json({ success: true });
        setImmediate(() => {
            void webhookRetryService.processWithRetry(
                webhookEvent.id,
                processBillstackFunding,
                processingArgs,
                { maxRetries: 2, retryDelays: [1000, 2000] }
            );
        });
        return;
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
