const crypto = require('crypto');
const { Op } = require('sequelize');

const sequelize = require('../config/database');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const TransactionIntegrityAudit = require('../models/TransactionIntegrityAudit');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('./walletService');
const { getTransactionSchemaCompatibility } = require('./transactionSchemaCompatibilityService');
const logger = require('../utils/logger');

const PURCHASE_SOURCES = new Set(['airtime_purchase', 'data_purchase']);
const DUPLICATE_WINDOW_MS = Number.parseInt(process.env.TRANSACTION_DUPLICATE_WINDOW_MS || '120000', 10);
const STALE_PROCESSING_MS = Number.parseInt(process.env.TRANSACTION_STALE_PROCESSING_MS || '180000', 10);

const round2 = (value) => Number(Number(value || 0).toFixed(2));

class TransactionIntegrityService {
  buildRefundReference(reference) {
    const hash = crypto.createHash('sha256').update(String(reference || '')).digest('hex').slice(0, 24).toUpperCase();
    return `RFND-${hash}`;
  }

  buildFingerprint({ userId, source, recipientPhone, amount, network, planId, faceValue } = {}) {
    const payload = [
      String(userId || ''),
      String(source || ''),
      String(recipientPhone || ''),
      round2(amount),
      String(network || ''),
      String(planId || ''),
      round2(faceValue),
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  getMetadata(transaction) {
    return transaction?.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};
  }

  getStaleReferenceTime(transaction) {
    const metadata = this.getMetadata(transaction);
    const routeLockedAt = metadata?.integrity?.routeLock?.lockedAt || null;
    const integrityCreatedAt = metadata?.integrity?.createdAt || null;
    const candidates = [routeLockedAt, integrityCreatedAt, transaction?.updatedAt, transaction?.createdAt]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.getTime() - b.getTime());
    return candidates[0];
  }

  async logAudit(transaction, eventType, details = {}, { severity = 'info', status = 'open', resolvedAt = null, transaction: dbTransaction = null } = {}) {
    if (!transaction?.id) return null;
    try {
      return await TransactionIntegrityAudit.create(
        {
          transactionId: transaction.id,
          userId: transaction.userId || null,
          eventType,
          severity,
          status,
          details,
          resolvedAt,
        },
        { transaction: dbTransaction },
      );
    } catch (error) {
      logger.error('[TransactionIntegrity] Audit persistence failed', {
        transactionId: transaction.id,
        eventType,
        message: error.message,
      });
      return null;
    }
  }

  async lockRoute(transaction, route, dbTransaction = null) {
    const currentPaymentChannel = String(transaction.payment_channel || '').trim();
    const currentFulfillmentRoute = String(transaction.fulfillment_route || '').trim();
    if (
      (currentPaymentChannel && currentPaymentChannel !== route.paymentChannel) ||
      (currentFulfillmentRoute && currentFulfillmentRoute !== route.fulfillmentRoute)
    ) {
      throw new Error('Transaction route conflict detected');
    }

    const metadata = this.getMetadata(transaction);
    const routeFingerprint = crypto
      .createHash('sha256')
      .update(`${transaction.reference}|${route.paymentChannel}|${route.fulfillmentRoute}|${route.provider || ''}|${route.simId || ''}`)
      .digest('hex');

    transaction.payment_channel = route.paymentChannel;
    transaction.fulfillment_route = route.fulfillmentRoute;
    transaction.route_lock_key = routeFingerprint;
    transaction.delivery_status = transaction.delivery_status || 'pending';
    transaction.integrity_status = 'route_locked';
    transaction.metadata = {
      ...metadata,
      integrity: {
        ...(metadata.integrity || {}),
        routeLock: {
          paymentChannel: route.paymentChannel,
          fulfillmentRoute: route.fulfillmentRoute,
          provider: route.provider || null,
          simId: route.simId || null,
          lockedAt: new Date().toISOString(),
        },
      },
    };

    await transaction.save({ transaction: dbTransaction });
    await this.logAudit(
      transaction,
      'route_locked',
      {
        paymentChannel: route.paymentChannel,
        fulfillmentRoute: route.fulfillmentRoute,
        provider: route.provider || null,
        simId: route.simId || null,
      },
      { transaction: dbTransaction, status: 'resolved' },
    );

    return transaction;
  }

