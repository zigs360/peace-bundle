const { User, Wallet, Transaction, Referral, ReferralClick, SystemSetting } = require('../models');
const { sequelize } = require('../config/db'); // Fix import to use associations
const crypto = require('crypto');
const walletService = require('./walletService');

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
        return await User.findOne({ 
            where: { referral_code: code },
            attributes: ['id', 'name', 'referral_code']
        });
    }

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
     * Process referral rewards (Credit ₦100 bonus to referrer)
     * @param {User} referrer 
     * @param {User} referredUser 
     */
    async trackReferral(referrer, referredUser, options = {}) {
        const t = await sequelize.transaction();
        try {
            // #region debug-point C:track-referral-entry
            (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'referralService.js:trackReferral',msg:'[DEBUG] trackReferral started',data:{referrerId:referrer?.id||null,referrerCode:referrer?.referral_code||null,referredUserId:referredUser?.id||null},ts:Date.now()})}).catch(()=>{})})();
            // #endregion
            
            const referrerWallet = await Wallet.findOne({ 
                where: { userId: referrer.id },
                transaction: t
            });

            if (!referrerWallet) {
                throw new Error(`Wallet not found for referrer ${referrer.id}`);
            }

            const referrerBonusAmount = parseRewardAmount(
                await SystemSetting.get('referrer_signup_bonus_amount', 100),
                100,
            );
            const refereeBonusAmount = parseRewardAmount(
                await SystemSetting.get('referee_signup_bonus_amount', 50),
                50,
            );

            const [referralRecord, created] = await Referral.findOrCreate({
                where: {
                    referrerId: referrer.id,
                    referredUserId: referredUser.id,
                },
                defaults: {
                    referrerId: referrer.id,
                    referredUserId: referredUser.id,
                    registered_at: new Date(),
                    total_commissions_earned: 0,
                    total_transactions: 0,
                },
                transaction: t,
            });

            let balanceBefore = parseFloat(referrerWallet.bonus_balance || 0);
            let balanceAfter = balanceBefore;

            if (!referralRecord.referrer_signup_bonus_awarded_at && referrerBonusAmount > 0) {
                balanceAfter = balanceBefore + referrerBonusAmount;

                await referrerWallet.update({
                    bonus_balance: balanceAfter
                }, { transaction: t });

                await Transaction.create({
                    userId: referrer.id,
                    type: 'credit',
                    amount: referrerBonusAmount,
                    balance_before: balanceBefore,
                    balance_after: balanceAfter,
                    source: 'bonus',
                    status: 'completed',
                    reference: `REF-BONUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                    description: `Referral bonus for referring ${referredUser.name}`,
                    metadata: {
                        referredUserId: referredUser.id,
                        referredUserName: referredUser.name,
                        referralId: referralRecord.id,
                        kind: 'referrer_signup_bonus',
                    }
                }, { transaction: t });

                await referralRecord.update({
                    total_commissions_earned: parseFloat(referralRecord.total_commissions_earned || 0) + referrerBonusAmount,
                    referrer_signup_bonus_amount: referrerBonusAmount,
                    referrer_signup_bonus_awarded_at: new Date(),
                }, { transaction: t });
            }

            if (!referralRecord.referee_signup_bonus_awarded_at && refereeBonusAmount > 0) {
                await walletService.adminAdjust(
                    referredUser,
                    refereeBonusAmount,
                    'bonus',
                    'Welcome bonus for joining via a referral link',
                    {
                        reference: `REF-WELCOME-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                        referralId: referralRecord.id,
                        referrerId: referrer.id,
                        referralCode: referrer.referral_code,
                        kind: 'referee_signup_bonus',
                    },
                    t,
                );

                await referralRecord.update({
                    referee_signup_bonus_amount: refereeBonusAmount,
                    referee_signup_bonus_awarded_at: new Date(),
                }, { transaction: t });
            }

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

            // #region debug-point C:track-referral-success
            (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'C',location:'referralService.js:trackReferral',msg:'[DEBUG] trackReferral settled referrer and referee rewards',data:{referrerId:referrer?.id||null,referredUserId:referredUser?.id||null,referralId:referralRecord?.id||null,referrerBonusAmount,refereeBonusAmount,referralClickToken:options?.referralClickToken||null,balanceBefore,balanceAfter},ts:Date.now()})}).catch(()=>{})})();
            // #endregion

            await t.commit();
        } catch (error) {
            await t.rollback();
            // #region debug-point C:track-referral-error
            (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'referralService.js:trackReferral',msg:'[DEBUG] trackReferral failed',data:{referrerId:referrer?.id||null,referredUserId:referredUser?.id||null,message:error?.message||null,stack:String(error?.stack||'').slice(0,1200)},ts:Date.now()})}).catch(()=>{})})();
            // #endregion
            throw error;
        }
    }
}

module.exports = new ReferralService();
