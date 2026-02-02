const { Commission, Referral, SystemSetting, User } = require('../models');
const walletService = require('./walletService');
const { sequelize } = require('../config/db');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'affiliate-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

class AffiliateService {
  /**
   * Process affiliate commission for a transaction
   * @param {User} user - The user who performed the transaction
   * @param {Transaction} transaction - The transaction object
   * @param {object} t - Sequelize transaction (optional)
   */
  async processTransactionCommission(user, transaction, t = null) {
    const work = async (transactionScope) => {
      try {
        // 1. Check if user has a referrer
        const referral = await Referral.findOne({
          where: { referred_user_id: user.id },
          transaction: transactionScope
        });

        if (!referral) {
          return; // No referrer, no commission
        }

        const referrer = await User.findByPk(referral.referrer_id, { transaction: transactionScope });
        if (!referrer) {
          return;
        }

        // 2. Determine Commission Rate/Amount
        // This could be based on transaction type, user level, or system settings.
        // For simplicity, we'll fetch a global setting 'default_commission_percent' or default to 1%
        let commissionRate = 0;
        
        // Example: Fetch from SystemSetting
        const setting = await SystemSetting.findOne({ 
          where: { key: 'affiliate_commission_percent' },
          transaction: transactionScope 
        });

        if (setting) {
          commissionRate = parseFloat(setting.value);
        } else {
          commissionRate = 1.0; // Default 1%
        }

        if (commissionRate <= 0) return;

        const commissionAmount = (parseFloat(transaction.amount) * commissionRate) / 100;

        if (commissionAmount <= 0) return;

        // 3. Credit Referrer's Commission Balance
        // We use creditCommission method from WalletService
        await walletService.creditCommission(
          referrer,
          commissionAmount,
          `Commission for transaction ${transaction.reference}`,
          transactionScope
        );

        // 4. Record Commission
        await Commission.create({
          referrer_id: referrer.id,
          referred_user_id: user.id,
          transaction_id: transaction.id,
          amount: commissionAmount,
          status: 'paid', // Since we credited wallet immediately
          type: 'transaction_commission'
        }, { transaction: transactionScope });

        logger.info(`Commission of ${commissionAmount} paid to ${referrer.email} for txn ${transaction.reference}`);

      } catch (error) {
        logger.error(`Failed to process commission: ${error.message}`);
        // We don't throw here to avoid failing the main transaction, unless strict commission is required
      }
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Process commission for wallet funding
   * @param {User} user - The user who funded their wallet
   * @param {Transaction} walletTransaction - The wallet funding transaction
   * @param {object} t - Sequelize transaction (optional)
   */
  async processFundingCommission(user, walletTransaction, t = null) {
    const work = async (transactionScope) => {
      try {
        // 1. Check if user has a referrer
        const referral = await Referral.findOne({
          where: { referredUserId: user.id },
          transaction: transactionScope
        });

        if (!referral) return;

        // 2. Get Referrer
        const referrer = await User.findByPk(referral.referrerId, { transaction: transactionScope });
        if (!referrer) return;

        // 3. Get Commission Rate (Funding specific)
        const setting = await SystemSetting.findOne({ 
          where: { key: 'funding_commission_rate' },
          transaction: transactionScope 
        });
        
        const commissionRate = setting ? parseFloat(setting.value) : 2.5; // Default 2.5%

        if (commissionRate <= 0) return;

        const commissionAmount = (parseFloat(walletTransaction.amount) * commissionRate) / 100;

        if (commissionAmount <= 0) return;

        // 4. Create Commission Record (Pending)
        const commission = await Commission.create({
          referrerId: referrer.id,
          referredUserId: user.id,
          commissionableId: walletTransaction.id,
          commissionableType: 'WalletTransaction',
          amount: commissionAmount,
          source_amount: parseFloat(walletTransaction.amount),
          commission_rate: commissionRate,
          status: 'pending',
          type: 'funding'
        }, { transaction: transactionScope });

        // 5. Credit Referrer
        await walletService.creditCommission(
          referrer, 
          commissionAmount, 
          `Funding commission from ${user.name || user.email}`, 
          transactionScope
        );

        // 6. Update referral stats
        await this.updateReferralStats(referrer, user, commissionAmount, false, transactionScope);

        // 7. Mark commission as paid
        await commission.markAsPaid();

        logger.info(`Funding commission of ${commissionAmount} paid to ${referrer.email} for txn ${walletTransaction.reference}`);

      } catch (error) {
        logger.error(`Failed to process funding commission: ${error.message}`);
      }
    };

    if (t) return work(t);
    return sequelize.transaction(work);
  }

  /**
   * Get referral stats for a user
   * @param {User} user
   */
  async getStats(user) {
    const totalReferrals = await Referral.count({ where: { referrerId: user.id } });
    const totalEarnings = await Referral.sum('total_commissions_earned', { where: { referrerId: user.id } });
    const totalTransactions = await Referral.sum('total_transactions', { where: { referrerId: user.id } });
    const pendingCommissions = await Commission.sum('amount', { 
      where: { 
        referrerId: user.id,
        status: 'pending'
      } 
    });
    
    return {
      totalReferrals,
      totalEarnings: totalEarnings || 0,
      totalTransactions: totalTransactions || 0,
      pendingCommissions: pendingCommissions || 0
    };
  }
}

module.exports = new AffiliateService();
