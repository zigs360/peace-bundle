const { User, Wallet, Transaction, Referral, ReferralClick, SystemSetting } = require('../models');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const crypto = require('crypto');
const logger = require('../utils/logger');

const parseRewardAmount = (value, fallback) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const hashValue = (value) => {
    if (!value) return null;
    const salt = process.env.REFERRAL_HASH_SALT || process.env.JWT_SECRET || 'peace-bundle-referrals';
    return crypto.createHash('sha256').update(`${salt}:${String(value)}`).digest('hex');
};

class ReferralService {
    /**
     * Auto-heal referrals table schema in PostgreSQL if missing columns are encountered
     */
    async _ensureSchemaCompatibility() {
        if (!sequelize?.getDialect || sequelize.getDialect() !== 'postgres') return;
        try {
            await sequelize.query(`
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) NOT NULL DEFAULT 'pending';
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_deposit_amount" DECIMAL(15, 2);
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_deposit_at" TIMESTAMPTZ;
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "qualifying_transaction_id" VARCHAR(255);
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_signup_bonus_amount" DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_signup_bonus_awarded_at" TIMESTAMPTZ;
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_signup_bonus_amount" DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
                ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_signup_bonus_awarded_at" TIMESTAMPTZ;
                CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "referrals" ("status");
                CREATE INDEX IF NOT EXISTS "referrals_referred_user_id_idx" ON "referrals" ("referredUserId");
                CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "referrals" ("referrerId");
            `);
            logger.info('[Referral] Auto-healed referrals table schema columns in PostgreSQL');
        } catch (err) {
            logger.warn(`[Referral] Failed to auto-heal schema: ${err.message}`);
        }
    }

    /**
     * Generate a cryptographically secure referral code.
     * Format: 3 letters from name + 4 secure random hex characters
     * @param {string} name - User's name
     * @returns {Promise<string>}
     */
    async generateUniqueCode(name) {
        const prefix = (name || 'PB')
            .replace(/[^a-zA-Z]/g, '')
            .substring(0, 3)
            .toUpperCase()
            .padEnd(3, 'X');
        
        let isUnique = false;
        let code = '';
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
            code = `${prefix}${randomSuffix}`;
            
            const existingUser = await User.findOne({ where: { referral_code: code } });
            if (!existingUser) {
                isUnique = true;
            }
            attempts++;
        }

