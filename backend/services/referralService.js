const { User, Wallet, Transaction } = require('../models');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

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

    /**
     * Process referral rewards (Credit ₦100 bonus to referrer)
     * @param {User} referrer 
     * @param {User} referredUser 
     */
    async trackReferral(referrer, referredUser) {
        const t = await sequelize.transaction();
        try {
            console.log(`[Referral] User ${referredUser.id} was referred by ${referrer.id} (${referrer.referral_code})`);
            
            const referrerWallet = await Wallet.findOne({ 
                where: { userId: referrer.id },
                transaction: t
            });

            if (!referrerWallet) {
                throw new Error(`Wallet not found for referrer ${referrer.id}`);
            }

            const BONUS_AMOUNT = 100.00; // ₦100 referral bonus
            const balanceBefore = parseFloat(referrerWallet.bonus_balance || 0);
            const balanceAfter = balanceBefore + BONUS_AMOUNT;

            // 1. Update Referrer's Bonus Balance
            await referrerWallet.update({
                bonus_balance: balanceAfter
            }, { transaction: t });

            // 2. Create Transaction Log for Referrer
            await Transaction.create({
                userId: referrer.id,
                type: 'credit',
                amount: BONUS_AMOUNT,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                source: 'bonus',
                status: 'completed',
                reference: `REF-BONUS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                description: `Referral bonus for referring ${referredUser.name}`,
                metadata: {
                    referredUserId: referredUser.id,
                    referredUserName: referredUser.name
                }
            }, { transaction: t });

            await t.commit();
            console.log(`[Referral] Successfully credited ₦${BONUS_AMOUNT} bonus to ${referrer.name}`);
        } catch (error) {
            await t.rollback();
            console.error(`[Referral] Failed to track referral reward for ${referrer.id}:`, error.message);
            throw error;
        }
    }
}

module.exports = new ReferralService();
