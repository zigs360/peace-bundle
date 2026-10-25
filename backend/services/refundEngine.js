const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { User, Wallet, Transaction, DepositReconciliationAudit, SystemSetting } = require('../models');
const notificationRealtimeService = require('./notificationRealtimeService');

class RefundEngine {
  /**
   * Deterministically construct a unique refund reference from an original transaction reference
   */
  buildRefundReference(originalReference) {
    if (!originalReference) {
      return `RFND-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    }
    const hash = crypto.createHash('sha256').update(String(originalReference).trim()).digest('hex').slice(0, 24).toUpperCase();
    return `RFND-${hash}`;
  }

  /**
   * Validate if a refund has already been credited in the ledger
   */
  async findExistingRefundCredit(refundReference, originalReference, transaction = null) {
    if (!refundReference && !originalReference) return null;

    const conditions = [];
    if (refundReference) {
      conditions.push({ reference: refundReference });
    }

    // Check by metadata links to original transaction
    if (originalReference && sequelize.getDialect?.() === 'postgres') {
      conditions.push(
        sequelize.literal(`metadata->>'original_transaction_reference' = '${String(originalReference).replace(/'/g, "''")}'`)
      );
    }

    if (conditions.length === 0) return null;

    return Transaction.findOne({
      where: {
        type: 'credit',
        source: 'refund',
        status: 'completed',
        [Op.or]: conditions
      },
      transaction
    });
  }

  /**
   * Execute atomic, idempotent refund settlement with row-level locking
   * 
   * @param {Object} params
   * @param {string} [params.transactionId] - UUID of the original transaction
   * @param {string} [params.originalReference] - Reference of the original transaction
   * @param {string} [params.refundReference] - Explicit refund reference (e.g., RFND-...)
   * @param {string} [params.userId] - Explicit user UUID
   * @param {number} [params.amount] - Explicit refund amount
   * @param {string} [params.reason] - Human-readable reason for refund
   * @param {string} [params.operator] - Who initiated ('admin', 'system', 'incident_remediation')
   * @param {Object} [params.metadata] - Extra context metadata
   * @param {Object} [params.dbTransaction] - Existing outer transaction (optional)
   * @returns {Promise<Object>} Result object
   */
  async executeRefund({
    transactionId = null,
    originalReference = null,
    refundReference = null,
    userId = null,
    amount = null,
    reason = 'Refund processed',
    operator = 'system',
    metadata = {},
    dbTransaction = null
  } = {}) {
    const work = async (t) => {
      let originalTxn = null;

      // 1. Locate original transaction if provided
      if (transactionId) {
        originalTxn = await Transaction.findByPk(transactionId, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });
      } else if (originalReference) {
        originalTxn = await Transaction.findOne({
          where: { reference: originalReference },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
      } else if (refundReference) {
        originalTxn = await Transaction.findOne({
          where: { refund_reference: refundReference },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
      }

      const effectiveUserId = userId || originalTxn?.userId;
      if (!effectiveUserId) {
        throw new Error('Refund failed: Unable to identify target user for refund.');
      }

      const effectiveAmount = amount !== null && amount !== undefined ? parseFloat(amount) : parseFloat(originalTxn?.amount || 0);
      if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
        throw new Error(`Refund failed: Invalid refund amount (${effectiveAmount}).`);
      }

      const effectiveOriginalRef = originalReference || originalTxn?.reference || null;
      const effectiveRefundRef = 
        refundReference || 
        originalTxn?.refund_reference || 
        this.buildRefundReference(effectiveOriginalRef);

      // 2. Strict Idempotency Check: Check if this refund reference has already been credited in ledger
      const existingCredit = await this.findExistingRefundCredit(effectiveRefundRef, effectiveOriginalRef, t);
      if (existingCredit) {
        logger.info(`[RefundEngine] Idempotency guard triggered: refund ${effectiveRefundRef} already credited in txn ${existingCredit.id}`);
        
        // Ensure original transaction status reflects refunded
        if (originalTxn && originalTxn.status !== 'refunded') {
          originalTxn.status = 'refunded';
          originalTxn.refund_reference = effectiveRefundRef;
          await originalTxn.save({ transaction: t });
        }

        return {
          ok: true,
          duplicate: true,
          alreadyRefunded: true,
          status: 'already_credited',
          refundReference: effectiveRefundRef,
          transactionId: existingCredit.id,
          userId: effectiveUserId,
          amount: parseFloat(existingCredit.amount),
          balanceAfter: parseFloat(existingCredit.balance_after)
        };
      }

      // 3. Acquire exclusive row-level lock on the target User's Wallet (SELECT ... FOR UPDATE)
      let wallet = await Wallet.findOne({
        where: { userId: effectiveUserId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!wallet) {
        wallet = await Wallet.create({
          id: crypto.randomUUID(),
          userId: effectiveUserId,
          balance: 0.00
        }, { transaction: t });
      }

      const balanceBefore = parseFloat(wallet.balance || 0);

      // 4. Atomically increment wallet balance
      await wallet.increment('balance', { by: effectiveAmount, transaction: t });
      await wallet.reload({ transaction: t });
      const balanceAfter = parseFloat(wallet.balance || 0);

      // 5. Create immutable credit Transaction record in ledger
      const refundTxnId = crypto.randomUUID();
      const refundTxn = await Transaction.create({
        id: refundTxnId,
        walletId: wallet.id,
        userId: effectiveUserId,
        type: 'credit',
        amount: effectiveAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        source: 'refund',
        reference: effectiveRefundRef,
        description: `Refund: ${effectiveRefundRef} (Reason: ${reason})`,
        metadata: {
          ...metadata,
          original_transaction_id: originalTxn?.id || null,
          original_transaction_reference: effectiveOriginalRef,
          refund_reason: reason,
          operator,
          refund_reference: effectiveRefundRef,
          refunded_at: new Date().toISOString()
        },
        status: 'completed',
        completed_at: new Date()
      }, { transaction: t });

      // 6. Update original transaction status and link refund_reference
      if (originalTxn) {
        originalTxn.status = 'refunded';
        originalTxn.refund_reference = effectiveRefundRef;
        originalTxn.metadata = {
          ...(originalTxn.metadata || {}),
          refund: {
            refundReference: effectiveRefundRef,
            refundTransactionId: refundTxn.id,
            amount: effectiveAmount,
            reason,
            operator,
            refundedAt: new Date().toISOString()
          }
        };
        await originalTxn.save({ transaction: t });
      }

      // 7. Record immutable audit in DepositReconciliationAudit
      try {
        await DepositReconciliationAudit.create({
          id: crypto.randomUUID(),
          transactionReference: effectiveRefundRef,
          userId: effectiveUserId,
          walletId: wallet.id,
          transactionId: refundTxn.id,
          amount: effectiveAmount,
          gatewayProvider: originalTxn?.provider || 'wallet_refund',
          accountNumber: null,
          reconciliationType: operator === 'incident_remediation' ? 'manual_admin_trigger' : 'refund_engine',
          status: 'settled',
          isReconciled: true,
          walletBalanceBefore: balanceBefore,
          walletBalanceAfter: balanceAfter,
          metadata: {
            original_transaction_reference: effectiveOriginalRef,
            reason,
            operator,
            ...metadata
          },
          timestampCredited: new Date()
        }, { transaction: t });
      } catch (auditErr) {
        logger.warn(`[RefundEngine] Audit logging non-blocking error: ${auditErr.message}`);
      }

      return {
        ok: true,
        status: 'settled',
        refundReference: effectiveRefundRef,
        originalReference: effectiveOriginalRef,
        userId: effectiveUserId,
        amount: effectiveAmount,
        balanceBefore,
        balanceAfter,
        refundTransaction: refundTxn,
        originalTransaction: originalTxn
      };
    };

    let result;
    if (dbTransaction) {
      result = await work(dbTransaction);
    } else {
      result = await sequelize.transaction(work);
    }

    // Post-commit dispatch: Send real-time updates and notifications
    if (result.ok && !result.duplicate) {
      this.dispatchRefundNotifications(result.userId, {
        reference: result.refundReference,
        amount: result.amount,
        balance: result.balanceAfter,
        reason
      });
    }

    return result;
  }

  /**
   * Dispatch Socket.IO and in-app notifications
   */
  dispatchRefundNotifications(userId, { reference, amount, balance, reason }) {
    if (!userId) return;

    try {
      notificationRealtimeService.emitToUser(userId, 'wallet_balance_updated', {
        reference,
        amount,
        balance,
        source: 'refund'
      });
    } catch (err) {
      logger.warn(`[RefundEngine] Socket emit error for user ${userId}: ${err.message}`);
    }

    try {
      void notificationRealtimeService.sendToUser(userId, {
        title: 'Refund Credited',
        message: `Your wallet has been credited with a refund of ₦${Number(amount).toLocaleString()}. Ref: ${reference}`,
        type: 'success',
        priority: 'high',
        link: '/dashboard',
        metadata: {
          kind: 'wallet_refund',
          reference,
          amount: Number(amount),
          balance,
          reason
        }
      });
    } catch (err) {
      logger.warn(`[RefundEngine] In-app notification error for user ${userId}: ${err.message}`);
    }
  }

  /**
   * Scan for orphaned refunds and automatically heal them.
   * An orphaned refund is a transaction where status = 'refunded' or refund_reference is set,
   * but no credit transaction exists in the ledger for that user.
   */
  async scanAndRepairOrphanedRefunds({ limit = 100, lookbackHours = 720, autoRepair = true } = {}) {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const candidates = await Transaction.findAll({
      where: {
        createdAt: { [Op.gte]: since },
        [Op.or]: [
          { status: 'refunded' },
          { refund_reference: { [Op.ne]: null } }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 500)
    });

    const report = {
      timestamp: new Date().toISOString(),
      scanned: candidates.length,
      orphanedCount: 0,
      repairedCount: 0,
      alreadyCorrectCount: 0,
      totalRepairedAmount: 0,
      items: []
    };

    for (const txn of candidates) {
      const refToLookFor = txn.refund_reference || this.buildRefundReference(txn.reference);
      const existingCredit = await this.findExistingRefundCredit(refToLookFor, txn.reference);

      if (existingCredit) {
        report.alreadyCorrectCount++;
        continue;
      }

      // Found an orphaned refund!
      report.orphanedCount++;
      const itemSummary = {
        originalTransactionId: txn.id,
        originalReference: txn.reference,
        refundReference: refToLookFor,
        userId: txn.userId,
        amount: parseFloat(txn.amount),
        repaired: false
      };

      if (autoRepair) {
        try {
          const repairResult = await this.executeRefund({
            transactionId: txn.id,
            originalReference: txn.reference,
            refundReference: refToLookFor,
            userId: txn.userId,
            amount: parseFloat(txn.amount),
            reason: 'Automated repair of orphaned refund',
            operator: 'automated_reconciliation_worker'
          });

          if (repairResult.ok && !repairResult.duplicate) {
            report.repairedCount++;
            report.totalRepairedAmount += parseFloat(txn.amount);
            itemSummary.repaired = true;
            itemSummary.newBalance = repairResult.balanceAfter;
          }
        } catch (repairErr) {
          itemSummary.error = repairErr.message;
          logger.error(`[RefundEngine] Failed to auto-repair orphaned refund ${txn.reference}: ${repairErr.message}`);
        }
      }

      report.items.push(itemSummary);
    }

    try {
      await SystemSetting.set('refund_last_reconciliation_summary', JSON.stringify(report), 'json', 'reconciliation');
      await SystemSetting.set('refund_last_reconciliation_run_at', report.timestamp, 'string', 'reconciliation');
    } catch (_) {}

    return report;
  }
}

module.exports = new RefundEngine();
