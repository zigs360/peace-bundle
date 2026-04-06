const { User, DataPlan, Transaction, Sim, Wallet } = require('../models');
const sequelize = require('../config/database');
const walletService = require('./walletService');
const smeplugService = require('./smeplugService');
const ogdamsService = require('./ogdamsService');
const simManagementService = require('./simManagementService');
const affiliateService = require('./affiliateService');
const logger = require('../utils/logger');

class DataPurchaseService {
  getAirtimeProviderConfig() {
    const ogdamsTimeoutMsRaw = Number.parseInt(process.env.OGDAMS_TIMEOUT_MS || '12000', 10);
    const smeplugTimeoutMsRaw = Number.parseInt(process.env.SMEPLUG_TIMEOUT_MS || '15000', 10);
    const ogdamsTimeoutMs =
      Number.isFinite(ogdamsTimeoutMsRaw) && ogdamsTimeoutMsRaw > 0 ? ogdamsTimeoutMsRaw : 12000;
    const smeplugTimeoutMs =
      Number.isFinite(smeplugTimeoutMsRaw) && smeplugTimeoutMsRaw > 0 ? smeplugTimeoutMsRaw : 15000;

    return { ogdamsTimeoutMs, smeplugTimeoutMs };
  }

  getAirtimeReconcileConfig() {
    const delayMsRaw = Number.parseInt(process.env.AIRTIME_RECONCILE_DELAY_MS || '5000', 10);
    const maxAttemptsRaw = Number.parseInt(process.env.AIRTIME_RECONCILE_MAX_ATTEMPTS || '3', 10);
    const statusCheckEnabledRaw = String(process.env.OGDAMS_STATUS_CHECK_ENABLED || 'true').toLowerCase();

    const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw >= 0 ? delayMsRaw : 5000;
    const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0 ? maxAttemptsRaw : 3;
    const statusCheckEnabled = statusCheckEnabledRaw !== 'false';

    return { delayMs, maxAttempts, statusCheckEnabled };
  }