        return code;
    }

    /**
     * Validate a referral code.
     * @param {string} code 
     * @returns {Promise<User|null>}
     */
    async validateCode(code) {
        if (!code) return null;
        const normalized = String(code).trim().toUpperCase();
        return await User.findOne({ 
            where: { referral_code: normalized },
            attributes: ['id', 'name', 'email', 'phone', 'referral_code']
        });
    }

    /**
     * Track a click on a referral link.
     */
    async trackClick({ referralCode, clickToken, landingPath = null, source = null, ip = null, userAgent = null }) {
        const normalizedCode = String(referralCode || '').trim().toUpperCase();
        const normalizedToken = String(clickToken || '').trim();
        if (!normalizedCode || !normalizedToken) {
            return { tracked: false, reason: 'missing_referral_context' };
        }

        const referrer = await this.validateCode(normalizedCode);
        if (!referrer) {
            return { tracked: false, reason: 'invalid_referral_code' };
        }

        const [click, created] = await ReferralClick.findOrCreate({
            where: {
                referral_code: normalizedCode,
                click_token: normalizedToken,
            },
            defaults: {
                referrerId: referrer.id,
                referral_code: normalizedCode,
                click_token: normalizedToken,
                landing_path: landingPath || null,
                source: source || null,
                ip_hash: hashValue(ip),
                user_agent_hash: hashValue(userAgent),
            },
        });

        if (!created) {
            await click.update({
                referrerId: click.referrerId || referrer.id,
                landing_path: click.landing_path || landingPath || null,
                source: click.source || source || null,
                ip_hash: click.ip_hash || hashValue(ip),
                user_agent_hash: click.user_agent_hash || hashValue(userAgent),
            });
        }

        return {
            tracked: true,
            created,
            referrerId: referrer.id,
            referralCode: normalizedCode,
            clickId: click.id,
        };
    }

    /**
     * Record a new referral relationship at user signup.
     * NOTE: Does NOT award any bonuses. Bonuses are strictly awarded upon qualifying deposit.
     * Prevents self-referral, duplicate referral relationship, and reassignment.
     * @param {User} referrer 
     * @param {User} referredUser 
     * @param {Object} options 
     */
    async recordReferralSignup(referrer, referredUser, options = {}) {
        if (!referrer || !referredUser) {
            return { recorded: false, reason: 'missing_user_context' };
        }

        // Strict self-referral prevention
        if (
            String(referrer.id) === String(referredUser.id) ||
            (referrer.email && referredUser.email && String(referrer.email).toLowerCase() === String(referredUser.email).toLowerCase()) ||
            (referrer.phone && referredUser.phone && String(referrer.phone).replace(/\D/g, '') === String(referredUser.phone).replace(/\D/g, ''))
        ) {
            logger.warn(`[Referral] Self-referral attempt blocked for user ${referredUser.id}`);
            return { recorded: false, reason: 'self_referral_disallowed' };
        }

        const t = await sequelize.transaction();
        try {
            // Check if referee already has an assigned referrer (prevents duplicates and reassignment)
            const existingReferral = await Referral.findOne({
                where: { referredUserId: referredUser.id },
                transaction: t,
            });

            if (existingReferral) {
                await t.rollback();
                logger.info(`[Referral] User ${referredUser.id} already has a referral relationship (ID: ${existingReferral.id}). Reassignment blocked.`);
                return { recorded: false, reason: 'already_referred', referralId: existingReferral.id };
            }

            const referralRecord = await Referral.create({
                referrerId: referrer.id,
                referredUserId: referredUser.id,
                status: 'pending',
                registered_at: new Date(),
                total_commissions_earned: 0,
                total_transactions: 0,
                referrer_signup_bonus_amount: 0,
                referrer_signup_bonus_awarded_at: null,
                referee_signup_bonus_amount: 0,
                referee_signup_bonus_awarded_at: null,
                qualifying_deposit_amount: null,
                qualifying_deposit_at: null,
                qualifying_transaction_id: null,
            }, { transaction: t });

            if (options.referralClickToken) {
                await ReferralClick.update(
                    {
                        referrerId: referrer.id,
                        referredUserId: referredUser.id,
                        converted_at: sequelize.literal('CURRENT_TIMESTAMP'),
                    },
                    {
                        where: {
                            referral_code: referrer.referral_code,
                            click_token: String(options.referralClickToken),
                        },
                        transaction: t,
                    }
                );
            }

            await t.commit();
            logger.info(`[Referral] Referral relationship registered: Referrer ${referrer.id} -> Referee ${referredUser.id} (Status: pending qualifying deposit)`);
            return { recorded: true, referralId: referralRecord.id, status: 'pending' };
        } catch (error) {
            await t.rollback();
            if (/column.*(status|qualifying_deposit).*does not exist/i.test(error.message) && !options._retried) {
                logger.warn('[Referral] Detected missing columns in referrals table during signup, attempting runtime auto-heal...');
                await this._ensureSchemaCompatibility();
                return await this.recordReferralSignup(referrer, referredUser, { ...options, _retried: true });
            }
            logger.error(`[Referral] Failed to record referral signup: ${error.message}`);
            throw error;
        }
    }

    /**
     * Backward-compatible alias for recordReferralSignup
     */
    async trackReferral(referrer, referredUser, options = {}) {
        return this.recordReferralSignup(referrer, referredUser, options);
    }

    /**
     * Verify and reward referral bonuses upon a qualifying deposit.
     * Called whenever a user's wallet is funded via webhook or manual deposit.
     * Ensures atomic idempotency: will only execute once per referral relationship.
     * @param {User} refereeUser
     * @param {number} depositAmount
     * @param {Object} transactionRecord
     * @param {Object} [externalTransaction]
     */
    async checkAndRewardQualifyingDeposit(refereeUser, depositAmount, transactionRecord = null, externalTransaction = null) {
        if (!refereeUser || !refereeUser.id) {
            return { rewarded: false, reason: 'missing_user' };
        }

        const amountNum = parseFloat(depositAmount || 0);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            return { rewarded: false, reason: 'invalid_deposit_amount' };
        }

        const work = async (t) => {
            // Find pending referral for this user where bonuses have not been awarded yet
            const referralRecord = await Referral.findOne({
                where: {
                    referredUserId: refereeUser.id,
                    referrer_signup_bonus_awarded_at: null,
                },
                transaction: t,
                lock: true,
            });

            if (!referralRecord) {
                return { rewarded: false, reason: 'no_pending_qualifying_referral' };
            }

            // Minimum qualifying threshold (default: ₦100)
            const minQualifyingDeposit = parseRewardAmount(
                await SystemSetting.get('referral_qualifying_deposit_min', 100),
                100
            );

            if (amountNum < minQualifyingDeposit) {
                logger.info(`[Referral] Referee ${refereeUser.id} funded ₦${amountNum}, below qualifying minimum ₦${minQualifyingDeposit}. Bonus deferred.`);
                return { rewarded: false, reason: 'below_qualifying_threshold', minQualifyingDeposit, depositAmount: amountNum };
            }

            const referrerUser = await User.findByPk(referralRecord.referrerId, { transaction: t });
            if (!referrerUser) {
                logger.error(`[Referral] Referrer ${referralRecord.referrerId} not found for referral ${referralRecord.id}`);
                return { rewarded: false, reason: 'referrer_not_found' };
            }

            const referrerWallet = await Wallet.findOne({
                where: { userId: referrerUser.id },
                transaction: t,
                lock: true,
            });

            if (!referrerWallet) {
                logger.error(`[Referral] Referrer wallet not found for user ${referrerUser.id}`);
                return { rewarded: false, reason: 'referrer_wallet_not_found' };
            }

            const refereeWallet = await Wallet.findOne({
                where: { userId: refereeUser.id },
                transaction: t,
                lock: true,
            });

            const referrerBonusAmount = parseRewardAmount(
                await SystemSetting.get('referrer_signup_bonus_amount', 100),
                100
            );
            const refereeBonusAmount = parseRewardAmount(
                await SystemSetting.get('referee_signup_bonus_amount', 50),
                50
            );

            const now = new Date();
            const txId = transactionRecord?.id || transactionRecord?.reference || `DEP-${Date.now()}`;

            // 1. Credit Referrer Bonus Balance
            let referrerBalanceBefore = parseFloat(referrerWallet.bonus_balance || 0);
            let referrerBalanceAfter = referrerBalanceBefore;

            if (referrerBonusAmount > 0) {
                referrerBalanceAfter = referrerBalanceBefore + referrerBonusAmount;
                await referrerWallet.update({ bonus_balance: referrerBalanceAfter }, { transaction: t });

                await Transaction.create({
                    id: crypto.randomUUID(),
                    userId: referrerUser.id,
                    walletId: referrerWallet.id,
                    type: 'credit',
                    amount: referrerBonusAmount,
                    balance_before: referrerBalanceBefore,
                    balance_after: referrerBalanceAfter,
                    source: 'bonus',
                    status: 'completed',
                    reference: `REF-BONUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                    description: `Referral bonus for referring ${refereeUser.name || 'Friend'} (Qualifying Deposit ₦${amountNum.toLocaleString()})`,
                    metadata: {
                        referredUserId: refereeUser.id,
                        referredUserName: refereeUser.name,
                        referralId: referralRecord.id,
                        qualifyingDepositAmount: amountNum,
                        kind: 'referrer_qualifying_bonus',
                    },
                    completed_at: now,
                }, { transaction: t });
            }

            // 2. Credit Referee Welcome Bonus Balance
            let refereeBalanceBefore = refereeWallet ? parseFloat(refereeWallet.bonus_balance || 0) : 0;
            let refereeBalanceAfter = refereeBalanceBefore;

            if (refereeWallet && refereeBonusAmount > 0) {
                refereeBalanceAfter = refereeBalanceBefore + refereeBonusAmount;
                await refereeWallet.update({ bonus_balance: refereeBalanceAfter }, { transaction: t });

                await Transaction.create({
                    id: crypto.randomUUID(),
                    userId: refereeUser.id,
                    walletId: refereeWallet.id,
                    type: 'credit',
                    amount: refereeBonusAmount,
                    balance_before: refereeBalanceBefore,
                    balance_after: refereeBalanceAfter,
                    source: 'bonus',
                    status: 'completed',
                    reference: `REF-WELCOME-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                    description: `Welcome bonus for making your first qualifying deposit!`,
                    metadata: {
                        referralId: referralRecord.id,
                        referrerId: referrerUser.id,
                        qualifyingDepositAmount: amountNum,
                        kind: 'referee_qualifying_bonus',
                    },
                    completed_at: now,
                }, { transaction: t });
            }

            // 3. Mark Referral as Rewarded
            await referralRecord.update({
                status: 'rewarded',
                qualifying_deposit_amount: amountNum,
                qualifying_deposit_at: now,
                qualifying_transaction_id: String(txId),
                referrer_signup_bonus_amount: referrerBonusAmount,
                referrer_signup_bonus_awarded_at: now,
                referee_signup_bonus_amount: refereeBonusAmount,
                referee_signup_bonus_awarded_at: now,
                total_commissions_earned: parseFloat(referralRecord.total_commissions_earned || 0) + referrerBonusAmount,
            }, { transaction: t });

            logger.info(`[Referral] Qualifying deposit rewarded! Referrer ${referrerUser.id} credited ₦${referrerBonusAmount}, Referee ${refereeUser.id} credited ₦${refereeBonusAmount}`);

            return {
                rewarded: true,
                referralId: referralRecord.id,
                referrerBonusAmount,
                refereeBonusAmount,
                depositAmount: amountNum,
            };
        };

        try {
            if (externalTransaction) {
                return await work(externalTransaction);
            }
            return await sequelize.transaction(work);
        } catch (error) {
            if (/column.*(status|qualifying_deposit).*does not exist/i.test(error.message)) {
                logger.warn('[Referral] Detected missing columns in referrals table during qualifying deposit check, attempting runtime auto-heal...');
                await this._ensureSchemaCompatibility();
                if (externalTransaction) {
                    return await work(externalTransaction);
                }
                return await sequelize.transaction(work);
            }
            throw error;
        }
    }

    /**
     * Automatically synchronize and heal referral relationships between `Users` and `referrals` table.
     * Ensures every user with `referred_by` has a corresponding row in `referrals` with the correct `referrerId`.
     * Also updates statuses if the referee has made qualifying deposits or transactions.
     */
    async syncReferralRecords(options = {}) {
        const { force = false } = options;
        const now = Date.now();
        if (!force && this._lastSyncTime && (now - this._lastSyncTime < 30000)) {
            return { synced: true, throttled: true };
        }
        this._lastSyncTime = now;

        try {
            await this._ensureSchemaCompatibility();

            // Find all users who were referred by someone
            const referredUsers = await User.findAll({
                where: {
                    referred_by: { [Op.ne]: null }
                },
                attributes: ['id', 'name', 'email', 'phone', 'referred_by', 'createdAt', 'account_status'],
                raw: true
            });

            if (!referredUsers || referredUsers.length === 0) {
                return { synced: true, count: 0 };
            }

            // Extract unique referral codes normalized (trimmed & uppercase)
            const refCodes = [...new Set(
                referredUsers
                    .map(u => String(u.referred_by || '').trim().toUpperCase())
                    .filter(c => c.length > 0)
            )];

            if (refCodes.length === 0) {
                return { synced: true, count: 0 };
            }

            // Fetch all users who own referral codes
            const referrers = await User.findAll({
                where: {
                    referral_code: { [Op.ne]: null }
                },
                attributes: ['id', 'name', 'email', 'phone', 'referral_code'],
                raw: true
            });

            const codeToReferrer = new Map();
            for (const r of referrers) {
                if (r.referral_code) {
                    codeToReferrer.set(r.referral_code.trim().toUpperCase(), r);
                }
            }

            // Fetch existing referral records for these referred users
            const refereeIds = referredUsers.map(u => u.id);
            const existingReferrals = await Referral.findAll({
                where: {
                    referredUserId: { [Op.in]: refereeIds }
                },
                attributes: ['id', 'referrerId', 'referredUserId', 'status', 'registered_at'],
                raw: true
            });

            const existingByReferee = new Map(existingReferrals.map(r => [String(r.referredUserId), r]));

            // Also check transactions of these referees to auto-qualify any that have completed transactions
            const completedTxns = await Transaction.findAll({
                where: {
                    userId: { [Op.in]: refereeIds },
                    status: 'completed',
                    source: { [Op.ne]: 'refund' }
                },
                attributes: ['userId', 'amount', 'source'],
                raw: true
            });

            const refereeTxSet = new Set(completedTxns.map(t => String(t.userId)));

            const toCreate = [];
            const toUpdate = [];

            for (const referee of referredUsers) {
                const code = String(referee.referred_by || '').trim().toUpperCase();
                const referrer = codeToReferrer.get(code);
                if (!referrer) continue;

                // Self-referral prevention
                if (String(referrer.id) === String(referee.id)) continue;

                const existing = existingByReferee.get(String(referee.id));
                const hasCompletedTxn = refereeTxSet.has(String(referee.id));

                if (!existing) {
                    toCreate.push({
                        referrerId: referrer.id,
                        referredUserId: referee.id,
                        registered_at: referee.createdAt || new Date(),
                        createdAt: referee.createdAt || new Date(),
                        status: hasCompletedTxn ? 'qualified' : 'pending',
                        total_commissions_earned: 0,
                        total_transactions: hasCompletedTxn ? 1 : 0,
                        referrer_signup_bonus_amount: 0,
                        referee_signup_bonus_amount: 0,
                        qualifying_deposit_amount: null
                    });
                } else {
                    const needsReferrerUpdate = !existing.referrerId || String(existing.referrerId) !== String(referrer.id);
                    const needsStatusUpdate = existing.status === 'pending' && hasCompletedTxn;

                    if (needsReferrerUpdate || needsStatusUpdate) {
                        toUpdate.push({
                            id: existing.id,
                            referrerId: referrer.id,
                            status: needsStatusUpdate ? 'qualified' : existing.status
                        });
                    }
                }
            }

            if (toCreate.length > 0) {
                await Referral.bulkCreate(toCreate, { ignoreDuplicates: true });
                logger.info(`[Referral Sync] Auto-created ${toCreate.length} missing referral records from actual user database`);
            }

            for (const u of toUpdate) {
                const updateFields = { referrerId: u.referrerId };
                if (u.status) updateFields.status = u.status;
                await Referral.update(updateFields, { where: { id: u.id } });
            }

            return {
                synced: true,
                createdCount: toCreate.length,
                updatedCount: toUpdate.length
            };
        } catch (err) {
            logger.warn(`[Referral Sync] Failed during referral synchronization: ${err.message}`);
            return { synced: false, error: err.message };
        }
    }
}

module.exports = new ReferralService();
