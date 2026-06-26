const sequelize = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('./walletService');
const walletReconciliationService = require('./walletReconciliationService');
const logger = require('../utils/logger');

const REPORT_KEY = 'airtime_wallet_deduction_last_audit_report';
const REPORT_AT_KEY = 'airtime_wallet_deduction_last_audit_run_at';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

function toDateValue(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function isRepairTransaction(txn) {
  return String(txn?.metadata?.kind || '') === 'airtime_missing_wallet_deduction_repair';
}

function isRepairFlagged(txn) {
  return Boolean(txn?.metadata?.repair?.correctedByReference);
}

function transactionHasBalanceImpact(txn) {
  const before = Number(txn?.balance_before || 0);
  const after = Number(txn?.balance_after || 0);
  return Math.abs(round2(after - before)) > 0.009;
}

function selectCandidatesForDrift(candidates, targetAmount) {
  const sorted = [...candidates].sort((left, right) => toDateValue(left.createdAt) - toDateValue(right.createdAt));
  const selected = [];
  let running = 0;

  for (const candidate of sorted) {
    const next = round2(running + Number(candidate.amount || 0));
    if (next - targetAmount > 0.009) continue;
    selected.push(candidate);
    running = next;
    if (Math.abs(running - targetAmount) <= 0.009) {
      return {
        selected,
        matched: true,
        total: running,
      };
    }
  }

  return {
    selected,
    matched: Math.abs(running - targetAmount) <= 0.009,
    total: running,
  };
}

class AirtimeWalletAuditService {
  async listRepairCandidatesForUser(userId) {
    const report = await walletReconciliationService.buildUserReport(userId, {
      includeTransactions: true,
      transactionLimit: 2000,
    });
    if (!report?.ok) return { ok: false, reason: report?.reason || 'unknown', userId };

    const walletLedger = Array.isArray(report.transactions?.walletLedger) ? report.transactions.walletLedger : [];
    const orphanLedger = Array.isArray(report.transactions?.orphanLedger) ? report.transactions.orphanLedger : [];

    const zeroImpactCompletedAirtime = walletLedger.filter((txn) =>
      txn &&
      txn.source === 'airtime_purchase' &&
      txn.type === 'debit' &&
      txn.status === 'completed' &&
      !transactionHasBalanceImpact(txn) &&
      !isRepairTransaction(txn) &&
      !isRepairFlagged(txn)
    );

    const orphanCompletedAirtime = orphanLedger.filter((txn) =>
      txn &&
      txn.source === 'airtime_purchase' &&
      txn.type === 'debit' &&
      txn.status === 'completed' &&
      !isRepairTransaction(txn) &&
      !isRepairFlagged(txn)
    );

    const positiveDrift = round2(Math.max(0, Number(report.summary?.driftFromLedger || 0)));
    const candidates = [...zeroImpactCompletedAirtime, ...orphanCompletedAirtime];
    const selection = selectCandidatesForDrift(candidates, positiveDrift);

    return {
      ok: true,
      userId,
      user: report.user,
      wallet: report.wallet,
      drift: positiveDrift,
      candidates,
      selection,
      discrepancies: report.discrepancies || [],
    };
  }

  async runAudit({ userId = null, limit = 250, repair = false, adminId = null } = {}) {
    const wallets = await Wallet.findAll({
      where: userId ? { userId } : {},
      attributes: ['userId'],
      limit,
      order: [['updatedAt', 'DESC']],
    });

    const reports = [];
    const correctedTransactions = [];
    let scannedUsers = 0;

    for (const wallet of wallets) {
      scannedUsers += 1;
      const result = await this.listRepairCandidatesForUser(wallet.userId);
      if (!result.ok) {
        reports.push(result);
        continue;
      }

      const entry = {
        userId: result.userId,
        user: result.user,
        wallet: result.wallet,
        drift: result.drift,
        candidateCount: result.candidates.length,
        candidateReferences: result.candidates.map((txn) => txn.reference),
        exactRepairPossible: Boolean(result.selection?.matched && result.selection?.total > 0),
        selectedReferences: result.selection?.selected?.map((txn) => txn.reference) || [],
        selectedAmount: round2(result.selection?.total || 0),
        repaired: false,
        repairReference: null,
      };

      if (repair && result.selection?.matched && result.selection.total > 0) {
        const targetUser = await User.findByPk(result.userId);
        if (!targetUser) {
          entry.repairError = 'User not found during repair';
        } else {
          try {
            const repairReference = walletService.generateReference('AIRFIX');
            const repairAmount = round2(result.selection.total);
            await sequelize.transaction(async (t) => {
              const repair = await walletService.adminAdjust(
                targetUser,
                -repairAmount,
                'airtime_purchase',
                'Repair missing wallet deduction for completed airtime purchase',
                {
                  reference: repairReference,
                  kind: 'airtime_missing_wallet_deduction_repair',
                  admin_id: adminId || null,
                  corrected_references: result.selection.selected.map((txn) => txn.reference),
                  corrected_user_id: result.userId,
                },
                t,
              );

              const selectedIds = result.selection.selected.map((txn) => txn.id).filter(Boolean);
              if (selectedIds.length) {
                const originals = await Transaction.findAll({
                  where: { id: selectedIds },
                  transaction: t,
                  lock: t.LOCK.UPDATE,
                });
                for (const original of originals) {
                  await original.update(
                    {
                      metadata: {
                        ...(original.metadata || {}),
                        repair: {
                          correctedByReference: repairReference,
                          correctedAt: new Date().toISOString(),
                          correctedByAdminId: adminId || null,
                        },
                      },
                    },
                    { transaction: t },
                  );
                }
              }

              correctedTransactions.push({
                userId: result.userId,
                amount: repairAmount,
                repairReference,
                correctedReferences: result.selection.selected.map((txn) => txn.reference),
                balanceAfter: Number(repair.txn?.balance_after || 0),
              });
            });

            entry.repaired = true;
            entry.repairReference = repairReference;
          } catch (error) {
            entry.repairError = error.message;
            logger.error('[AirtimeWalletAudit] Repair failed', {
              userId: result.userId,
              adminId,
              message: error.message,
            });
          }
        }
      }

      reports.push(entry);
    }

    const summary = {
      success: true,
      scannedUsers,
      matchedUsers: reports.filter((row) => row.exactRepairPossible).length,
      correctedUsers: reports.filter((row) => row.repaired).length,
      correctedTransactions: correctedTransactions.length,
      correctedAmount: round2(correctedTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
      repairMode: Boolean(repair),
      generatedAt: new Date().toISOString(),
    };

    const payload = {
      success: true,
      summary,
      reports,
      correctedTransactions,
    };

    await Promise.allSettled([
      SystemSetting.set(REPORT_KEY, JSON.stringify(payload), 'json', 'billing'),
      SystemSetting.set(REPORT_AT_KEY, summary.generatedAt, 'string', 'billing'),
    ]);

    logger.info('[AirtimeWalletAudit] Audit completed', summary);
    return payload;
  }

  async getLatestReport() {
    return SystemSetting.get(REPORT_KEY, null);
  }
}

module.exports = new AirtimeWalletAuditService();