  async markProviderSuccess(transaction, payload = {}, dbTransaction = null) {
    const metadata = this.getMetadata(transaction);
    transaction.status = 'completed';
    transaction.completed_at = new Date();
    transaction.delivery_status = 'success';
    transaction.integrity_status = 'settled';
    transaction.anomaly_flag = false;
    transaction.smeplug_reference = payload.providerReference || transaction.smeplug_reference || transaction.reference;
    transaction.smeplug_response = payload.response || transaction.smeplug_response;
    transaction.metadata = {
      ...metadata,
      service_provider: payload.provider || metadata.service_provider || null,
      integrity: {
        ...(metadata.integrity || {}),
        providerResult: {
          provider: payload.provider || null,
          providerReference: payload.providerReference || null,
          successAt: new Date().toISOString(),
        },
      },
    };
    await transaction.save({ transaction: dbTransaction });
    await this.logAudit(
      transaction,
      'provider_success',
      {
        provider: payload.provider || null,
        providerReference: payload.providerReference || null,
      },
      { transaction: dbTransaction, status: 'resolved' },
    );
    return transaction;
  }

  async findDuplicateByReference(reference, dbTransaction = null) {
    if (!reference) return null;
    return Transaction.findOne({
      where: { reference: String(reference) },
      transaction: dbTransaction,
    });
  }

  async findLikelyDuplicate({ userId, source, fingerprint, clientReference, excludeTransactionId = null, dbTransaction = null }) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const where = {
      userId,
      source,
      createdAt: { [Op.gte]: since },
      status: { [Op.in]: ['processing', 'queued', 'completed', 'refunded', 'failed'] },
    };
    if (excludeTransactionId) where.id = { [Op.ne]: excludeTransactionId };

    const rows = await Transaction.findAll({
      where,
      order: [['createdAt', 'ASC']],
      transaction: dbTransaction,
    });