  isUncertainProviderStateError(error) {
    const code = String(error?.code || '').toUpperCase();
    const statusCode = Number(error?.statusCode);
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || code === 'ENOTFOUND') {
      return true;
    }
    if (Number.isFinite(statusCode) && statusCode >= 500) return true;
    return false;
  }

  parseOgdamsStatus(raw) {
    if (!raw) return null;
    const direct = String(raw?.status || raw?.data?.status || raw?.result?.status || '').toLowerCase();
    if (direct.includes('success') || direct === 'completed') return { status: 'success', raw };
    if (direct.includes('fail') || direct.includes('error') || direct === 'failed') return { status: 'failed', raw };
    if (direct.includes('pending') || direct.includes('process') || direct.includes('queue')) return { status: 'pending', raw };
    return { status: 'unknown', raw };
  }

  scheduleAirtimeReconciliation(transactionId, attempt = 1) {
    const { delayMs, maxAttempts } = this.getAirtimeReconcileConfig();
    if (attempt > maxAttempts) return;
    if (String(process.env.AIRTIME_RECONCILE_WORKER_ENABLED || 'false').toLowerCase() === 'true') return;
    const delay = attempt <= 1 ? delayMs : Math.min(delayMs * attempt, 60000);
    setTimeout(() => {
      this.reconcileAirtimeTransaction(transactionId, attempt).catch((e) => {
        logger.error('[Airtime] Reconcile failed', { transactionId, error: e.message });
      });
    }, delay);
  }

  async reconcileAirtimeTransaction(transactionId, attempt = 1) {
    const { maxAttempts, statusCheckEnabled } = this.getAirtimeReconcileConfig();
    const txn = await Transaction.findByPk(transactionId);
    if (!txn) return;
    if (txn.status === 'completed' || txn.status === 'failed' || txn.status === 'refunded') return;

    const meta = txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {};
    const nextAttempt = attempt + 1;

    if (statusCheckEnabled) {
      try {
        const statusRaw = await ogdamsService.checkAirtimeStatus(txn.reference);
        const parsed = this.parseOgdamsStatus(statusRaw);
        if (parsed?.status === 'success') {
          await txn.update({
            status: 'completed',
            completed_at: new Date(),
            smeplug_response: { provider: 'ogdams', data: parsed.raw },
            metadata: { ...meta, service_provider: 'ogdams', provider_attempts: meta.provider_attempts || [] }
          });

          try {
            const user = await User.findByPk(txn.userId);
            if (user) {
              const { sendTransactionNotification } = require('./notificationService');
              await sendTransactionNotification(user, txn);
            }
          } catch (e) {
            void e;
          }
          return;
        }
        if (parsed?.status === 'failed') {
          await this.dispenseAirtimeWithFallback(
            txn,
            { network: txn.provider || meta.provider, amount: meta.vend_amount || txn.amount, phoneNumber: txn.recipient_phone || meta.recipient_phone },
            { reconciliation: true, attempt },
            null,
            { skipOgdams: true },
          );

          try {
            const user = await User.findByPk(txn.userId);
            if (user) {
              const { sendTransactionNotification } = require('./notificationService');
              await sendTransactionNotification(user, txn);
            }
          } catch (e) {
            void e;
          }
          return;
        }
      } catch (e) {
        logger.warn('[Airtime] Reconcile status check failed', { transactionId, error: e.message });
      }
    }

    if (attempt >= maxAttempts) {
      await this.handleFailedAirtimeTransaction(txn, 'Airtime verification timed out', null);
      return;
    }

    await txn.update({
      status: 'queued',
      metadata: { ...meta, reconcile_attempt: nextAttempt, reconcile_scheduled: true }
    });
    this.scheduleAirtimeReconciliation(transactionId, nextAttempt);
  }

  async withTimeout(promise, timeoutMs, label) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      const err = new Error(`${label} timeout after ${timeoutMs}ms`);
      err.code = 'ETIMEDOUT';
      timeoutId = setTimeout(() => reject(err), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
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
        plan_name: plan.name,
        smeplug_plan_id: plan.smeplug_plan_id
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
        status: 'pending',
        dataPlanId: plan.id,
        simId: sim ? sim.id : null
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
      // Ensure we have the plan_id
      let smeplugPlanId = transaction.metadata?.smeplug_plan_id;
      
      if (!smeplugPlanId) {
          // Fallback: Fetch plan if missing from metadata
          const planId = transaction.dataPlanId || transaction.metadata?.data_plan_id;
          if (planId) {
              const plan = await DataPlan.findByPk(planId, { transaction: t });
              if (plan) smeplugPlanId = plan.smeplug_plan_id;
          }
      }

      const mode = sim ? 'device_based' : 'wallet';
      const options = sim ? { sim_number: sim.phoneNumber } : {};

      const response = await smeplugService.purchaseData(
        transaction.provider,
        transaction.recipient_phone,
        smeplugPlanId || '1',
        mode,
        options
      );

      if (response.success) {
        await transaction.markAsCompleted(response.data, t);

        // Increment SIM dispense count
        if (sim) {
          await sim.incrementDispenses();
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
    await transaction.markAsFailed(reason, t);
    
    // Refund user (if it was a debit)
    if (transaction.type === 'debit') {
        const user = await User.findByPk(transaction.userId || transaction.user_id, { transaction: t });
        if (user) {
            await walletService.credit(
                user,
                transaction.amount,
                'refund',
                `Refund for failed data purchase: ${transaction.reference}`,
                { original_transaction_reference: transaction.reference },
                t
            );
        }
    }

    // Increment SIM failed count
    if (sim) {
        await sim.incrementDispenses(true); // true for failed
    }
  }

  async handleFailedAirtimeTransaction(transaction, reason, t) {
    await transaction.markAsFailed(reason, t);

    if (transaction.type === 'debit') {
      const user = await User.findByPk(transaction.userId || transaction.user_id, { transaction: t });
      if (user) {
        await walletService.credit(
          user,
          transaction.amount,
          'refund',
          `Refund for failed airtime purchase: ${transaction.reference}`,
          { original_transaction_reference: transaction.reference },
          t,
        );
      }
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

  async purchaseAirtime(user, network, amount, phoneNumber) {
    return sequelize.transaction(async (t) => {
      const hasBalance = await walletService.hasSufficientBalance(user, amount, t);
      if (!hasBalance) {
        throw new Error('Insufficient wallet balance');
      }

      const description = `Airtime purchase: ${network} ${amount} to ${phoneNumber}`;
      const reference = this.generateReference();
      const metadata = {
        recipient_phone: phoneNumber,
        provider: network,
        amount,
        type: 'airtime',
        reference,
      };

      const transaction = await walletService.debit(
        user,
        amount,
        'airtime_purchase',
        description,
        metadata,
        t
      );

      await transaction.update({ reference, status: 'processing' }, { transaction: t });

      try {
        await this.dispenseAirtimeWithFallback(
          transaction,
          { network, amount, phoneNumber },
          { attemptedFrom: 'dataPurchaseService.purchaseAirtime' },
          t,
        );
      } catch (error) {
        await this.handleFailedAirtimeTransaction(transaction, error.message, t);
      }

      return transaction;
    });
  }

  async dispenseAirtimeWithFallback(transaction, { network, amount, phoneNumber }, context = {}, t = null) {
    let options = {};
    if (arguments.length >= 5 && typeof arguments[4] === 'object' && arguments[4] !== null) {
      options = arguments[4];
    }
    const { ogdamsTimeoutMs, smeplugTimeoutMs } = this.getAirtimeProviderConfig();
    const startedAt = Date.now();
    const attempts = [];

    const normalizePhone = (value) => {
      const digits = String(value || '').replace(/\D/g, '');
      if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`;
      return digits;
    };

    const cleanNetwork = String(network || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phoneNumber);
    const vendAmount = Math.round(Number(amount));

    const baseMeta = transaction.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};

    const recordAttempt = async (entry) => {
      attempts.push(entry);
      await transaction.update(
        {
          metadata: {
            ...baseMeta,
            provider_attempts: attempts,
            service_provider: entry.ok ? entry.provider : baseMeta.service_provider,
            provider_switch: entry.switch || baseMeta.provider_switch,
          },
        },
        { transaction: t },
      );
    };

    const persistSuccess = async ({ provider, reference, response, switchedFrom = null }) => {
      const latencyMs = Date.now() - startedAt;
      await transaction.update(
        {
          recipient_phone: cleanPhone,
          provider: cleanNetwork,
          smeplug_reference: reference || transaction.smeplug_reference || transaction.reference,
          smeplug_response: { provider, data: response },
          status: 'completed',
          completed_at: new Date(),
          metadata: {
            ...baseMeta,
            service_provider: provider,
            provider_latency_ms: latencyMs,
            provider_switch:
              switchedFrom
                ? { from: switchedFrom, to: provider, reason: 'primary_failed', context }
                : baseMeta.provider_switch || null,
            provider_attempts: attempts,
          },
        },
        { transaction: t },
      );
    };

    const persistFailure = async (reason) => {
      await this.handleFailedAirtimeTransaction(transaction, reason, t);
      await transaction.update(
        {
          metadata: {
            ...baseMeta,
            provider_attempts: attempts,
          },
        },
        { transaction: t },
      );
    };

    if (!options.skipOgdams) {
      try {
      const ogdamsResponse = await this.withTimeout(
        ogdamsService.purchaseAirtime({
          networkId: this.getNetworkId(cleanNetwork),
          amount: vendAmount,
          phoneNumber: cleanPhone,
          type: 'VTU',
          reference: transaction.reference,
        }),
        ogdamsTimeoutMs,
        'OGDAMS',
      );

      const ok = String(ogdamsResponse?.status || '').toLowerCase() === 'success';
      await recordAttempt({
        provider: 'ogdams',
        ok,
        latency_ms: Date.now() - startedAt,
        status: ogdamsResponse?.status,
      });

      if (!ok) {
        throw new Error(ogdamsResponse?.message || 'Ogdams returned non-success response');
      }

      await persistSuccess({
        provider: 'ogdams',
        reference: ogdamsResponse?.reference || ogdamsResponse?.data?.reference || transaction.reference,
        response: ogdamsResponse,
      });
      logger.info('[Airtime] Provider success', { provider: 'ogdams', reference: transaction.reference });
      return { provider: 'ogdams', response: ogdamsResponse };
      } catch (ogErr) {
        const ogReason = ogErr?.message || 'Ogdams failed';
        const uncertain = this.isUncertainProviderStateError(ogErr);

        await recordAttempt({
          provider: 'ogdams',
          ok: false,
          latency_ms: Date.now() - startedAt,
          error: ogReason,
          uncertain,
        });

        const { statusCheckEnabled } = this.getAirtimeReconcileConfig();
        if (uncertain && statusCheckEnabled) {
          try {
            const statusRaw = await this.withTimeout(
              ogdamsService.checkAirtimeStatus(transaction.reference),
              ogdamsTimeoutMs,
              'OGDAMS_STATUS',
            );
            const parsed = this.parseOgdamsStatus(statusRaw);
            if (parsed?.status === 'success') {
              await persistSuccess({
                provider: 'ogdams',
                reference: statusRaw?.reference || statusRaw?.data?.reference || transaction.reference,
                response: parsed.raw,
              });
              logger.info('[Airtime] Provider success after verify', { provider: 'ogdams', reference: transaction.reference });
              return { provider: 'ogdams', response: parsed.raw, verified: true };
            }
            if (parsed?.status === 'failed') {
              logger.warn('[Airtime] Switching provider after verified failure', {
                from: 'ogdams',
                to: 'smeplug',
                reference: transaction.reference,
                reason: ogReason,
              });
              await recordAttempt({
                provider: 'ogdams',
                ok: false,
                latency_ms: Date.now() - startedAt,
                error: ogReason,
                switch: { from: 'ogdams', to: 'smeplug', reason: 'verified_failed', context },
              });
            } else {
              await transaction.update(
                {
                  status: 'queued',
                  metadata: {
                    ...baseMeta,
                    provider_attempts: attempts,
                    service_provider: 'ogdams',
                    provider_pending: true,
                    reconcile_scheduled: true,
                    reconcile_attempt: 1,
                  },
                },
                { transaction: t },
              );
              this.scheduleAirtimeReconciliation(transaction.id, 1);
              logger.warn('[Airtime] Queued due to uncertain Ogdams state', { reference: transaction.reference });
              return { provider: 'ogdams', pending: true };
            }
          } catch (statusErr) {
            await transaction.update(
              {
                status: 'queued',
                metadata: {
                  ...baseMeta,
                  provider_attempts: attempts,
                  service_provider: 'ogdams',
                  provider_pending: true,
                  reconcile_scheduled: true,
                  reconcile_attempt: 1,
                },
              },
              { transaction: t },
            );
            this.scheduleAirtimeReconciliation(transaction.id, 1);
            logger.warn('[Airtime] Queued due to uncertain Ogdams state', {
              reference: transaction.reference,
              reason: statusErr.message,
            });
            return { provider: 'ogdams', pending: true };
          }
        }

        if (uncertain) {
          await transaction.update(
            {
              status: 'queued',
              metadata: {
                ...baseMeta,
                provider_attempts: attempts,
                service_provider: 'ogdams',
                provider_pending: true,
                reconcile_scheduled: true,
                reconcile_attempt: 1,
              },
            },
            { transaction: t },
          );
          this.scheduleAirtimeReconciliation(transaction.id, 1);
          logger.warn('[Airtime] Queued due to uncertain Ogdams state', { reference: transaction.reference, reason: ogReason });
          return { provider: 'ogdams', pending: true };
        }

        logger.warn('[Airtime] Switching provider', {
          from: 'ogdams',
          to: 'smeplug',
          reference: transaction.reference,
          reason: ogReason,
        });
        await recordAttempt({
          provider: 'ogdams',
          ok: false,
          latency_ms: Date.now() - startedAt,
          error: ogReason,
          switch: { from: 'ogdams', to: 'smeplug', reason: ogReason, context },
        });
      }
    }

    const smeplugStart = Date.now();
    try {
      let processedViaSim = false;
      let simReference = null;
      let simResponse = null;

      const optimalSim = await simManagementService.getOptimalSim(cleanNetwork, vendAmount);
      if (optimalSim) {
        try {
          const simResult = await this.withTimeout(
            simManagementService.processTransaction(optimalSim, { provider: cleanNetwork, amount: vendAmount }, cleanPhone),
            smeplugTimeoutMs,
            'SMEPLUG_SIM',
          );
          if (simResult?.success) {
            processedViaSim = true;
            simReference = simResult.reference;
            simResponse = simResult;
            await transaction.update({ simId: optimalSim.id }, { transaction: t });
          }
        } catch (simErr) {
          logger.error('[Airtime] SMEPlug SIM route failed', {
            reference: transaction.reference,
            error: simErr.message,
          });
        }
      }

      if (processedViaSim) {
        await recordAttempt({
          provider: 'smeplug',
          ok: true,
          latency_ms: Date.now() - smeplugStart,
          route: 'sim',
        });
        await persistSuccess({
          provider: 'smeplug',
          reference: simReference,
          response: simResponse,
          switchedFrom: 'ogdams',
        });
        return { provider: 'smeplug', response: simResponse };
      }

      const smeplugResponse = await this.withTimeout(
        smeplugService.purchaseVTU(cleanNetwork, cleanPhone, vendAmount),
        smeplugTimeoutMs,
        'SMEPLUG',
      );

      const ok = !!smeplugResponse?.success;
      await recordAttempt({
        provider: 'smeplug',
        ok,
        latency_ms: Date.now() - smeplugStart,
        route: 'api',
        status_code: smeplugResponse?.status_code,
      });

      if (!ok) {
        throw new Error(smeplugResponse?.error || 'Smeplug returned non-success response');
      }

      await persistSuccess({
        provider: 'smeplug',
        reference: smeplugResponse.data?.reference || smeplugResponse.data?.transaction_id,
        response: smeplugResponse.data,
        switchedFrom: 'ogdams',
      });

      return { provider: 'smeplug', response: smeplugResponse.data };
    } catch (spErr) {
      const spReason = spErr?.message || 'Smeplug failed';
      await recordAttempt({
        provider: 'smeplug',
        ok: false,
        latency_ms: Date.now() - smeplugStart,
        error: spReason,
      });
      await persistFailure(spReason);
      throw spErr;
    }
  }
}

module.exports = new DataPurchaseService();
