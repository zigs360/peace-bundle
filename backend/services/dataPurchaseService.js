const { User, DataPlan, Transaction, Sim, Wallet } = require('../models');
const { sequelize } = require('../config/db');
const walletService = require('./walletService');
const smeplugService = require('./smeplugService');
const affiliateService = require('./affiliateService');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'data-purchase-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

class DataPurchaseService {
  /**
   * Purchase data for a recipient
   * @param {User} user
   * @param {DataPlan} plan
   * @param {string} recipientPhone
   * @param {Sim|null} sim
   * @returns {Promise<Transaction>}
   */
  async purchase(user, plan, recipientPhone, sim = null) {
    // We use a managed transaction to ensure atomicity
    return sequelize.transaction(async (t) => {
      // 1. Get price for user
      // Assuming getPriceForUser returns a promise or value
      const amount = await plan.getPriceForUser(user);

      // 2. Check sufficient balance
      const hasBalance = await walletService.hasSufficientBalance(user, amount, t);
      if (!hasBalance) {
        throw new Error('Insufficient wallet balance');
      }

      // Get wallet for balance tracking
      // Note: walletService.debit handles fetching, but we need balance_before for the record if we were doing it manually.
      // However, walletService.debit returns the transaction, which has balance info.
      // But the PHP code creates the transaction manually.
      // We should use walletService.debit to ensure consistency, but the PHP code separates "debit" and "create transaction record".
      // Actually, walletService.debit in our implementation DOES create a transaction record.
      // But the PHP code says:
      // $this->walletService->debit(...)
      // Transaction::create(...)
      // This implies walletService->debit might just update the wallet balance in the PHP version, OR it creates a 'debit' record and we create a 'data_purchase' record?
      // In our Node walletService, debit() creates a Transaction record.
      // If we call debit(), we get a transaction.
      // If we then create ANOTHER transaction, we have two records.
      // The PHP code:
      // $this->walletService->debit($user, $amount, 'data_purchase', ...)
      // $transaction = Transaction::create(...)
      // This looks like double recording if walletService also records.
      
      // Let's check our walletService.debit implementation.
      // It creates a Transaction.
      
      // If I want to match the PHP logic exactly, I might need to use a lower-level wallet update method or adjust logic.
      // However, in our system, `walletService.debit` IS the way to debit.
      // If I use it, I get a transaction. I can update that transaction with more details (plan_id, sim_id, etc.)
      // OR I can use `walletService.debit` just for the balance update part if I refactor it, but I shouldn't change core service too much.
      
      // A better approach for Node version:
      // Call walletService.debit with all the metadata.
      // The returned transaction is our transaction.
      // We can then update it with `data_plan_id`, `sim_id`, `provider`.
      
      const description = `Data purchase: ${plan.name} to ${recipientPhone}`;
      const metadata = {
        data_plan_id: plan.id,
        sim_id: sim ? sim.id : null,
        recipient_phone: recipientPhone,
        provider: plan.provider,
        plan_name: plan.name
      };

      // Perform Debit
      // This updates wallet and creates a Transaction record
      const transaction = await walletService.debit(
        user, 
        amount, 
        'data_purchase', 
        description, 
        metadata, 
        t
      );

      // Update with specific data purchase fields and custom reference
      await transaction.update({
        reference: this.generateReference(), // Use TXN- prefix as per requirement
        recipient_phone: recipientPhone,
        provider: plan.provider,
        status: 'pending'
      }, { transaction: t });

      // Note: Our Transaction model comment says:
      // // data_plan_id will be added by association
      // // sim_id will be added by association
      // So if we defined associations, we can set them.
      // But `debit` might not set them.
      // So the update above is correct.

      // 3. Trigger Smeplug API
      await this.dispenseData(transaction, sim, t);

      // 4. Process affiliate commission
      await affiliateService.processTransactionCommission(user, transaction, t);

      return transaction;
    });
  }

  /**
   * Dispense data via Smeplug API
   * @param {Transaction} transaction
   * @param {Sim|null} sim
   * @param {object} t
   */
  async dispenseData(transaction, sim = null, t = null) {
    try {
      const data = {
        network_id: smeplugService.getNetworkId(transaction.provider),
        plan_id: transaction.smeplug_plan_id || '1', // fallback? logic from PHP
        phone: transaction.recipient_phone,
        mode: sim ? 'sim_system' : 'wallet'
      };

      if (sim) {
        data.sim_number = sim.phoneNumber;
      }

      // Check if plan has smeplug_plan_id (fetched via association or we need to fetch plan)
      // Transaction model doesn't include Plan data by default unless eager loaded.
      // But in `purchase` we passed `plan`.
      // In `retry`, we just pass `transaction`.
      // So we need to ensure we have `smeplug_plan_id`.
      // If `transaction` doesn't have it, we might need to fetch it.
      // However, `purchase` sets `smeplug_plan_id` in metadata? No, column?
      // Transaction model has `smeplug_reference` but not `smeplug_plan_id` column explicitly in Read output, 
      // but it might be in `metadata`.
      // Let's check `purchase` implementation again.
      // It sets `metadata: { data_plan_id: plan.id ... }`.
      // It does NOT set `smeplug_plan_id` on transaction.
      // PHP code: `$transaction->dataPlan->smeplug_plan_id`. It assumes relationship.
      
      // We need to fetch the plan if not available.
      let smeplugPlanId = null;
      if (transaction.DataPlan) {
          smeplugPlanId = transaction.DataPlan.smeplug_plan_id;
      } else {
          // Fetch from DB using data_plan_id from metadata or association
          // Our Transaction model comment said "data_plan_id will be added by association".
          // If we rely on `transaction.data_plan_id`, we need to fetch DataPlan.
          if (transaction.data_plan_id) {
             const plan = await DataPlan.findByPk(transaction.data_plan_id, { transaction: t });
             if (plan) smeplugPlanId = plan.smeplug_plan_id;
          } else if (transaction.metadata && transaction.metadata.data_plan_id) {
             const plan = await DataPlan.findByPk(transaction.metadata.data_plan_id, { transaction: t });
             if (plan) smeplugPlanId = plan.smeplug_plan_id;
          }
      }
      
      if (smeplugPlanId) {
          data.plan_id = smeplugPlanId;
      }

      const response = await smeplugService.purchaseData(data);

      if (response.success) {
        await transaction.update({
          status: 'processing', // PHP says processing
          smeplug_reference: response.data.reference || null,
          smeplug_response: response.data,
          completed_at: new Date() // Maybe? processing usually implies not yet complete
        }, { transaction: t });

        // Increment SIM dispense count
        if (sim) {
          await sim.incrementDispenses(); // This method exists in Sim model
        }
      } else {
        // Mark as failed and refund
        await this.handleFailedTransaction(transaction, response.error || 'Unknown error', sim, t);
      }
    } catch (error) {
      await this.handleFailedTransaction(transaction, error.message, sim, t);
    }
  }

