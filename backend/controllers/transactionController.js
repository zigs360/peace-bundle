const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Commission = require('../models/Commission');
const Referral = require('../models/Referral');
const SystemSetting = require('../models/SystemSetting');
const DataPlan = require('../models/DataPlan');
const Sim = require('../models/Sim');
const { sendTransactionNotification, sendSMS } = require('../services/notificationService');
const walletService = require('../services/walletService');
const smeplugService = require('../services/smeplugService');
const simManagementService = require('../services/simManagementService');
const dataPurchaseService = require('../services/dataPurchaseService');
const pricingService = require('../services/pricingService');
const transactionLimitService = require('../services/transactionLimitService');
const affiliateService = require('../services/affiliateService');
const paymentGatewayService = require('../services/paymentGatewayService');
const billPaymentService = require('../services/billPaymentService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const logger = require('../utils/logger');
const Joi = require('joi');
const { getReadableTransactionAttributes } = require('../services/transactionSchemaCompatibilityService');
const {
    getPhoneValidationError,
    normalizePhone,
    toFiniteNumber,
} = require('../utils/dataPlanUtils');
const { sanitizeTransactionForClient } = require('../utils/clientPayloadSanitizers');

const dashboardStatsCache = globalThis.__peacebundle_dashboard_stats_cache || new Map();
globalThis.__peacebundle_dashboard_stats_cache = dashboardStatsCache;
const dashboardStatsInflight = globalThis.__peacebundle_dashboard_stats_inflight || new Map();
globalThis.__peacebundle_dashboard_stats_inflight = dashboardStatsInflight;

// Helper for Affiliate Commission
const processAffiliateCommission = async (user, amount, transaction, t) => {
    // Basic implementation: check referrer, calculate %, credit wallet
    try {
        const referral = await Referral.findOne({ 
            where: { referredUserId: user.id },
            include: [{ model: User, as: 'Referrer' }]
        });

        if (referral && referral.Referrer) {
            // Fetch commission rate from SystemSetting or use default
            // For now, simple fixed amount or %
            const rate = 0.01; // 1%
            const commissionAmount = parseFloat(amount) * rate;
            
            if (commissionAmount > 0) {
                await walletService.creditCommission(referral.Referrer, commissionAmount, `Commission from ${user.name || user.email}`, t);
                
                // Record commission log
                await Commission.create({
                    referrerId: referral.referrerId,
                    referredUserId: user.id,
                    amount: commissionAmount,
                    commissionableId: transaction.id,
                    commissionable_type: 'transaction',
                    status: 'paid'
                }, { transaction: t });
            }
        }
    } catch (error) {
        console.error('Affiliate Commission Error:', error);
        // Don't fail the main transaction if commission fails
    }
};

const withSafeTransactionReadAttributes = async (options = {}) => {
    const readableAttributes = await getReadableTransactionAttributes();
    if (!readableAttributes || options.attributes) return options;
    return {
        ...options,
        attributes: readableAttributes,
    };
};

const ensureWalletOnUser = async (user) => {
    if (!user) return null;
    if (user.wallet) return user.wallet;
    const wallet = await walletService.ensureWallet(user);
    user.wallet = wallet;
    return wallet;
};

const buildAutoReversalMessage = (transaction, fallback) => {
    const reason = String(transaction?.failure_reason || '').trim();
    if (!reason) return fallback;
    if (String(transaction?.status || '').toLowerCase() === 'refunded') {
        return `${reason}. Transaction was automatically reversed`;
    }
    return reason;
};

const maskNotificationPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 4) return digits || 'unknown';
    return `*******${digits.slice(-4)}`;
};

const notifyAirtimePurchaseStatus = async ({ user, transaction, title, message, type = 'info', priority = 'medium' }) => {
    if (!user?.id) return;
    try {
        const notificationRealtimeService = require('../services/notificationRealtimeService');
        await notificationRealtimeService.sendToUser(user.id, {
            title,
            message,
            type,
            priority,
            link: '/dashboard/transactions',
            metadata: {
                kind: 'airtime_purchase',
                reference: transaction?.reference || null,
                status: transaction?.status || null,
                amount: transaction?.amount || null,
            },
        });
    } catch (error) {
        logger.error('[Airtime] Failed to send realtime status notification', {
            userId: user.id,
            reference: transaction?.reference || null,
            error: error.message,
        });
    }
};

// @desc    Initialize Wallet Funding
// @route   POST /api/transactions/fund/initialize
// @access  Private
const initializeFunding = async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findByPk(req.user.id);
        
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const paymentInfo = await paymentGatewayService.initializePayment(user, parseFloat(amount), {
            type: 'funding',
            userId: user.id
        });

        res.json({
            success: true,
            data: paymentInfo
        });
    } catch (error) {
        logger.error('Funding Initialization Error:', { error: error.message, stack: error.stack, userId: req.user.id });
        res.status(500).json({ success: false, message: error.message || 'Failed to initialize funding' });
    }
};

