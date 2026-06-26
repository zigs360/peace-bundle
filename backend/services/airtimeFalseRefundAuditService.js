const sequelize = require('../config/database');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('./walletService');
const logger = require('../utils/logger');

const REPORT_KEY = 'billing.airtime_false_refund_audit.latest';
const SUCCESS_STATES = new Set(['success', 'successful', 'completed', 'complete', 'delivered', 'ok']);

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getMetadata(txn) {
  return txn?.metadata && typeof txn.metadata === 'object' ? txn.metadata : {};
}

function getProviderAttempts(txn) {
  const attempts = getMetadata(txn).provider_attempts;
  return Array.isArray(attempts) ? attempts : [];
}

function isAlreadyReconciled(txn) {
  return Boolean(getMetadata(txn).false_refund_reconciliation?.correctedByReference);
}

function isSuccessLikeAttempt(attempt) {
  if (!attempt || attempt.provider !== 'ogdams') return false;
  const rawStatus = attempt.status;
  const normalized =
    typeof rawStatus === 'string'
      ? rawStatus.trim().toLowerCase()
      : rawStatus === true
        ? 'true'
        : rawStatus === false
          ? 'false'
          : '';
  const httpStatus = Number(attempt.http_status || 0) || null;
  const hasReference = Boolean(attempt.provider_reference || attempt.request_reference);
  const successLike =
    attempt.success_like === true ||
    rawStatus === true ||
    (normalized && SUCCESS_STATES.has(normalized));
  const httpLooksGood = httpStatus === null || (httpStatus >= 200 && httpStatus < 300);
  return successLike && hasReference && httpLooksGood;
}

function isFalseRefundCandidate(txn) {
  if (!txn) return false;
  if (String(txn.source || '').toLowerCase() !== 'airtime_purchase') return false;
  if (String(txn.type || '').toLowerCase() !== 'debit') return false;
  if (String(txn.status || '').toLowerCase() !== 'refunded') return false;
  if (!txn.refund_reference) return false;
  if (isAlreadyReconciled(txn)) return false;
  return getProviderAttempts(txn).some(isSuccessLikeAttempt);
}

class AirtimeFalseRefundAuditService {
  async runAudit({ userId = null, limit = 200, repair = false, adminId = null } = {}) {
    const where = {
      source: 'airtime_purchase',
      type: 'debit',
      status: 'refunded',
    };
    if (userId) where.userId = userId;

    const txns = await Transaction.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.max(1, Math.min(Number(limit) || 200, 5000)),
    });

    const candidates = txns.filter(isFalseRefundCandidate);
    const corrected = [];
    const report = [];

    for (const txn of candidates) {
      const attempts = getProviderAttempts(txn);
      const confirmedAttempt = attempts.find(isSuccessLikeAttempt) || null;
      const refundTxn = txn.refund_reference
        ? await Transaction.findOne({ where: { reference: txn.refund_reference } })
        : null;

      const entry = {
        transactionId: txn.id,
        userId: txn.userId,
        originalReference: txn.reference,
        refundReference: txn.refund_reference || null,
        amount: round2(txn.amount),
        originalStatus: txn.status,
        failureReason: txn.failure_reason || null,
        providerAttempt: confirmedAttempt,
        repaired: false,
        correctionReference: null,
      };

      if (repair) {
        const user = await User.findByPk(txn.userId);
        if (!user) {
          entry.repairError = 'User not found';
        } else {
          try {
            const correctionReference = walletService.generateReference('AIRRFIX');
            await sequelize.transaction(async (t) => {
              const correction = await walletService.adminAdjust(
                user,
                -Math.abs(Number(txn.amount || 0)),
                'airtime_purchase',
                'Correct improper airtime refund after confirmed provider success',
                {
                  reference: correctionReference,
                  kind: 'airtime_false_refund_repair',
                  corrected_reference: txn.reference,
                  corrected_refund_reference: txn.refund_reference || null,
                  admin_id: adminId || null,
                },
                t,
              );

              const lockedOriginal = await Transaction.findByPk(txn.id, {
                transaction: t,
                lock: t.LOCK.UPDATE,
              });
              const originalMeta = getMetadata(lockedOriginal);
              await lockedOriginal.update(
                {
                  status: 'completed',
                  failure_reason: null,
                  completed_at: lockedOriginal.completed_at || new Date(),
                  metadata: {
                    ...originalMeta,
                    false_refund_reconciliation: {
                      correctedAt: new Date().toISOString(),
                      correctedByReference: correctionReference,
                      correctedByAdminId: adminId || null,
                      originalRefundReference: txn.refund_reference || null,
                    },
                    payment_state: {
                      wallet: 'debited',
                      provider: 'confirmed',
                      settlement: 'corrected_false_refund',
                    },
                  },
                },
                { transaction: t },
              );

              if (refundTxn) {
                const lockedRefund = await Transaction.findByPk(refundTxn.id, {
                  transaction: t,
                  lock: t.LOCK.UPDATE,
                });
                const refundMeta = getMetadata(lockedRefund);
                await lockedRefund.update(
                  {
                    metadata: {
                      ...refundMeta,
                      false_refund_reconciliation: {
                        correctedAt: new Date().toISOString(),
                        correctedByReference: correctionReference,
                        correctedByAdminId: adminId || null,
                        originalReference: txn.reference,
                      },
                    },
                  },
                  { transaction: t },
                );
              }

              corrected.push({
                userId: txn.userId,
                originalReference: txn.reference,
                refundReference: txn.refund_reference || null,
                correctionReference,
                correctionAmount: round2(correction.txn?.amount || txn.amount),
                balanceAfter: Number(correction.txn?.balance_after || 0),
              });
            });

            entry.repaired = true;
            entry.correctionReference = correctionReference;
          } catch (error) {
            entry.repairError = error.message;
            logger.error('[AirtimeFalseRefundAudit] Repair failed', {
              reference: txn.reference,
              refundReference: txn.refund_reference || null,
              message: error.message,
            });
          }
        }
      }

      report.push(entry);
    }

    const payload = {
      success: true,
      scannedTransactions: txns.length,
      matchedTransactions: report.length,
      correctedTransactions: corrected.length,
      generatedAt: new Date().toISOString(),
      repair,
      adminId: adminId || null,
      report,
      corrected,
    };

    await SystemSetting.set(REPORT_KEY, JSON.stringify(payload), 'json', 'billing');
    return payload;
  }

  async getLatestReport() {
    const raw = await SystemSetting.get(REPORT_KEY, null);
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      logger.warn('[AirtimeFalseRefundAudit] Failed to parse stored report', {
        message: error.message,
      });
      return null;
    }
  }
}

module.exports = new AirtimeFalseRefundAuditService();
module.exports.REPORT_KEY = REPORT_KEY;
module.exports.isFalseRefundCandidate = isFalseRefundCandidate;