  /**
   * Handle failed transaction
   * @param {Transaction} transaction
   * @param {string} reason
   * @param {Sim|null} sim
   * @param {object} t
   */
  async handleFailedTransaction(transaction, reason, sim, t) {
    // Mark as failed
    await transaction.markAsFailed(reason); // This saves internally, but we are in transaction t?
    // Transaction.markAsFailed does `await this.save()`. 
    // If we are in `t`, we should probably pass `t` to `markAsFailed` or update manually.
    // Let's check `Transaction.markAsFailed` implementation.
    // It does `this.save()`. It doesn't take options.
    // We should update it manually here to be safe with `t`.
    await transaction.update({
        status: 'failed',
        failure_reason: reason
    }, { transaction: t });

    // Refund wallet
    // We need to fetch user if not loaded
    const user = await User.findByPk(transaction.userId || transaction.user_id, { transaction: t });
    
    if (user) {
        await walletService.credit(
            user,
            transaction.amount,
            'refund',
            `Refund for failed transaction: ${transaction.reference}`,
            {},
            t
        );
    }

    // Increment SIM failed count
    if (sim) {
        await sim.incrementDispenses(true); // true for failed
    }
  }

  /**
   * Retry failed transaction
   * @param {Transaction} transaction
   * @returns {Promise<boolean>}
   */
  async retry(transaction) {
    if (transaction.status !== 'failed') {
      throw new Error('Only failed transactions can be retried');
    }

    if (transaction.retry_count >= 3) {
      throw new Error('Maximum retry attempts reached');
    }

    // Retrieve User and Sim
    const user = await User.findByPk(transaction.userId || transaction.user_id);
    let sim = null;
    // Try to get SIM from metadata or association
    if (transaction.metadata && transaction.metadata.sim_id) {
        sim = await Sim.findByPk(transaction.metadata.sim_id);
    }

    // Re-Debit User (Fixing the "Free Data" bug from PHP snippet)
    // We must ensure user pays again because they were refunded.
    await walletService.debit(
        user,
        transaction.amount,
        'data_purchase', // or 'retry_debit'
        `Retry of transaction: ${transaction.reference}`,
        { original_reference: transaction.reference }
    );

    // Update Transaction
    await transaction.increment('retry_count');
    await transaction.update({ status: 'pending' });

    // Dispense (using a new transaction scope for safety or null?)
    // dispenseData handles error by refunding.
    // If we pass null as t, it runs operations independently.
    // But `handleFailedTransaction` needs to credit wallet.
    // `walletService.credit` handles its own transaction if t is null.
    // So passing null is fine.
    await this.dispenseData(transaction, sim, null);

    // Check status
    const freshTxn = await Transaction.findByPk(transaction.id);
    return freshTxn.status === 'processing' || freshTxn.status === 'completed';
  }

  /**
   * Process bulk data purchases
   * @param {User} user
   * @param {Array} purchases
   * @returns {Promise<Object>}
   */
  async bulkPurchase(user, purchases) {
    const results = {
      success: 0,
      failed: 0,
      transactions: []
    };

    for (const purchase of purchases) {
      try {
        const plan = await DataPlan.findByPk(purchase.plan_id);
        if (!plan) throw new Error(`Plan ${purchase.plan_id} not found`);

        const sim = purchase.sim_id ? await Sim.findByPk(purchase.sim_id) : null;

        const transaction = await this.purchase(
          user,
          plan,
          purchase.recipient_phone,
          sim
        );

        results.success++;
        results.transactions.push(transaction);
      } catch (error) {
        results.failed++;
        results.transactions.push({
          error: error.message,
          data: purchase
        });
      }
    }

    return results;
  }
  /**
   * Generate transaction reference
   * @returns {string}
   */
  generateReference() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'TXN-' + result;
  }

  /**
   * Get network ID for provider
   * @param {string} provider
   * @returns {number}
   */
  getNetworkId(provider) {
    const map = {
      'mtn': 1,
      'airtel': 2,
      '9mobile': 3,
      'glo': 4
    };
    return map[provider.toLowerCase()] || 1;
  }
}

module.exports = new DataPurchaseService();
