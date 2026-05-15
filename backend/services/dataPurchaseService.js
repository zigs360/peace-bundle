const { User, DataPlan, Transaction, Sim, Wallet } = require('../models');
const sequelize = require('../config/database');
const walletService = require('./walletService');
const smeplugService = require('./smeplugService');
const ogdamsService = require('./ogdamsService');
const simManagementService = require('./simManagementService');
const affiliateService = require('./affiliateService');
const transactionIntegrityService = require('./transactionIntegrityService');
const logger = require('../utils/logger');
const crypto = require('crypto');

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
    if (code === 'OGDAMS_DUPLICATE_REFERENCE') return true;
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
        const statusReference = String(meta.provider_reference || txn.reference || '').trim();
        const statusRaw = await ogdamsService.checkAirtimeStatus(statusReference);
        const parsed = this.parseOgdamsStatus(statusRaw);
        if (parsed?.status === 'success') {
          await txn.update({
            status: 'completed',
            completed_at: new Date(),
            smeplug_response: { provider: 'ogdams', data: parsed.raw },
            metadata: { ...meta, service_provider: 'ogdams', provider_attempts: meta.provider_attempts || [], provider_reference: statusReference }
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
          await this.handleFailedAirtimeTransaction(txn, 'Airtime delivery failed during reconciliation', null);
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
      const amount = await plan.getPriceForUser(user, { transaction: t });

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

      const fingerprint = transactionIntegrityService.buildFingerprint({
        userId: user.id,
        source: 'data_purchase',
        recipientPhone,
        amount,
        network: plan.provider,
        planId: plan.id,
      });

      await transactionIntegrityService.annotateDebitTransaction(
        transaction,
        {
          recipient_phone: recipientPhone,
          provider: plan.provider,
          data_plan_id: plan.id,
          transaction_fingerprint: fingerprint,
          client_reference: transaction.reference,
        },
        t,
      );

      // Update with specific data purchase fields and custom reference
      await transaction.update({
        reference: this.generateReference(), // Use TXN- prefix as per requirement
        recipient_phone: recipientPhone,
        provider: plan.provider,
        status: 'pending',
        completed_at: null,
        dataPlanId: plan.id,
        simId: sim ? sim.id : null
      }, { transaction: t });

      const lockedRoute = transactionIntegrityService.selectDataRoute({
        plan,
        preferredSim: sim,
      });
      await transactionIntegrityService.lockRoute(transaction, lockedRoute, t);

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
      let plan = null;
      
      if (!smeplugPlanId) {
          // Fallback: Fetch plan if missing from metadata
          const planId = transaction.dataPlanId || transaction.metadata?.data_plan_id;
          if (planId) {
              plan = await DataPlan.findByPk(planId, { transaction: t });
              if (plan) smeplugPlanId = plan.smeplug_plan_id;
          }
      }

      if (!plan) {
        const planId = transaction.dataPlanId || transaction.metadata?.data_plan_id;
        if (planId) plan = await DataPlan.findByPk(planId, { transaction: t });
      }

      const simPoolEnabledRaw = process.env.SIM_POOL_ENABLED;
      const simPoolEnabled =
        String(simPoolEnabledRaw || (process.env.NODE_ENV === 'test' ? 'false' : 'true')).toLowerCase() === 'true';
      const allowWalletFallback =
        String(process.env.SIM_POOL_ALLOW_WALLET_FALLBACK || 'false').toLowerCase() === 'true';
      const route = transaction.fulfillment_route
        ? {
            fulfillmentRoute: transaction.fulfillment_route,
            paymentChannel: transaction.payment_channel,
            provider: transaction.provider,
            simId: transaction.simId || transaction.metadata?.integrity?.routeLock?.simId || null,
          }
        : transactionIntegrityService.selectDataRoute({
            plan,
            preferredSim: sim,
          });

      if (!transaction.fulfillment_route) {
        await transactionIntegrityService.lockRoute(transaction, route, t);
      }

      if (route.simId && !sim) {
        sim = await Sim.findByPk(route.simId, { transaction: t });
      }

      if (route.fulfillmentRoute === 'sim_pool' || route.fulfillmentRoute === 'ogdams_sim') {
        if (!simPoolEnabled && !sim) {
          await transactionIntegrityService.failAndRefund(transaction, 'SIM pool route selected but SIM pool is disabled', t, {
            flagAsAnomaly: true,
          });
          return;
        }

        if (!sim && plan) {
          try {
            sim = await simManagementService.getOptimalSimForData(plan);
          } catch (e) {
            void e;
          }
        }

        if (!sim) {
          await transactionIntegrityService.failAndRefund(transaction, 'No SIM available for this data purchase', t, {
            flagAsAnomaly: true,
          });
          return;
        }

        const poolResult = await simManagementService.processTransactionWithReservation(
          sim,
          plan,
          transaction.recipient_phone,
          transaction.reference,
          t
        );

        if (poolResult.success) {
          transaction.simId = sim.id;
          transaction.metadata = {
            ...(transaction.metadata || {}),
            service_provider: poolResult.platform,
            sim_pool: true,
            sim_id: sim.id,
          };
          await transactionIntegrityService.markProviderSuccess(
            transaction,
            {
              provider: poolResult.platform,
              providerReference: poolResult.reference,
              response: { provider: poolResult.platform, data: poolResult.details || null },
            },
            t,
          );
          return;
        }

        await transactionIntegrityService.failAndRefund(
          transaction,
          poolResult.error || 'SIM route failed',
          t,
          { flagAsAnomaly: true },
        );
        return;
      }

      if (route.fulfillmentRoute === 'ogdams_api') {
        const response = await ogdamsService.purchaseData({
          networkId: this.getNetworkId(transaction.provider),
          planCode: String(plan?.ogdams_sku || smeplugPlanId || ''),
          phoneNumber: transaction.recipient_phone,
          reference: transaction.reference,
        });

        const ok = String(response?.status || '').toLowerCase() === 'success';
        if (!ok) {
          await transactionIntegrityService.failAndRefund(transaction, response?.message || 'Ogdams data purchase failed', t, {
            flagAsAnomaly: true,
          });
          return;
        }

        await transactionIntegrityService.markProviderSuccess(
          transaction,
          {
            provider: 'ogdams',
            providerReference: response?.reference || response?.data?.reference || transaction.reference,
            response: { provider: 'ogdams', data: response },
          },
          t,
        );
        return;
      }

      if (route.fulfillmentRoute === 'smeplug_api') {
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
          await transactionIntegrityService.markProviderSuccess(
            transaction,
            {
              provider: 'smeplug',
              providerReference: response.data?.reference || response.data?.transaction_id || transaction.reference,
              response: { provider: 'smeplug', data: response.data },
            },
            t,
          );
          if (sim) {
            await sim.incrementDispenses(false, t ? { transaction: t } : {});
          }
          return;
        }

        await transactionIntegrityService.failAndRefund(transaction, response.error || 'Unknown error', t, {
          flagAsAnomaly: true,
        });
        return;
      }

      if (simPoolEnabled && !allowWalletFallback && route.fulfillmentRoute !== 'smeplug_api') {
        await transactionIntegrityService.failAndRefund(transaction, 'No valid locked route available for this data purchase', t, {
          flagAsAnomaly: true,
        });
        return;
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
    await transactionIntegrityService.failAndRefund(transaction, reason, t, {
      flagAsAnomaly: true,
      auditEvent: 'data_delivery_failed',
    });

    // Increment SIM failed count
    if (sim) {
        await sim.incrementDispenses(true, t ? { transaction: t } : {});
    }
  }

  async handleFailedAirtimeTransaction(transaction, reason, t) {
    await transactionIntegrityService.failAndRefund(transaction, reason, t, {
      flagAsAnomaly: true,
      auditEvent: 'airtime_delivery_failed',
    });
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
    await transaction.update({ status: 'pending', completed_at: null });

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
  generateReference(prefix = 'TXN', options = {}) {
    return walletService.generateReference(prefix, options);
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
      'glo': 3,
      '9mobile': 4
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

      const fingerprint = transactionIntegrityService.buildFingerprint({
        userId: user.id,
        source: 'airtime_purchase',
        recipientPhone: phoneNumber,
        amount,
        network,
        faceValue: amount,
      });

      await transaction.update({
        reference,
        status: 'processing',
        completed_at: null,
        recipient_phone: phoneNumber,
        provider: network,
        metadata: {
          ...(transaction.metadata || {}),
          client_reference: reference,
          transaction_fingerprint: fingerprint,
        },
      }, { transaction: t });
      await transactionIntegrityService.annotateDebitTransaction(
        transaction,
        {
          recipient_phone: phoneNumber,
          provider: network,
          client_reference: reference,
          transaction_fingerprint: fingerprint,
        },
        t,
      );

      const preferredSim = await simManagementService.getOptimalSim(network, amount);
      const route = transactionIntegrityService.selectAirtimeRoute({ network, preferredSim });
      await transactionIntegrityService.lockRoute(transaction, route, t);

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
    const ogdamsPhone =
      cleanPhone && cleanPhone.startsWith('0') && cleanPhone.length === 11 ? `234${cleanPhone.slice(1)}` : cleanPhone;
    const vendAmount = Math.round(Number(amount));
    const lockedRoute = transaction.fulfillment_route
      ? {
          fulfillmentRoute: transaction.fulfillment_route,
          paymentChannel: transaction.payment_channel,
          provider: transaction.provider || cleanNetwork,
          simId: transaction.simId || transaction.metadata?.integrity?.routeLock?.simId || null,
        }
      : transactionIntegrityService.selectAirtimeRoute({
          network: cleanNetwork,
          preferredSim: await simManagementService.getOptimalSim(cleanNetwork, vendAmount),
        });

    const baseMeta = transaction.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};
    if (!transaction.fulfillment_route) {
      await transactionIntegrityService.lockRoute(transaction, lockedRoute, t);
    }

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
      transaction.recipient_phone = cleanPhone;
      transaction.provider = cleanNetwork;
      transaction.metadata = {
        ...baseMeta,
        service_provider: provider,
        provider_latency_ms: latencyMs,
        provider_switch:
          switchedFrom
            ? { from: switchedFrom, to: provider, reason: 'primary_failed', context }
            : baseMeta.provider_switch || null,
        provider_attempts: attempts,
      };
      await transactionIntegrityService.markProviderSuccess(
        transaction,
        {
          provider,
          providerReference: reference || transaction.smeplug_reference || transaction.reference,
          response: { provider, data: response },
        },
        t,
      );
    };

    const persistFailure = async (reason) => {
      transaction.metadata = {
        ...baseMeta,
        provider_attempts: attempts,
      };
      await transactionIntegrityService.failAndRefund(transaction, reason, t, {
        flagAsAnomaly: true,
        auditEvent: 'airtime_delivery_failed',
      });
    };

    if (lockedRoute.fulfillmentRoute === 'ogdams_api' && !options.skipOgdams) {
      const maskPhone = (value) => {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) return null;
        const last3 = digits.slice(-3);
        return `********${last3}`;
      };
      const backoffMs = (attempt) => {
        const base = 150;
        const jitter = Math.floor(Math.random() * 120);
        return base * (2 ** Math.max(0, attempt - 1)) + jitter;
      };
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const networkId = this.getNetworkId(cleanNetwork);
      const createOgdamsRequestReference = () => {
        const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        const n = crypto.randomBytes(4).readUInt32BE(0) % 1000000;
        const rand6 = String(n).padStart(6, '0');
        return `OGD|${networkId}|${rand6}|${ts}`;
      };
      const buildOgdamsPayload = (requestReference) => ({
        networkId,
        amount: vendAmount,
        phoneNumber: ogdamsPhone,
        type: 'VTU',
        reference: requestReference,
      });
      const attemptOgdamsVend = async (attempt, requestReference) => {
        logger.info('[Airtime] Ogdams vend request', {
          transactionReference: transaction.reference,
          requestReference,
          attempt,
          phone: maskPhone(ogdamsPhone),
          network: cleanNetwork,
          amount: vendAmount,
        });

        try {
          const response = await this.withTimeout(
            ogdamsService.purchaseAirtime(buildOgdamsPayload(requestReference)),
            ogdamsTimeoutMs,
            'OGDAMS',
          );

          const httpStatus = Number(response?.httpStatus);
          const statusText = String(response?.status || '').toLowerCase();
          const isAccepted = httpStatus === 201 || httpStatus === 202;
          const isPendingStatus =
            statusText.includes('queue') ||
            statusText.includes('process') ||
            statusText.includes('pending') ||
            statusText === 'queued' ||
            statusText === 'processing' ||
            statusText === 'accepted';
          const ok = statusText === 'success';

          logger.info('[Airtime] Ogdams vend response', {
            transactionReference: transaction.reference,
            requestReference,
            attempt,
            httpStatus: Number.isFinite(httpStatus) ? httpStatus : null,
            status: response?.status,
          });

          await recordAttempt({
            provider: 'ogdams',
            ok,
            attempt,
            request_reference: requestReference,
            latency_ms: Date.now() - startedAt,
            status: response?.status,
            http_status: Number.isFinite(httpStatus) ? httpStatus : undefined,
          });

          return { response, ok, isAccepted, isPendingStatus, httpStatus, requestReference };
        } catch (error) {
          const status = Number(error?.statusCode || error?.response?.status || 0) || null;
          const code = String(error?.code || '').toUpperCase() || null;
          const message = error?.message || 'Ogdams failed';
          const uncertainError = this.isUncertainProviderStateError(error);

          logger.error('[Airtime] Ogdams vend error', {
            transactionReference: transaction.reference,
            requestReference,
            attempt,
            status,
            code,
            message,
          });

          await recordAttempt({
            provider: 'ogdams',
            ok: false,
            attempt,
            request_reference: requestReference,
            latency_ms: Date.now() - startedAt,
            error: message,
            http_status: status || undefined,
            code: code || undefined,
            uncertain: uncertainError,
          });

          error.__ogdams_request_reference = requestReference;
          error.__ogdams_attempt = attempt;
          throw error;
        }
      };

      try {
      const requestReference = createOgdamsRequestReference();
      const vend = await attemptOgdamsVend(1, requestReference);

      if (!vend.ok && (vend.isAccepted || vend.isPendingStatus)) {
        await transaction.update(
          {
            status: 'queued',
            metadata: {
              ...baseMeta,
              provider_attempts: attempts,
              service_provider: 'ogdams',
              provider_reference: vend.requestReference,
              provider_pending: true,
              reconcile_scheduled: true,
              reconcile_attempt: 1,
            },
          },
          { transaction: t },
        );
        this.scheduleAirtimeReconciliation(transaction.id, 1);
        logger.warn('[Airtime] Queued due to Ogdams accepted/pending response', {
          reference: transaction.reference,
          requestReference: vend.requestReference,
          httpStatus: Number.isFinite(vend.httpStatus) ? vend.httpStatus : null,
          status: vend.response?.status,
        });
        return { provider: 'ogdams', pending: true, response: vend.response };
      }

      if (!vend.ok) {
        throw new Error(vend.response?.message || 'Ogdams returned non-success response');
      }

      await persistSuccess({
        provider: 'ogdams',
        reference: vend.response?.reference || vend.response?.data?.reference || vend.requestReference,
        response: vend.response,
      });
      logger.info('[Airtime] Provider success', { provider: 'ogdams', reference: transaction.reference });
      return { provider: 'ogdams', response: vend.response };
      } catch (ogErr) {
        const ogReason = ogErr?.message || 'Ogdams failed';
        const ogCode = String(ogErr?.code || '').toUpperCase();
        const uncertain = this.isUncertainProviderStateError(ogErr);

        const { statusCheckEnabled } = this.getAirtimeReconcileConfig();
        if (ogCode === 'OGDAMS_DUPLICATE_REFERENCE') {
          const delay = backoffMs(1);
          logger.warn('[Airtime] Ogdams duplicate reference; retrying with new reference', {
            transactionReference: transaction.reference,
            attempt: 1,
            delayMs: delay,
            previousRequestReference: ogErr.__ogdams_request_reference || null,
          });
          await sleep(delay);

          try {
            const retryReference = createOgdamsRequestReference();
            const vend = await attemptOgdamsVend(2, retryReference);
            if (!vend.ok && (vend.isAccepted || vend.isPendingStatus)) {
              await transaction.update(
                {
                  status: 'queued',
                  metadata: {
                    ...baseMeta,
                    provider_attempts: attempts,
                    service_provider: 'ogdams',
                    provider_reference: vend.requestReference,
                    provider_pending: true,
                    reconcile_scheduled: true,
                    reconcile_attempt: 1,
                  },
                },
                { transaction: t },
              );
              this.scheduleAirtimeReconciliation(transaction.id, 1);
              logger.warn('[Airtime] Queued due to Ogdams accepted/pending retry response', {
                reference: transaction.reference,
                requestReference: vend.requestReference,
                httpStatus: Number.isFinite(vend.httpStatus) ? vend.httpStatus : null,
                status: vend.response?.status,
              });
              return { provider: 'ogdams', pending: true, response: vend.response };
            }
            if (!vend.ok) {
              await persistFailure('Ogdams duplicate reference retry returned non-success');
              return { provider: 'ogdams', failed: true };
            }

            await persistSuccess({
              provider: 'ogdams',
              reference: vend.response?.reference || vend.response?.data?.reference || vend.requestReference,
              response: vend.response,
            });
            logger.info('[Airtime] Provider success after duplicate reference retry', { provider: 'ogdams', reference: transaction.reference });
            return { provider: 'ogdams', response: vend.response, retried: true };
          } catch (retryError) {
            await persistFailure('Ogdams duplicate reference retry failed');
            return { provider: 'ogdams', failed: true };
          }
        }

        if (uncertain && statusCheckEnabled) {
          try {
            const statusReference = String(
              (transaction.metadata && transaction.metadata.provider_reference) ||
                baseMeta.provider_reference ||
                transaction.reference ||
                '',
            ).trim();
            const statusRaw = await this.withTimeout(
              ogdamsService.checkAirtimeStatus(statusReference),
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
              await persistFailure(ogReason);
              return { provider: 'ogdams', failed: true };
            } else {
              await transaction.update(
                {
                  status: 'queued',
                  metadata: {
                    ...baseMeta,
                    provider_attempts: attempts,
                    service_provider: 'ogdams',
                    provider_reference: statusReference,
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
                  provider_reference: statusReference,
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
                provider_reference: ogErr.__ogdams_request_reference || baseMeta.provider_reference || null,
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

        await persistFailure(ogReason);
        return { provider: 'ogdams', failed: true };
      }
    }

    const smeplugStart = Date.now();
    try {
      if (lockedRoute.fulfillmentRoute !== 'smeplug_api' && lockedRoute.fulfillmentRoute !== 'sim_pool') {
        throw new Error('Unsupported locked airtime route');
      }
      let processedViaSim = false;
      let simReference = null;
      let simResponse = null;

      const optimalSim = lockedRoute.simId
        ? await Sim.findByPk(lockedRoute.simId, { transaction: t })
        : await simManagementService.getOptimalSim(cleanNetwork, vendAmount);
      if (optimalSim) {
        try {
          const simResult = await this.withTimeout(
            simManagementService.processTransaction(optimalSim, { provider: cleanNetwork, amount: vendAmount }, cleanPhone, t),
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
          switchedFrom: null,
        });
        return { provider: 'smeplug', response: simResponse };
      }

      if (lockedRoute.fulfillmentRoute === 'sim_pool') {
        throw new Error('No SIM available for locked airtime route');
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
        switchedFrom: null,
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