    return rows.find((row) => {
      const metadata = this.getMetadata(row);
      const rowClientReference = String(metadata.client_reference || metadata.reference || '').trim();
      const rowFingerprint = String(metadata.transaction_fingerprint || '').trim();
      if (clientReference && rowClientReference && rowClientReference === clientReference) return true;
      if (fingerprint && rowFingerprint && rowFingerprint === fingerprint) return true;
      return false;
    }) || null;
  }

  async annotateDebitTransaction(transaction, details = {}, dbTransaction = null) {
    const metadata = this.getMetadata(transaction);
    transaction.metadata = {
      ...metadata,
      ...details,
      transaction_fingerprint: details.transaction_fingerprint || metadata.transaction_fingerprint || null,
      integrity: {
        ...(metadata.integrity || {}),
        createdAt: metadata.integrity?.createdAt || new Date().toISOString(),
      },
    };
    if (!transaction.delivery_status) transaction.delivery_status = 'pending';
    if (!transaction.integrity_status) transaction.integrity_status = 'awaiting_route_lock';
    await transaction.save({ transaction: dbTransaction });
    return transaction;
  }

  async safeRefund(transaction, reason, dbTransaction = null, options = {}) {
    if (!transaction) return null;
    const original = transaction;
    const metadata = this.getMetadata(original);
    const existingReference = original.refund_reference || metadata?.integrity?.refund?.refundReference || null;

    if (existingReference) {
      const existing = await Transaction.findOne({ where: { reference: existingReference }, transaction: dbTransaction });
      if (existing) {
        if (original.status !== 'refunded') {
          original.status = 'refunded';
          original.integrity_status = 'auto_refunded';
          original.delivery_status = original.delivery_status || 'failed';
          await original.save({ transaction: dbTransaction });
        }
        return existing;
      }
    }

    const refundReference = this.buildRefundReference(original.reference);
    const priorRefund = await Transaction.findOne({ where: { reference: refundReference }, transaction: dbTransaction });
    if (priorRefund) {
      original.refund_reference = priorRefund.reference;
      original.status = 'refunded';
      original.integrity_status = 'auto_refunded';
      original.delivery_status = original.delivery_status || 'failed';
      original.metadata = {
        ...metadata,
        integrity: {
          ...(metadata.integrity || {}),
          refund: {
            refundReference: priorRefund.reference,
            reason,
            refundedAt: new Date().toISOString(),
            resolution: options.resolution || 'automatic',
          },
        },
      };
      await original.save({ transaction: dbTransaction });
      return priorRefund;
    }

    const user = await User.findByPk(original.userId, { transaction: dbTransaction });
    if (!user) {
      throw new Error('Refund failed because user could not be loaded');
    }

    const refundTxn = await walletService.credit(
      user,
      original.amount,
      'refund',
      `Refund for ${original.source}: ${original.reference}`,
      {
        reference: refundReference,
        original_transaction_id: original.id,
        original_transaction_reference: original.reference,
        refund_reason: reason,
        resolution: options.resolution || 'automatic',
      },
      dbTransaction,
    );

    original.refund_reference = refundTxn.reference;
    original.status = 'refunded';
    original.delivery_status = 'failed';
    original.integrity_status = 'auto_refunded';
    original.anomaly_flag = Boolean(options.flagAsAnomaly);
    original.metadata = {
      ...metadata,
      integrity: {
        ...(metadata.integrity || {}),
        refund: {
          refundReference: refundTxn.reference,
          reason,
          refundedAt: new Date().toISOString(),
          resolution: options.resolution || 'automatic',
        },
      },
    };
    await original.save({ transaction: dbTransaction });
    await this.logAudit(
      original,
      'auto_refund_completed',
      {
        refundReference: refundTxn.reference,
        reason,
        resolution: options.resolution || 'automatic',
      },
      { transaction: dbTransaction, severity: 'warning', status: 'resolved', resolvedAt: new Date() },
    );
    return refundTxn;
  }

  async failAndRefund(transaction, reason, dbTransaction = null, options = {}) {
    transaction.failure_reason = reason;
    transaction.status = 'failed';
    transaction.delivery_status = 'failed';
    transaction.integrity_status = 'refund_pending';
    transaction.anomaly_flag = Boolean(options.flagAsAnomaly);
    await transaction.save({ transaction: dbTransaction });
    await this.logAudit(
      transaction,
      options.auditEvent || 'delivery_failed',
      { reason, ...options.auditDetails },
      { transaction: dbTransaction, severity: options.severity || 'error' },
    );
    return this.safeRefund(transaction, reason, dbTransaction, options);
  }

  selectAirtimeRoute({ network, preferredSim = null }) {
    const strategy = String(process.env.AIRTIME_PRIMARY_ROUTE || 'ogdams').toLowerCase();
    if (preferredSim && strategy === 'sim') {
      return {
        paymentChannel: 'connected_sim',
        fulfillmentRoute: 'sim_pool',
        provider: String(network || '').toLowerCase(),
        simId: preferredSim.id,
      };
    }
    if (strategy === 'smeplug') {
      return {
        paymentChannel: 'smeplug_wallet',
        fulfillmentRoute: 'smeplug_api',
        provider: String(network || '').toLowerCase(),
      };
    }
    return {
      paymentChannel: 'ogdams_wallet',
      fulfillmentRoute: 'ogdams_api',
      provider: String(network || '').toLowerCase(),
    };
  }

  selectDataRoute({ plan, preferredSim = null }) {
    const provider = String(plan?.provider || '').toLowerCase();
    const simPoolEnabled = String(process.env.SIM_POOL_ENABLED || 'false').toLowerCase() === 'true';
    const allowWalletFallback = String(process.env.SIM_POOL_ALLOW_WALLET_FALLBACK || 'false').toLowerCase() === 'true';
    if (preferredSim && plan?.available_sim !== false) {
      return {
        paymentChannel: 'connected_sim',
        fulfillmentRoute: preferredSim.ogdamsLinked && plan?.ogdams_sku ? 'ogdams_sim' : 'sim_pool',
        provider,
        simId: preferredSim.id,
      };
    }
    if (simPoolEnabled && !allowWalletFallback && plan?.available_sim !== false) {
      return {
        paymentChannel: 'connected_sim',
        fulfillmentRoute: 'sim_pool',
        provider,
        simId: null,
      };
    }
    if (plan?.ogdams_sku) {
      return {
        paymentChannel: 'ogdams_wallet',
        fulfillmentRoute: 'ogdams_api',
        provider,
      };
    }
    return {
      paymentChannel: 'smeplug_wallet',
      fulfillmentRoute: 'smeplug_api',
      provider,
    };
  }

  async monitorAndRepair({ limit = 100 } = {}) {
    const compatibility = await getTransactionSchemaCompatibility();
    if (!compatibility.integrityColumnsAvailable) {
      logger.warn('[TransactionIntegrity] Skipping monitor pass because transaction integrity columns are missing', {
        missingIntegrityColumns: compatibility.missingIntegrityColumns,
      });
      return {
        duplicateRefunds: 0,
        failedRefundsRecovered: 0,
        staleTransactionsResolved: 0,
        scanned: 0,
        skipped: true,
        missingIntegrityColumns: compatibility.missingIntegrityColumns,
      };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const summary = {
      duplicateRefunds: 0,
      failedRefundsRecovered: 0,
      staleTransactionsResolved: 0,
      scanned: 0,
    };

    const candidates = await Transaction.findAll({
      where: {
        source: { [Op.in]: Array.from(PURCHASE_SOURCES) },
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'ASC']],
      limit,
    });

    const duplicateBuckets = new Map();
    for (const txn of candidates) {
      summary.scanned += 1;
      const metadata = this.getMetadata(txn);
      const key = String(metadata.client_reference || metadata.transaction_fingerprint || '').trim();
      if (key) {
        if (!duplicateBuckets.has(key)) duplicateBuckets.set(key, []);
        duplicateBuckets.get(key).push(txn);
      }
    }

    for (const txns of duplicateBuckets.values()) {
      const charged = txns.filter((txn) => ['completed', 'processing', 'queued', 'failed'].includes(String(txn.status)));
      if (charged.length <= 1) continue;
      charged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const keeper = charged[0];
      for (const duplicate of charged.slice(1)) {
        if (duplicate.refund_reference || String(duplicate.status) === 'refunded') continue;
        await sequelize.transaction(async (dbTransaction) => {
          const locked = await Transaction.findByPk(duplicate.id, { transaction: dbTransaction, lock: dbTransaction.LOCK.UPDATE });
          const freshKeeper = await Transaction.findByPk(keeper.id, { transaction: dbTransaction });
          if (!locked || !freshKeeper || locked.refund_reference || String(locked.status) === 'refunded') return;
          await this.failAndRefund(locked, 'Duplicate charge automatically reversed', dbTransaction, {
            flagAsAnomaly: true,
            severity: 'critical',
            auditEvent: 'duplicate_charge_detected',
            auditDetails: { keptReference: freshKeeper.reference },
            resolution: 'automatic_duplicate_reversal',
          });
          summary.duplicateRefunds += 1;
        });
      }
    }

    const failedWithoutRefund = candidates.filter(
      (txn) =>
        PURCHASE_SOURCES.has(String(txn.source || '').toLowerCase()) &&
        String(txn.status || '').toLowerCase() === 'failed' &&
        !txn.refund_reference,
    );

    for (const txn of failedWithoutRefund) {
      await sequelize.transaction(async (dbTransaction) => {
        const locked = await Transaction.findByPk(txn.id, { transaction: dbTransaction, lock: dbTransaction.LOCK.UPDATE });
        if (!locked || locked.refund_reference || String(locked.status) === 'refunded') return;
        await this.safeRefund(locked, locked.failure_reason || 'Automatic refund recovery for failed delivery', dbTransaction, {
          flagAsAnomaly: true,
          resolution: 'automatic_refund_recovery',
        });
        summary.failedRefundsRecovered += 1;
      });
    }

    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);
    const staleTransactions = candidates.filter(
      (txn) => {
        if (!['processing', 'queued', 'pending'].includes(String(txn.status || '').toLowerCase())) return false;
        const referenceTime = this.getStaleReferenceTime(txn);
        return referenceTime && referenceTime.getTime() <= staleThreshold.getTime();
      },
    );

    for (const txn of staleTransactions) {
      await sequelize.transaction(async (dbTransaction) => {
        const locked = await Transaction.findByPk(txn.id, { transaction: dbTransaction, lock: dbTransaction.LOCK.UPDATE });
        if (!locked || ['completed', 'refunded'].includes(String(locked.status || '').toLowerCase())) return;
        await this.failAndRefund(locked, 'Automatic rollback for stale undelivered transaction', dbTransaction, {
          flagAsAnomaly: true,
          severity: 'critical',
          auditEvent: 'stale_transaction_rolled_back',
          resolution: 'automatic_stale_rollback',
        });
        summary.staleTransactionsResolved += 1;
      });
    }

    await Promise.allSettled([
      SystemSetting.set('transaction_integrity_last_monitor_report', JSON.stringify(summary), 'json', 'billing'),
      SystemSetting.set('transaction_integrity_last_monitor_run_at', new Date().toISOString(), 'string', 'billing'),
    ]);

    logger.info('[TransactionIntegrity] Monitoring pass complete', summary);
    return summary;
  }
}

module.exports = new TransactionIntegrityService();