// @desc    Fund Wallet
// @route   POST /api/transactions/fund
// @access  Private
const fundWallet = async (req, res) => {
    const { amount, reference } = req.body;
    const userId = req.user.id;
    let t;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        t = await sequelize.transaction();

        // Use WalletService
        const creditResult = await walletService.creditFundingWithFraudChecks(
            user,
            value,
            'Wallet Funding',
            { reference, gateway: 'manual' },
            t
        );
        const newTransaction = creditResult.transaction;

        // Process Affiliate Commission
        await affiliateService.processFundingCommission(user, newTransaction, t);

        await t.commit();

        // Send Notification
        await sendTransactionNotification(user, newTransaction);

        // Fetch updated wallet for response
        const updatedWallet = await walletService.getBalance(user);

        try {
            const notificationRealtimeService = require('../services/notificationRealtimeService');
            const grossAmount = value;
            const feeAmount = parseFloat(newTransaction?.metadata?.fee_amount || 0);
            const netAmount = parseFloat(newTransaction?.amount || 0);
            notificationRealtimeService.emitToUser(user.id, 'wallet_balance_updated', {
                reference: newTransaction.reference,
                amount: netAmount,
                grossAmount,
                feeAmount,
                netAmount,
                gateway: 'manual',
                balance: newTransaction.balance_after ?? updatedWallet
            });
            await notificationRealtimeService.sendToUser(user.id, {
                title: 'Wallet funded',
                message: feeAmount > 0
                    ? `Received ₦${Number(grossAmount).toLocaleString()} - Fee ₦${Number(feeAmount).toLocaleString()} = Credited ₦${Number(netAmount).toLocaleString()}. Ref: ${newTransaction.reference}`
                    : `Your wallet has been credited with ₦${Number(netAmount).toLocaleString()}. Ref: ${newTransaction.reference}`,
                type: 'success',
                priority: 'medium',
                link: '/dashboard',
                metadata: { kind: 'wallet_funding', reference: newTransaction.reference, grossAmount, feeAmount, netAmount, balance: newTransaction.balance_after ?? updatedWallet }
            });
        } catch (e) {
            void e;
        }

        res.json({
            success: true,
            message: 'Wallet funded successfully',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Funding Error:', { error: error.message, stack: error.stack, userId, reference });
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Buy Data
// @route   POST /api/transactions/data
// @access  Private
const buyData = async (req, res) => {
    const rawReference = req.body?.reference || req.headers['idempotency-key'];
    const rawNetwork = req.body?.network;
    const rawPlanId = req.body?.planId;
    const rawPhone = req.body?.phone;
    const rawAmount = req.body?.amount;
    const userId = req.user.id;
    let t;

    const schema = Joi.object({
        network: Joi.string().valid('mtn', 'airtel', 'glo', '9mobile').required(),
        planId: Joi.number().integer().positive().required(),
        phone: Joi.string().required(),
        amount: Joi.number().positive().optional(),
        reference: Joi.string().pattern(/^[A-Za-z0-9_-]{6,64}$/).optional(),
    });

    const { value, error } = schema.validate({
        network: rawNetwork,
        planId: rawPlanId,
        phone: rawPhone,
        amount: rawAmount,
        reference: rawReference,
    }, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
            details: error.details.map((item) => item.message),
        });
    }

    const network = value.network;
    const planId = value.planId;
    const phone = normalizePhone(value.phone);
    const reference = value.reference;
    const requestedAmount = value.amount !== undefined ? toFiniteNumber(value.amount, NaN) : null;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (reference) {
            const existing = await transactionIntegrityService.findDuplicateByReference(reference);
            if (existing) {
                const updatedWallet = await walletService.getBalance(user);
                return res.status(200).json({
                    success: true,
                    message: 'Duplicate request (idempotent replay)',
                    balance: updatedWallet,
                    charged_price: toFiniteNumber(existing.amount) || null,
                    transaction_ref: existing.reference,
                    transaction: sanitizeTransactionForClient(existing, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
                });
            }
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                success: false,
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        t = await sequelize.transaction();

        // Fetch Data Plan
        const plan = await DataPlan.findByPk(planId);
        if (!plan || !plan.is_active) {
            if (t) await t.rollback();
            return res.status(404).json({ success: false, message: 'Data plan not found or inactive' });
        }

        if (String(plan.provider).toLowerCase() !== network) {
            if (t) await t.rollback();
            return res.status(400).json({ success: false, message: 'Selected plan does not belong to the chosen network' });
        }

        const phoneError = getPhoneValidationError(network, phone);
        if (phoneError) {
            if (t) await t.rollback();
            return res.status(400).json({ success: false, message: phoneError });
        }

        const telecoPrice = toFiniteNumber(plan.wallet_price ?? plan.original_price ?? plan.api_cost, NaN);
        if (!Number.isFinite(telecoPrice) || telecoPrice <= 0) {
            if (t) await t.rollback();
            return res.status(400).json({ success: false, message: 'Selected plan is unavailable for purchase' });
        }
        if (plan.available_wallet === false && plan.available_sim === false) {
            if (t) await t.rollback();
            return res.status(400).json({ success: false, message: 'Selected plan is currently disabled for purchase' });
        }

        const cost = parseFloat(await plan.getPriceForUser(user, { transaction: t }));
        if (requestedAmount !== null && Math.abs(cost - requestedAmount) > 0.009) {
            if (t) await t.rollback();
            return res.status(400).json({ success: false, message: 'Displayed price is stale. Please refresh plans and try again.' });
        }

        // 1. Debit Wallet
        let newTransaction;
        const transactionFingerprint = transactionIntegrityService.buildFingerprint({
            userId: user.id,
            source: 'data_purchase',
            recipientPhone: phone,
            amount: cost,
            network: plan.provider,
            planId,
        });
        const duplicateCandidate = await transactionIntegrityService.findLikelyDuplicate({
            userId: user.id,
            source: 'data_purchase',
            fingerprint: transactionFingerprint,
            clientReference: reference || null,
        });
        if (duplicateCandidate) {
            if (t && !t.finished) await t.rollback();
            const updatedWallet = await walletService.getBalance(user);
            return res.status(200).json({
                success: true,
                message: 'Duplicate request (idempotent replay)',
                balance: updatedWallet,
                charged_price: toFiniteNumber(duplicateCandidate.amount) || cost,
                transaction_ref: duplicateCandidate.reference,
                transaction: sanitizeTransactionForClient(duplicateCandidate, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
            });
        }
        try {
            newTransaction = await walletService.debit(
                user, 
                cost, 
                'data_purchase', 
                `${plan.provider.toUpperCase()} ${plan.name} to ${phone}`, 
                {
                    network: plan.provider,
                    planId,
                    phone,
                    planName: plan.name,
                    provider_plan_id: plan.smeplug_plan_id || String(plan.id),
                    charged_price: cost,
                    teleco_price: telecoPrice,
                    reference: reference || undefined,
                    client_reference: reference || undefined,
                }, 
                t
            );
        } catch (debitError) {
            if (debitError?.name === 'SequelizeUniqueConstraintError' && reference) {
                if (t && !t.finished) await t.rollback();
                const existing = await Transaction.findOne({ where: { reference } });
                const updatedWallet = await walletService.getBalance(user);
                return res.status(200).json({
                    success: true,
                    message: 'Duplicate request (idempotent replay)',
                    balance: updatedWallet,
                    charged_price: existing ? toFiniteNumber(existing.amount) : cost,
                    transaction_ref: existing?.reference || reference,
                    transaction: sanitizeTransactionForClient(existing, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
                });
            }
            throw debitError;
        }

        await transactionIntegrityService.annotateDebitTransaction(
            newTransaction,
            {
                recipient_phone: phone,
                provider: plan.provider,
                data_plan_id: plan.id,
                client_reference: reference || newTransaction.reference,
                transaction_fingerprint: transactionFingerprint,
            },
            t,
        );

        // 2. Process Purchase (Local SIM or API)
        const preferredSim = plan.available_sim === false ? null : await simManagementService.getOptimalSimForData(plan);
        const route = transactionIntegrityService.selectDataRoute({ plan, preferredSim });
        await transactionIntegrityService.lockRoute(newTransaction, route, t);

        newTransaction.status = 'processing';
        newTransaction.recipient_phone = phone;
        newTransaction.provider = plan.provider;
        newTransaction.dataPlanId = plan.id;
        if (route.simId) newTransaction.simId = route.simId;
        await newTransaction.save({ transaction: t });

        await dataPurchaseService.dispenseData(newTransaction, preferredSim, t);

        if (['failed', 'refunded'].includes(String(newTransaction.status || '').toLowerCase())) {
            await t.commit();
            const updatedWallet = await walletService.getBalance(user);
            return res.status(502).json({
                success: false,
                message: buildAutoReversalMessage(newTransaction, 'Data purchase failed and was automatically reversed'),
                balance: updatedWallet,
                charged_price: cost,
                transaction_ref: newTransaction.reference,
                transaction: sanitizeTransactionForClient(newTransaction, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
            });
        }

        await t.commit();
        await sendTransactionNotification(user, newTransaction);
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            success: true,
            message: 'Data purchase successful',
            balance: updatedWallet,
            charged_price: cost,
            transaction_ref: newTransaction.reference,
            transaction: sanitizeTransactionForClient(newTransaction, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' })
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        logger.error('Data Purchase Error:', { error: error.message, stack: error.stack, userId, phone });
        const msg = String(error?.message || 'Server Error');
        const status =
            msg.includes('Insufficient wallet balance') ? 400 :
            msg.includes('Daily transaction limit exceeded') ? 403 :
            msg.includes('Wallet is') ? 403 :
            500;
        res.status(status).json({ success: false, message: msg });
    }
};

// @desc    Buy Airtime
// @route   POST /api/transactions/airtime
// @access  Private
const buyAirtime = async (req, res) => {
    const normalizePhone = (value) => {
        const digits = String(value || '').replace(/\D/g, '');
        if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
        return digits;
    };

    const rawNetwork = req.body?.network;
    const rawPhone = req.body?.phone;
    const rawAmount = req.body?.amount;
    const rawReference = req.body?.reference || req.headers['idempotency-key'];

    const schema = Joi.object({
        network: Joi.string().valid('mtn', 'airtel', 'glo', '9mobile').required(),
        phone: Joi.string().custom((v, helpers) => {
            const normalized = normalizePhone(v);
            if (!/^[0-9]{11}$/.test(normalized)) return helpers.error('any.invalid');
            return normalized;
        }, 'phone normalization').required(),
        amount: Joi.number().integer().min(50).max(Number.parseInt(process.env.AIRTIME_MAX_NGN || '100000', 10)).required(),
        reference: Joi.string().pattern(/^[A-Za-z0-9_-]{6,64}$/).optional(),
    });

    const { value, error } = schema.validate({ network: rawNetwork, phone: rawPhone, amount: rawAmount, reference: rawReference }, { abortEarly: false });
    if (error) {
        return res.status(400).json({ success: false, message: 'Invalid request', details: error.details.map((d) => d.message) });
    }

    const { network, phone, amount, reference } = value;
    const userId = req.user.id;
    let t;
    let newTransaction;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (reference) {
            const existing = await transactionIntegrityService.findDuplicateByReference(reference);
            if (existing) {
                const updatedWallet = await walletService.getBalance(user);
                return res.status(200).json({
                    success: true,
                    message: 'Duplicate request (idempotent replay)',
                    balance: updatedWallet,
                    transaction: sanitizeTransactionForClient(existing, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
                });
            }
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                success: false,
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        t = await sequelize.transaction();

        const faceValue = Number(amount);
        const quote = await pricingService.quoteAirtime({ user, provider: network, faceValue, transaction: t });
        const toPay = parseFloat(String(quote.charged_amount));
        const transactionFingerprint = transactionIntegrityService.buildFingerprint({
            userId: user.id,
            source: 'airtime_purchase',
            recipientPhone: phone,
            amount: toPay,
            network,
            faceValue,
        });
        const duplicateCandidate = await transactionIntegrityService.findLikelyDuplicate({
            userId: user.id,
            source: 'airtime_purchase',
            fingerprint: transactionFingerprint,
            clientReference: reference || null,
        });
        if (duplicateCandidate) {
            if (t && !t.finished) await t.rollback();
            const updatedWallet = await walletService.getBalance(user);
            return res.status(200).json({
                success: true,
                message: 'Duplicate request (idempotent replay)',
                balance: updatedWallet,
                transaction: sanitizeTransactionForClient(duplicateCandidate, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
            });
        }

        // Debit Wallet
        try {
            newTransaction = await walletService.debit(
                user,
                toPay,
                'airtime_purchase',
                `${network.toUpperCase()} Airtime ₦${faceValue} to ${phone}`,
                { network, phone, faceValue, type: 'airtime', pricing: quote, reference: reference || undefined, client_reference: reference || undefined },
                t
            );
        } catch (debitError) {
            if (debitError?.name === 'SequelizeUniqueConstraintError' && reference) {
                if (t && !t.finished) await t.rollback();
                const existing = await Transaction.findOne({ where: { reference } });
                const updatedWallet = await walletService.getBalance(user);
                return res.status(200).json({
                    success: true,
                    message: 'Duplicate request (idempotent replay)',
                    balance: updatedWallet,
                    transaction: existing
                });
            }
            throw debitError;
        }

        await transactionIntegrityService.annotateDebitTransaction(
            newTransaction,
            {
                recipient_phone: phone,
                provider: network,
                client_reference: reference || newTransaction.reference,
                transaction_fingerprint: transactionFingerprint,
            },
            t,
        );

        logger.info('[Airtime] Purchase initiated', { userId, reference: newTransaction.reference, network, amount: faceValue });

        await newTransaction.update(
            {
                status: 'processing',
                recipient_phone: phone,
                provider: network,
                metadata: {
                    ...(newTransaction.metadata || {}),
                    vend_amount: faceValue,
                    charged_amount: toPay,
                    service_type: 'airtime',
                    pricing: quote
                }
            },
            { transaction: t }
        );

        const preferredSim = await simManagementService.getOptimalSim(network, faceValue);
        const route = transactionIntegrityService.selectAirtimeRoute({ network, preferredSim });
        await transactionIntegrityService.lockRoute(newTransaction, route, t);
        if (route.simId) {
            newTransaction.simId = route.simId;
            await newTransaction.save({ transaction: t });
        }

        let providerResult;
        try {
            providerResult = await dataPurchaseService.dispenseAirtimeWithFallback(
                newTransaction,
                { network, amount: faceValue, phoneNumber: phone },
                { endpoint: 'POST /api/transactions/airtime', userId },
                t
            );
        } catch (providerError) {
            await t.commit();
            const updatedWallet = await walletService.getBalance(user);
            return res.status(502).json({
                success: false,
                message: buildAutoReversalMessage(newTransaction, providerError.message || 'Airtime purchase failed at provider'),
                balance: updatedWallet,
                transaction: newTransaction
            });
        }

        const statusLower = String(newTransaction.status || '').toLowerCase();
        const isQueued = statusLower === 'queued' || providerResult?.pending === true;
        const isCompleted = statusLower === 'completed';
        const isTerminalFailure = providerResult?.failed || statusLower === 'failed' || statusLower === 'refunded';

        if (!providerResult || (!isQueued && !isCompleted && !isTerminalFailure)) {
            await transactionIntegrityService.failAndRefund(newTransaction, 'Airtime provider did not confirm success', t, {
                flagAsAnomaly: true,
                auditEvent: 'airtime_delivery_inconsistent_success',
            });
        }

        const finalStatusLower = String(newTransaction.status || '').toLowerCase();
        const finalTerminalFailure = providerResult?.failed || finalStatusLower === 'failed' || finalStatusLower === 'refunded';

        if (finalTerminalFailure) {
            await t.commit();
            const updatedWallet = await walletService.getBalance(user);
            await notifyAirtimePurchaseStatus({
                user,
                transaction: newTransaction,
                title: 'Airtime purchase reversed',
                message: `${network.toUpperCase()} airtime purchase to ${maskNotificationPhone(phone)} was reversed. Ref: ${newTransaction.reference}.`,
                type: 'error',
                priority: 'high',
            });
            return res.status(502).json({
                success: false,
                message: buildAutoReversalMessage(newTransaction, 'Airtime purchase failed and was automatically reversed'),
                balance: updatedWallet,
                transaction: sanitizeTransactionForClient(newTransaction, { isAdmin: String(user?.role || '').toLowerCase() === 'admin' }),
            });
        }

        await t.commit();
        if (providerResult?.pending || String(newTransaction.status || '').toLowerCase() === 'queued') {
            await notifyAirtimePurchaseStatus({
                user,
                transaction: newTransaction,
                title: 'Airtime purchase queued',
                message: `${network.toUpperCase()} airtime purchase to ${maskNotificationPhone(phone)} is pending provider verification. Ref: ${newTransaction.reference}.`,
                type: 'warning',
                priority: 'high',
            });
        } else {
            await notifyAirtimePurchaseStatus({
                user,
                transaction: newTransaction,
                title: 'Airtime purchase successful',
                message: `${network.toUpperCase()} airtime purchase to ${maskNotificationPhone(phone)} completed successfully. Ref: ${newTransaction.reference}.`,
                type: 'success',
                priority: 'medium',
            });
            await sendTransactionNotification(user, newTransaction);
        }
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            success: true,
            message: (providerResult?.pending || String(newTransaction.status || '').toLowerCase() === 'queued')
                ? 'Airtime purchase queued for verification'
                : 'Airtime purchase successful',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        logger.error('Airtime Purchase Error:', { error: error.message, stack: error.stack, userId, phone });
        const msg = String(error?.message || 'Server Error');
        const status =
            msg.includes('Insufficient wallet balance') ? 400 :
            msg.includes('Daily transaction limit exceeded') ? 403 :
            msg.includes('Wallet is') ? 403 :
            500;
        res.status(status).json({ success: false, message: msg });
    }
};

// @desc    Pay Bill
// @route   POST /api/transactions/bill
// @access  Private
const payBill = async (req, res) => {
    const { billType, provider, smartCardNumber, amount, phone, meterType, plan } = req.body;
    const userId = req.user.id;
    let t;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                success: false,
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        t = await sequelize.transaction();

        const cost = parseFloat(amount);

        let description = '';
        if (billType === 'power') {
            description = `${provider.toUpperCase()} ${meterType} (${smartCardNumber})`;
        } else {
            description = `${provider.toUpperCase()} ${plan || 'Subscription'} (${smartCardNumber})`;
        }

        const newTransaction = await walletService.debit(
            user,
            cost,
            'bill_payment',
            description,
            { billType, provider, smartCardNumber, phone, meterType, plan },
            t
        );

        const providerResult = await billPaymentService.payBill(
            billType,
            provider,
            smartCardNumber,
            cost,
            phone,
            meterType,
            plan
        );

        if (!providerResult || providerResult.success === false) {
            throw new Error(providerResult?.error || 'Bill payment failed at provider');
        }

        newTransaction.smeplug_response = providerResult.data;
        newTransaction.smeplug_reference = providerResult.data?.reference || providerResult.data?.data?.reference || providerResult.data?.transaction_reference || null;
        await newTransaction.save({ transaction: t });
        
        await t.commit();
        await sendTransactionNotification(user, newTransaction);
        
        const updatedWallet = await walletService.getBalance(user);

        res.json({
            success: true,
            message: 'Bill payment successful',
            balance: updatedWallet,
            transaction: newTransaction
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Bill Payment Error:', { error: error.message, stack: error.stack, userId, smartCardNumber });
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

const validateCustomer = async (req, res) => {
  try {
    const { billType, provider, account, meterType } = req.query;
    if (!billType || !provider || !account) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }
    let result;
    result = await billPaymentService.validateCustomer(billType, provider, account, meterType || 'Prepaid');
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Validation failed', data: result.data });
    }
    const data = result.data || {};
    res.json({
      success: true,
      name: data.name || data.customer_name || data.account_name || null,
      details: data
    });
  } catch (err) {
    logger.error('Customer validation error:', { error: err.message, stack: err.stack });
    res.status(500).json({ message: 'Server Error' });
  }
};
// @desc    Withdraw Funds
// @route   POST /api/transactions/withdraw
// @access  Private
const withdrawFunds = async (req, res) => {
    const { amount, accountNumber, bankName, accountName } = req.body;
    const userId = req.user.id;
    let t;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const withdrawAmount = parseFloat(amount);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        t = await sequelize.transaction();
        
        // Debit Wallet
        const newTransaction = await walletService.debit(
            user,
            withdrawAmount,
            'withdrawal',
            `Withdrawal to ${bankName} (${accountNumber})`,
            { accountNumber, bankName, accountName },
            t
        );

        // Process actual withdrawal via payment gateway
        const result = await paymentGatewayService.processWithdrawal({
            user,
            amount: withdrawAmount,
            accountNumber,
            bankName,
            accountName
        });

        if (!result.success) {
            throw new Error(result.error || 'Withdrawal failed at gateway');
        }

        await t.commit();
        await sendTransactionNotification(user, newTransaction);

        res.json({
            success: true,
            message: 'Withdrawal successful',
            transaction: newTransaction
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Withdrawal Error:', { error: error.message, stack: error.stack, userId, accountNumber });
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Airtime to Cash
// @route   POST /api/transactions/airtime-cash
// @access  Private
const airtimeToCash = async (req, res) => {
    const { network, amount, phoneNumber, sharePin } = req.body;
    const userId = req.user.id;
    
    try {
        const user = await User.findByPk(userId, { include: [{ model: Wallet, as: 'wallet' }] });
        if (!user || !user.wallet) {
            return res.status(404).json({ success: false, message: 'User or wallet not found' });
        }
        
        const newTransaction = await Transaction.create({
            walletId: user.wallet.id,
            userId: user.id,
            type: 'credit',
            amount: parseFloat(amount) * 0.8, // 80% payout
            balance_before: user.wallet.balance,
            balance_after: user.wallet.balance, // No change yet
            source: 'funding',
            status: 'pending',
            reference: `A2C-${Date.now()}`,
            description: `Airtime to Cash: ${network} ${amount}`,
            metadata: { network, phoneNumber, sharePin }
        });

        res.json({ 
            success: true,
            message: 'Request submitted successfully', 
            data: newTransaction 
        });
    } catch (error) {
        logger.error('Airtime to Cash Error:', { error: error.message, userId });
        res.status(500).json({ success: false, message: 'Failed to submit airtime to cash request' });
    }
};

// @desc    Print Recharge Card
// @route   POST /api/transactions/recharge-card
// @access  Private
const printRechargeCard = async (req, res) => {
    const { network, amount, quantity } = req.body;
    const userId = req.user.id;
    let t;
    
    try {
        const user = await User.findByPk(userId);
        const totalCost = parseFloat(amount) * parseInt(quantity);
        
        t = await sequelize.transaction();
        const newTransaction = await walletService.debit(
            user,
            totalCost,
            'bill_payment',
            `Printed ${quantity} ${network} ${amount} cards`,
            { network, amount, quantity },
            t
        );

        await t.commit();
        
        // Generate Mock Cards
        const cards = [];
        for(let i=0; i<parseInt(quantity); i++) {
            cards.push({
                pin: Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString(),
                serial: `SN${Math.floor(100000000 + Math.random() * 900000000)}`,
                amount: amount,
                network: network
            });
        }
        
        res.json({ 
            success: true,
            message: 'Cards generated successfully', 
            transaction: newTransaction, 
            cards: cards 
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Print Recharge Card Error:', { error: error.message, userId });
        res.status(500).json({ success: false, message: error.message || 'Failed to print cards' });
    }
};

// @desc    Check Result (WAEC/NECO)
// @route   POST /api/transactions/result-checker
// @access  Private
const checkResult = async (req, res) => {
    const { examType, quantity } = req.body;
    const userId = req.user.id;
    let t;
    
    try {
        const user = await User.findByPk(userId);
        const price = 3500; // Mock price
        const totalCost = price * parseInt(quantity || 1);
        
        t = await sequelize.transaction();
        const newTransaction = await walletService.debit(
            user,
            totalCost,
            'bill_payment',
            `${examType} Result Checker x${quantity}`,
            { examType, quantity },
            t
        );

        await t.commit();

        res.json({
            success: true,
            message: 'Result checker purchased successfully',
            transaction: newTransaction
        });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Check Result Error:', { error: error.message, userId });
        res.status(500).json({ success: false, message: error.message || 'Failed to purchase result checker' });
    }
};

// @desc    Transfer Funds
// @route   POST /api/transactions/transfer
// @access  Private
const transferFunds = async (req, res) => {
    const { recipientEmail, amount, pin } = req.body;
    const userId = req.user.id;
    let t;

    try {
        const sender = await User.findByPk(userId);
        const recipient = await User.findOne({ 
            where: { email: recipientEmail }
        });

        if (!recipient) {
            return res.status(404).json({ success: false, message: 'Recipient not found' });
        }

        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        t = await sequelize.transaction();
        
        // Use WalletService Transfer
        // Note: walletService.transfer returns { debit_transaction, credit_transaction }
        const result = await walletService.transfer(
            sender,
            recipient,
            transferAmount,
            `Transfer to ${recipient.name || recipientEmail}`,
            t
        );

        await t.commit();
        
        // Notifications?
        // await sendTransactionNotification(sender, result.debit_transaction);
        // await sendTransactionNotification(recipient, result.credit_transaction);

        res.json({ success: true, message: 'Transfer successful' });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Transfer Error:', { error: error.message, stack: error.stack, userId, recipientEmail });
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Send Bulk SMS
// @route   POST /api/transactions/bulk-sms
// @access  Private
const sendBulkSMS = async (req, res) => {
    const { senderId, message, recipients } = req.body; // recipients is array or comma separated string
    const userId = req.user.id;
    let t;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check Transaction Limits
        const limitCheck = await transactionLimitService.canTransact(user);
        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                success: false,
                message: limitCheck.reason,
                details: limitCheck 
            });
        }

        t = await sequelize.transaction();
        
        // Calculate cost (Mock: 4 naira per page per number)
        const recipientList = (Array.isArray(recipients) ? recipients : recipients.split(',')).map(r => r.trim()).filter(r => r.length > 0);
        const pages = Math.ceil(message.length / 160) || 1;
        const cost = recipientList.length * pages * 4;

        // Debit Wallet
        const newTransaction = await walletService.debit(
            user,
            cost,
            'bulk_sms_payment',
            `Bulk SMS to ${recipientList.length} numbers`,
            { senderId, pages, count: recipientList.length },
            t
        );

        await t.commit();

        // Send SMS via Termii (Async to avoid blocking response)
        // We use the sendSMS service which now handles Termii integration
        // Note: For very large lists, this should be moved to a background job (Queue)
        
        // Fire and forget (or await if critical)
        Promise.allSettled(recipientList.map((recipient) =>
            sendSMS(recipient, message, { senderId })
        )).then(results => {
            logger.info(`Bulk SMS Processed: ${results.length} messages`);
        }).catch(err => {
            logger.error('Bulk SMS Error:', err);
        });
        
        res.json({ success: true, message: 'SMS sent successfully', cost });
    } catch (error) {
        if (t) await t.rollback();
        logger.error('Bulk SMS Error:', { error: error.message, stack: error.stack, userId });
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Get all transactions (Admin)
// @route   GET /api/transactions
// @access  Private (Admin)
const getAllTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findAll(await withSafeTransactionReadAttributes({
            order: [['createdAt', 'DESC']],
            include: [{ 
                model: Wallet, 
                as: 'wallet', 
                include: [{ model: User, as: 'user', attributes: ['name', 'email'] }] 
            }]
        }));
        res.json(transactions);
    } catch (error) {
        const statusCode = Number(error?.statusCode) || 500;
        logger.error('[DashboardStats] Failed', { userId, statusCode, error: error.message });
        res.status(statusCode).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Get user transactions (With Filters)
// @route   GET /api/transactions
// @access  Private
const index = async (req, res) => {
    try {
        const { status, provider, date_from, date_to, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = {
            // Find wallet belonging to user and filter by that walletId
            // OR if we associate Transaction directly to User (which we should for easier querying)
            // Current model uses Wallet. Let's find User's Wallet first.
        };

        const user = await User.findByPk(req.user.id, { include: [{ model: Wallet, as: 'wallet' }] });
        await ensureWalletOnUser(user);
        if (!user || !user.wallet) {
            return res.json([]);
        }

        where.walletId = user.wallet.id;

        // Apply filters
        if (status) {
            where.status = status;
        }

        if (provider) {
            where.provider = provider;
        }

        if (date_from || date_to) {
            where.createdAt = {};
            if (date_from) {
                where.createdAt[Op.gte] = new Date(date_from);
            }
            if (date_to) {
                // Add one day to include the end date fully if it's just a date string
                const endDate = new Date(date_to);
                endDate.setHours(23, 59, 59, 999);
                where.createdAt[Op.lte] = endDate;
            }
        }

        const { count, rows } = await Transaction.findAndCountAll(await withSafeTransactionReadAttributes({
            where,
            include: [
                { model: DataPlan, as: 'dataPlan' }, 
                { model: Sim, as: 'sim' }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        }));

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Export transactions to PDF
// @route   GET /api/transactions/export
// @access  Private
const exportTransactions = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { include: [{ model: Wallet, as: 'wallet' }] });
        await ensureWalletOnUser(user);
        if (!user || !user.wallet) {
            return res.status(404).json({ message: 'User wallet not found' });
        }

        // Fetch all transactions for export (no pagination, latest first)
        const transactions = await Transaction.findAll(await withSafeTransactionReadAttributes({
            where: { walletId: user.wallet.id },
            include: [
                { model: DataPlan, as: 'dataPlan' }, 
                { model: Sim, as: 'sim' }
            ],
            order: [['createdAt', 'DESC']]
        }));

        // Create PDF
        const doc = new PDFDocument();
        const filename = `transactions-${new Date().toISOString().split('T')[0]}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // PDF Content
        doc.fontSize(20).text('Transaction History', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`User: ${user.name} (${user.email})`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // Table Header
        const startX = 50;
        let currentY = doc.y;
        
        doc.font('Helvetica-Bold');
        doc.text('Date', startX, currentY);
        doc.text('Type', startX + 100, currentY);
        doc.text('Amount', startX + 200, currentY);
        doc.text('Status', startX + 300, currentY);
        doc.text('Ref', startX + 400, currentY);
        
        doc.moveDown();
        doc.font('Helvetica');
        
        // Table Rows
        transactions.forEach(tx => {
            currentY = doc.y;
            
            // Check for page break
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }

            const date = new Date(tx.createdAt).toLocaleDateString();
            const type = tx.type === 'credit' ? 'Credit' : 'Debit';
            const amount = `N${parseFloat(tx.amount).toFixed(2)}`;
            const status = tx.status;
            const ref = tx.reference;

            doc.text(date, startX, currentY);
            doc.text(type, startX + 100, currentY);
            doc.text(amount, startX + 200, currentY);
            doc.text(status, startX + 300, currentY);
            doc.text(ref, startX + 400, currentY);
            
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user transactions (By Params or Self)
// @route   GET /api/transactions/:userId
// @access  Private
const getTransactions = async (req, res) => {
    let userId = req.params.userId;
    if (!userId || userId === 'my') {
        userId = req.user.id;
    }
    const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
    if (!isAdmin && String(userId) !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    try {
        const user = await User.findByPk(userId, { include: [{ model: Wallet, as: 'wallet' }] });
        await ensureWalletOnUser(user);
        if (!user || !user.wallet) {
            return res.status(404).json({ message: 'User or wallet not found' });
        }

        const transactions = await Transaction.findAll(await withSafeTransactionReadAttributes({
            where: { walletId: user.wallet.id },
            order: [['createdAt', 'DESC']]
        }));
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/transactions/stats/:userId
// @access  Private
const getDashboardStats = async (req, res) => {
    let userId = req.params.userId;
    if (!userId || userId === 'my') {
        userId = req.user.id;
    }

    try {
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin && String(userId) !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const cacheTtlMsRaw = Number.parseInt(process.env.DASHBOARD_STATS_CACHE_MS || '5000', 10);
        const cacheTtlMs = Number.isFinite(cacheTtlMsRaw) && cacheTtlMsRaw > 0 ? cacheTtlMsRaw : 5000;
        const cacheKey = `dashboard:${userId}`;
        const now = Date.now();
        const cached = dashboardStatsCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return res.json(cached.value);
        }

        const inflight = dashboardStatsInflight.get(cacheKey);
        if (inflight) {
            const value = await inflight;
            return res.json(value);
        }

        const startedAt = Date.now();
        const promise = (async () => {
            const user = await User.findByPk(userId);
            if (!user) {
                const err = new Error('User not found');
                err.statusCode = 404;
                throw err;
            }

            const wallet = await walletService.ensureWallet(user);
            if (!wallet) {
                const err = new Error('User wallet not found');
                err.statusCode = 404;
                throw err;
            }

            const walletId = wallet.id;
            const [transactionsCount, recentTransactions] = await Promise.all([
                Transaction.count({ where: { walletId } }),
                Transaction.findAll(await withSafeTransactionReadAttributes({
                    where: { walletId },
                    order: [['createdAt', 'DESC']],
                    limit: 5
                })),
            ]);

            const value = {
                transactionsCount,
                balance: parseFloat(wallet.balance || 0),
                commission: parseFloat(wallet.commission_balance || 0),
                bonus: parseFloat(wallet.bonus_balance || 0),
                recentTransactions
            };

            const durationMs = Date.now() - startedAt;
            if (durationMs >= 2000) {
                logger.warn('[DashboardStats] Slow response', { userId, walletId, durationMs });
            }

            dashboardStatsCache.set(cacheKey, { value, expiresAt: Date.now() + cacheTtlMs });
            return value;
        })();

        dashboardStatsInflight.set(cacheKey, promise);
        try {
            const value = await promise;
            return res.json(value);
        } finally {
            dashboardStatsInflight.delete(cacheKey);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Redeem Coupon
// @route   POST /api/transactions/coupon
// @access  Private
const redeemCoupon = async (req, res) => {
    // Mock implementation
    res.status(400).json({ message: 'Invalid or expired coupon' });
};

module.exports = {
    fundWallet,
    buyData,
    buyAirtime,
    payBill,
    validateCustomer,
    withdrawFunds,
    airtimeToCash,
    printRechargeCard,
    checkResult,
    transferFunds,
    sendBulkSMS,
    getAllTransactions,
    getTransactions,
    getDashboardStats,
    redeemCoupon,
    initializeFunding,
    index,
    exportTransactions
};
