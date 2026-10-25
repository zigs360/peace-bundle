const { Op } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { User, Wallet, Transaction, DepositReconciliationAudit } = require('../models');
const WebhookEvent = require('../models/WebhookEvent');
const webhookEventService = require('./webhookEventService');
const virtualAccountService = require('./virtualAccountService');
const walletService = require('./walletService');
const { 
    processBillstackFunding, 
    processPayvesselFunding, 
    notifyFundingSuccess 
} = require('../controllers/webhookController');

class VirtualAccountReconciliationService {
    /**
     * Resolve a user from event details using multi-strategy fallback
     */
    async resolveUserForEvent({ event, payload, data, accountNumber, customer }) {
        // Strategy 1: Direct event.userId if already set
        if (event?.userId) {
            try {
                const user = await User.findByPk(event.userId);
                if (user) return user;
            } catch (err) {
                logger.warn(`[VAReconcile] Error looking up user by event.userId ${event.userId}:`, err.message);
            }
        }

        // Strategy 2: Account number matching across NUBAN variations & dual virtual accounts
        const candidateAcc = 
            accountNumber ||
            data?.account_number ||
            data?.virtual_account_number ||
            data?.destination_account_number ||
            data?.settlement_account ||
            data?.order?.settlement_account ||
            data?.order?.settlementAccount ||
            data?.order?.account_number ||
            data?.order?.accountNumber ||
            data?.transaction?.settlement_account ||
            data?.transaction?.account_number ||
            data?.cr_account_no ||
            payload?.account_number ||
            payload?.virtual_account_number ||
            payload?.settlement_account ||
            payload?.order?.settlement_account ||
            payload?.order?.settlementAccount ||
            payload?.order?.account_number ||
            payload?.order?.accountNumber ||
            payload?.transaction?.settlement_account ||
            payload?.transaction?.account_number ||
            data?.account?.number ||
            payload?.eventData?.destinationAccountInformation?.accountNumber;

        if (candidateAcc) {
            try {
                const user = await virtualAccountService.findUserByAccountNumber(candidateAcc);
                if (user) return user;
            } catch (err) {
                logger.warn(`[VAReconcile] Error finding user by account ${candidateAcc}:`, err.message);
            }
        }

        // Strategy 3: Email matching
        const candidateEmail = 
            customer?.email || 
            data?.customer?.email || 
            data?.email || 
            payload?.customer?.email || 
            payload?.email ||
            payload?.eventData?.customerDTO?.email;

        if (candidateEmail) {
            try {
                const cleanEmail = String(candidateEmail).trim().toLowerCase();
                const user = await User.findOne({
                    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), cleanEmail)
                });
                if (user) return user;
            } catch (err) {
                logger.warn(`[VAReconcile] Error finding user by email:`, err.message);
            }
        }

        // Strategy 4: Phone matching
        const candidatePhone = 
            customer?.phone || 
            data?.customer?.phone || 
            data?.phone || 
            payload?.customer?.phone || 
            payload?.phone;

        if (candidatePhone) {
            try {
                const cleanPhone = String(candidatePhone).trim();
                const user = await User.findOne({ where: { phone: cleanPhone } });
                if (user) return user;
            } catch (err) {
                logger.warn(`[VAReconcile] Error finding user by phone:`, err.message);
            }
        }

        // Strategy 5: Merchant reference format PB-<userId>
        const merchantRef = data?.merchant_reference || payload?.merchant_reference || event?.reference;
        if (merchantRef && String(merchantRef).startsWith('PB-')) {
            const rawId = String(merchantRef).slice(3).trim();
            if (rawId) {
                try {
                    const user = await User.findByPk(rawId);
                    if (user) return user;
                } catch (err) {
                    logger.warn(`[VAReconcile] Error finding user by merchant_reference ${merchantRef}:`, err.message);
                }
            }
        }

        return null;
    }

    /**
     * Check if a deposit has already been credited in the ledger
     */
    async isAlreadyCredited({ reference, billstackReference, interBankReference, transactionRef, transaction = null }) {
        if (!reference) return false;

        const direct = await Transaction.findOne({
            where: { reference },
            transaction
        });
        if (direct) return true;

        const isSqlite = sequelize.getDialect?.() === 'sqlite';
        if (!isSqlite) {
            const conditions = [];
            if (billstackReference) {
                conditions.push(sequelize.literal(`metadata->>'billstack_reference' = '${String(billstackReference).replace(/'/g, "''")}'`));
            }
            if (interBankReference) {
                conditions.push(sequelize.literal(`metadata->>'inter_bank_reference' = '${String(interBankReference).replace(/'/g, "''")}'`));
            }
            if (transactionRef) {
                conditions.push(sequelize.literal(`metadata->>'transaction_ref' = '${String(transactionRef).replace(/'/g, "''")}'`));
            }

            if (conditions.length > 0) {
                const existing = await Transaction.findOne({
                    where: {
                        type: 'credit',
                        source: 'funding',
                        [Op.or]: conditions
                    },
                    transaction
                });
                if (existing) return true;
            }
        }

        return false;
    }

    /**
     * Reconcile a single webhook event
     */
    async reconcileSingleEvent(event) {
        if (!event) return { ok: false, reason: 'event_null' };

        try {
            const provider = String(event.provider || '').toLowerCase();
            const payload = event.payload || {};
            const data = payload?.data || payload;

            const reference = 
                data?.reference || 
                data?.transaction_ref || 
                data?.merchant_reference || 
                payload?.reference || 
                payload?.eventData?.transactionReference ||
                event.reference;

            const amount = parseFloat(
                data?.amount ?? 
                data?.amount_paid ?? 
                payload?.amount ?? 
                payload?.eventData?.amountPaid ??
                event.amount ?? 
                0
            );

            if (!reference || !amount || amount <= 0) {
                return { ok: false, reason: 'missing_reference_or_amount' };
            }

            const billstackReference = data?.billstack_reference || data?.wiaxy_ref || payload?.billstack_reference || null;
            const interBankReference = data?.wiaxy_ref || null;
            const transactionRef = data?.transaction_ref || null;

            // Check if already credited
            const alreadyCredited = await this.isAlreadyCredited({
                reference,
                billstackReference,
                interBankReference,
                transactionRef
            });

            if (alreadyCredited) {
                if (event.status !== 'processed') {
                    await webhookEventService.markProcessed(event.id, { userId: event.userId });
                }
                return { ok: true, duplicate: true, reference, status: 'already_credited', userId: event.userId };
            }

            // Extract customer info
            const customer = data?.customer || payload?.customer || payload?.eventData?.customerDTO || null;
            const accountNumber = 
                data?.account_number || 
                data?.virtual_account_number || 
                data?.destination_account_number || 
                data?.settlement_account ||
                data?.order?.settlement_account ||
                data?.order?.settlementAccount ||
                data?.order?.account_number ||
                data?.order?.accountNumber ||
                data?.transaction?.settlement_account ||
                data?.transaction?.account_number ||
                payload?.account_number || 
                payload?.virtual_account_number || 
                payload?.settlement_account ||
                payload?.order?.settlement_account ||
                payload?.order?.settlementAccount ||
                payload?.order?.account_number ||
                payload?.order?.accountNumber ||
                payload?.transaction?.settlement_account ||
                payload?.transaction?.account_number ||
                data?.account?.number ||
                payload?.eventData?.destinationAccountInformation?.accountNumber ||
                null;

            // Route to provider-specific processor if available
            if (provider === 'billstack') {
                const result = await processBillstackFunding({
                    webhookEventId: event.id,
                    payload,
                    data,
                    providerReference: reference,
                    amount,
                    accountNumber,
                    billstackReference
                });
                return { 
                    ...result, 
                    reference, 
                    amount: result.amount !== undefined ? result.amount : amount,
                    status: result.duplicate ? 'already_credited' : (result.ok ? 'credited' : 'failed')
                };
            }

            if (provider === 'payvessel') {
                const root = payload?.data || payload;
                const { order } = root || {};
                const result = await processPayvesselFunding({
                    webhookEventId: event.id,
                    payload,
                    data: root,
                    reference,
                    amount,
                    settlementAccount: accountNumber,
                    order,
                    customer
                });
                return { 
                    ...result, 
                    reference, 
                    amount: result.amount !== undefined ? result.amount : amount,
                    status: result.duplicate ? 'already_credited' : (result.ok ? 'credited' : 'failed')
                };
            }

            // Generic / Monnify / SafeHaven Reconciliation
            const user = await this.resolveUserForEvent({ event, payload, data, accountNumber, customer });
            if (!user) {
                logger.warn(`[VAReconcile] Unable to resolve user for event ${event.id} (provider: ${provider}, ref: ${reference})`);
                await webhookEventService.markFailed(event.id, { error: 'Reconciliation: user not found' });
                return { ok: false, reason: 'user_not_found', reference };
            }

            const t = await sequelize.transaction();
            try {
                const dupCheck = await Transaction.findOne({
                    where: { reference },
                    transaction: t
                });
                if (dupCheck) {
                    await t.rollback();
                    await webhookEventService.markProcessed(event.id, { userId: user.id });
                    return { ok: true, duplicate: true, reference, status: 'already_credited', userId: user.id };
                }

                const fundingResult = await walletService.creditFundingWithFraudChecks(
                    user,
                    amount,
                    `Bank Transfer: ${reference}`,
                    {
                        reference,
                        gateway: provider || 'bank_transfer',
                        reconciled_by: 'virtual_account_reconciliation_service'
                    },
                    t
                );

                if (fundingResult.status === 'pending_review') {
                    await t.commit();
                    logger.warn(`[VAReconcile] Funding held for review ${reference}`, { userId: user.id });
                    await webhookEventService.markProcessed(event.id, { userId: user.id });
                    return { ok: true, pending_review: true, reference, userId: user.id };
                }

                const creditedTxn = fundingResult.transaction || null;
                const feeAmount = parseFloat(creditedTxn?.metadata?.fee_amount || 0);
                const grossAmount = parseFloat(creditedTxn?.metadata?.gross_amount || amount);
                const netAmount = parseFloat(creditedTxn?.amount || 0);

                if (DepositReconciliationAudit) {
                    try {
                        await DepositReconciliationAudit.create({
                            transactionReference: reference,
                            userId: user.id,
                            walletId: creditedTxn?.walletId || null,
                            transactionId: creditedTxn?.id || null,
                            amount: netAmount,
                            gatewayProvider: provider || 'bank_transfer',
                            accountNumber: accountNumber || null,
                            reconciliationType: 'virtual_account_reconcile_service',
                            status: 'settled',
                            isReconciled: true,
                            walletBalanceBefore: creditedTxn?.balance_before ?? null,
                            walletBalanceAfter: creditedTxn?.balance_after ?? null,
                            metadata: {
                                originalEventId: event.id || null
                            },
                            timestampCredited: new Date()
                        }, { transaction: t });
                    } catch (auditErr) {
                        logger.warn(`[VAReconcile] Could not record deposit reconciliation audit: ${auditErr.message}`);
                    }
                }

                await t.commit();
                logger.info(`[VAReconcile] Successfully reconciled & credited deposit for user ${user.id} (${user.email}) - ₦${amount}, ref: ${reference}`);
                await webhookEventService.markProcessed(event.id, { userId: user.id });
                notifyFundingSuccess(user, {
                    reference,
                    amount: netAmount,
                    grossAmount,
                    feeAmount,
                    netAmount,
                    gateway: 'bank_transfer',
                    balance: creditedTxn?.balance_after ?? null
                });

                return { 
                    ok: true, 
                    reference, 
                    status: 'credited', 
                    userId: user.id, 
                    amount: netAmount, 
                    balance: creditedTxn?.balance_after ?? null 
                };
            } catch (txErr) {
                if (t && !t.finished) await t.rollback();
                if (txErr?.name === 'SequelizeUniqueConstraintError') {
                    await webhookEventService.markProcessed(event.id, { userId: user.id });
                    return { ok: true, duplicate: true, reference, status: 'already_credited', userId: user.id };
                }
                throw txErr;
            }
        } catch (error) {
            logger.error(`[VAReconcile] Error reconciling event ${event.id}:`, error.message);
            await webhookEventService.markFailed(event.id, { error: `Reconcile error: ${error.message}` });
            return { ok: false, reason: 'error', error: error.message };
        }
    }

    /**
     * Run batch reconciliation over uncredited webhook events across all providers
     */
    async reconcileUncreditedEvents({ limit = 100, hours = 72, provider = null } = {}) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const where = {
            status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] },
            createdAt: { [Op.gte]: since }
        };

        if (provider && provider !== 'all') {
            where.provider = String(provider).toLowerCase();
        }

        logger.info(`[VAReconcile] Scanning candidate uncredited webhook events since ${since.toISOString()} (limit: ${limit})`);

        const candidateEvents = await WebhookEvent.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: Math.min(limit, 500)
        });

        let scanned = candidateEvents.length;
        let creditedCount = 0;
        let duplicateCount = 0;
        let failedCount = 0;
        const results = [];

        for (const event of candidateEvents) {
            const res = await this.reconcileSingleEvent(event);
            if (res.ok && !res.duplicate) {
                creditedCount++;
                results.push({ id: event.id, reference: res.reference, status: 'credited', userId: res.userId, amount: res.amount });
            } else if (res.ok && res.duplicate) {
                duplicateCount++;
                results.push({ id: event.id, reference: res.reference, status: 'already_credited', userId: res.userId });
            } else {
                failedCount++;
                results.push({ id: event.id, reference: res.reference, status: 'unresolved', reason: res.reason || res.error });
            }
        }

        logger.info(`[VAReconcile] Batch scan finished: ${scanned} scanned, ${creditedCount} newly credited, ${duplicateCount} duplicate/already credited, ${failedCount} unresolved`);

        return {
            scanned,
            creditedCount,
            duplicateCount,
            failedCount,
            results
        };
    }

    /**
     * On-demand deposit reconciliation for a specific user
     * Resolves all virtual account numbers and email/phone for the user,
     * finds any uncredited webhook events, credits them immediately, and returns updated balance.
     */
    async reconcileUserDeposits(userId) {
        if (!userId) {
            throw new Error('User ID is required for reconciliation');
        }

        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Collect all account numbers and identifiers for this user
        const accountNumbers = new Set();
        if (user.virtual_account_number) {
            accountNumbers.add(String(user.virtual_account_number).trim());
        }

        const meta = user.metadata || {};
        const dualAccounts = meta?.dual_virtual_accounts?.accounts || {};
        for (const key of Object.keys(dualAccounts)) {
            const rec = dualAccounts[key];
            const acc = rec?.accountNumber || rec?.account_number || rec?.accountNo || rec?.number;
            if (acc) accountNumbers.add(String(acc).trim());
        }

        const singleKeys = [
            meta?.virtual_account?.account_number,
            meta?.virtual_account?.accountNumber,
            meta?.billstack?.account_number,
            meta?.billstack?.accountNumber,
            meta?.payvessel?.account_number,
            meta?.payvessel?.accountNumber,
            meta?.old_safehaven_account?.accountNumber,
            meta?.old_safehaven_account?.number,
            meta?.safehaven?.account_number,
            meta?.safehaven?.accountNumber,
        ];
        for (const s of singleKeys) {
            if (s) accountNumbers.add(String(s).trim());
        }

        const cleanEmail = user.email ? String(user.email).trim().toLowerCase() : null;
        const cleanPhone = user.phone ? String(user.phone).trim() : null;
        const merchantRef = `PB-${user.id}`;

        // Build query conditions
        const orConditions = [{ userId: user.id }];
        if (merchantRef) {
            orConditions.push({ reference: merchantRef });
        }

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Past 7 days
        const isSqlite = sequelize.getDialect?.() === 'sqlite';

        // Find candidate webhook events
        let candidateEvents = await WebhookEvent.findAll({
            where: {
                createdAt: { [Op.gte]: since },
                status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] },
                [Op.or]: orConditions
            },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        // Also scan candidate events where payload mentions account numbers or email
        if (accountNumbers.size > 0 || cleanEmail || cleanPhone) {
            const allUnprocessed = await WebhookEvent.findAll({
                where: {
                    createdAt: { [Op.gte]: since },
                    status: { [Op.in]: ['received', 'verified', 'failed', 'rejected'] }
                },
                order: [['createdAt', 'DESC']],
                limit: 100
            });

            const accList = Array.from(accountNumbers);
            for (const ev of allUnprocessed) {
                if (candidateEvents.some(c => c.id === ev.id)) continue;
                const payloadStr = JSON.stringify(ev.payload || {});
                const matchesAcc = accList.some(acc => payloadStr.includes(acc));
                const matchesEmail = cleanEmail && payloadStr.toLowerCase().includes(cleanEmail);
                const matchesPhone = cleanPhone && payloadStr.includes(cleanPhone);
                const matchesMerchant = payloadStr.includes(merchantRef);

                if (matchesAcc || matchesEmail || matchesPhone || matchesMerchant) {
                    candidateEvents.push(ev);
                }
            }
        }

        logger.info(`[VAReconcile] Reconciling deposits for user ${user.id}: found ${candidateEvents.length} candidate events`);

        const newlyCredited = [];
        let totalAmount = 0;

        for (const ev of candidateEvents) {
            const res = await this.reconcileSingleEvent(ev);
            if (res.ok && !res.duplicate) {
                newlyCredited.push({
                    reference: res.reference,
                    amount: res.amount,
                    status: 'credited'
                });
                totalAmount += (res.amount || 0);
            }
        }

        // Get refreshed wallet balance
        const wallet = await Wallet.findOne({ where: { userId: user.id } });
        const currentBalance = wallet ? parseFloat(wallet.balance) : 0;

        return {
            success: true,
            userId: user.id,
            scannedCandidateCount: candidateEvents.length,
            newlyCreditedCount: newlyCredited.length,
            newlyCredited,
            totalCreditedAmount: totalAmount,
            currentBalance
        };
    }
}

module.exports = new VirtualAccountReconciliationService();
