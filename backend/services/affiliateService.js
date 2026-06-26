const { Commission, Referral, SystemSetting, User } = require('../models');
const walletService = require('./walletService');
const { sequelize } = require('../config/db'); // Fix import to use associations
const logger = require('../utils/logger');

class AffiliateService {
  async updateReferralStats(referrer, user, amount, incrementTransactions = true, transactionScope = null) {
    const referral = await Referral.findOne({
      where: { referrerId: referrer.id, referredUserId: user.id },
      transaction: transactionScope,
    });
    if (!referral) return null;

    const nextTotal = parseFloat(referral.total_commissions_earned || 0) + parseFloat(amount || 0);
    const nextTransactions = Number(referral.total_transactions || 0) + (incrementTransactions ? 1 : 0);
    await referral.update({
      total_commissions_earned: nextTotal,
      total_transactions: nextTransactions,
    }, { transaction: transactionScope });
    return referral;
  }

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
          where: { referredUserId: user.id },
          transaction: transactionScope
        });

        if (!referral) {
          return; // No referrer, no commission
        }

        const referrer = await User.findByPk(referral.referrerId, { transaction: transactionScope });
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
          referrerId: referrer.id,
          referredUserId: user.id,
          commissionableId: transaction.id,
          commissionableType: 'Transaction',
          amount: commissionAmount,
          source_amount: parseFloat(transaction.amount),
          commission_rate: commissionRate,
          status: 'paid', // Since we credited wallet immediately
          type: 'transaction',
          paid_at: new Date(),
        }, { transaction: transactionScope });

        await this.updateReferralStats(referrer, user, commissionAmount, true, transactionScope);

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
        // #region debug-point D:funding-commission-entry
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'affiliateService.js:processFundingCommission',msg:'[DEBUG] Funding commission processing started',data:{userId:user?.id||null,transactionReference:walletTransaction?.reference||null,amount:walletTransaction?.amount||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        // 1. Check if user has a referrer
        const referral = await Referral.findOne({
          where: { referredUserId: user.id },
          transaction: transactionScope
        });

        if (!referral) {
          // #region debug-point D:no-referral-record
          (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'affiliateService.js:processFundingCommission',msg:'[DEBUG] No Referral row found for referred user',data:{userId:user?.id||null,transactionReference:walletTransaction?.reference||null},ts:Date.now()})}).catch(()=>{})})();
          // #endregion
          return;
        }

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
        await this.updateReferralStats(referrer, user, commissionAmount, true, transactionScope);

        // 7. Mark commission as paid
        await commission.update({
          status: 'paid',
          paid_at: new Date(),
        }, { transaction: transactionScope });

        // #region debug-point D:funding-commission-paid
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'affiliateService.js:processFundingCommission',msg:'[DEBUG] Funding commission paid',data:{userId:user?.id||null,referrerId:referrer?.id||null,transactionReference:walletTransaction?.reference||null,commissionId:commission?.id||null,commissionAmount,commissionRate},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        logger.info(`Funding commission of ${commissionAmount} paid to ${referrer.email} for txn ${walletTransaction.reference}`);

      } catch (error) {
        // #region debug-point D:funding-commission-error
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='referral-workflow';for(const p of ['.dbg/referral-workflow.env','../.dbg/referral-workflow.env','../../.dbg/referral-workflow.env']){try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;break}catch{}}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'affiliateService.js:processFundingCommission',msg:'[DEBUG] Funding commission processing failed',data:{userId:user?.id||null,transactionReference:walletTransaction?.reference||null,message:error?.message||null,stack:String(error?.stack||'').slice(0,1200)},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
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
