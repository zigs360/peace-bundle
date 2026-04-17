const { Op } = require('sequelize');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const AdminWalletDeduction = require('../models/AdminWalletDeduction');
const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');
const notificationRealtimeService = require('./notificationRealtimeService');
const logger = require('../utils/logger');

const MAIN_BALANCE_SOURCES = new Set([
  'funding',
  'data_purchase',
  'airtime_purchase',
  'bill_payment',
  'exam_payment',
  'bulk_sms_payment',
  'refund',
  'withdrawal',
  'bonus',
  'transfer',
]);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

class WalletReconciliationService {
  transactionAffectsMainBalance(txn) {
    if (!txn || txn.status !== 'completed') return false;
    if (MAIN_BALANCE_SOURCES.has(txn.source)) return true;
    if (txn.source === 'commission') {
      const meta = txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {};
      return (
        meta.kind === 'commission_transfer_to_main_balance' ||
        String(txn.description || '').trim().toLowerCase() === 'commission transfer to main wallet'
      );
    }
    return false;
  }

  toDelta(txn) {
    const amount = toNumber(txn.amount);
    return txn.type === 'debit' ? -amount : amount;
  }

  normalizeTransaction(txn) {
    if (!txn) return null;
    return {
      id: txn.id,
      reference: txn.reference,
      source: txn.source,
      type: txn.type,
      status: txn.status,
      walletId: txn.walletId || null,
      userId: txn.userId || null,
      amount: toNumber(txn.amount),
      balance_before: toNumber(txn.balance_before),
      balance_after: toNumber(txn.balance_after),
      description: txn.description || null,
      createdAt: txn.createdAt ? new Date(txn.createdAt).toISOString() : null,
      updatedAt: txn.updatedAt ? new Date(txn.updatedAt).toISOString() : null,
      metadata: txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {},
    };
  }

  async buildUserReport(userId, { includeTransactions = false, transactionLimit = 100 } = {}) {
    const [user, wallet, allUserTransactions, deductions] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone', 'role'] }),
      Wallet.findOne({ where: { userId } }),
      Transaction.findAll({
        where: { userId },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
      }),
      AdminWalletDeduction.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 100,
      }),
    ]);

    if (!user) return { ok: false, reason: 'user_not_found', userId };
    if (!wallet) return { ok: false, reason: 'wallet_not_found', userId };

    const walletId = String(wallet.id);
    const normalized = allUserTransactions.map((txn) => this.normalizeTransaction(txn));
    const walletTransactions = normalized.filter((txn) => String(txn.walletId || '') === walletId);
    const orphanTransactions = normalized.filter((txn) => String(txn.walletId || '') !== walletId);
    const mainBalanceTransactions = walletTransactions.filter((txn) => this.transactionAffectsMainBalance(txn));
    const hiddenMainBalanceTransactions = orphanTransactions.filter((txn) => this.transactionAffectsMainBalance(txn));

    const totalCredits = round2(
      mainBalanceTransactions
        .filter((txn) => txn.type === 'credit')
        .reduce((sum, txn) => sum + txn.amount, 0)
    );
    const totalDebits = round2(
      mainBalanceTransactions
        .filter((txn) => txn.type === 'debit')
        .reduce((sum, txn) => sum + txn.amount, 0)
    );
    const totalNet = round2(mainBalanceTransactions.reduce((sum, txn) => sum + this.toDelta(txn), 0));

    const firstMainTxn = mainBalanceTransactions[0] || null;
    const lastMainTxn = mainBalanceTransactions[mainBalanceTransactions.length - 1] || null;
    const reconstructedFromFirst = firstMainTxn
      ? round2(firstMainTxn.balance_before + totalNet)
      : 0;
    const lastLedgerBalance = lastMainTxn ? round2(lastMainTxn.balance_after) : 0;
    const actualBalance = round2(wallet.balance);

    const incompleteTransactions = walletTransactions.filter(
      (txn) =>
        !Number.isFinite(Number(txn.balance_before)) ||
        !Number.isFinite(Number(txn.balance_after)) ||
        !txn.reference
    );

    const deductionMismatches = deductions
      .map((deduction) => {
        const linked = normalized.find((txn) => txn.id === deduction.transactionId || txn.reference === deduction.reference);
        return {
          reference: deduction.reference,
          transactionId: deduction.transactionId || null,
          linked: linked || null,
        };
      })
      .filter((entry) => !entry.linked);

    const driftFromLedger = round2(actualBalance - lastLedgerBalance);
    const driftFromReconstructed = round2(actualBalance - reconstructedFromFirst);

    const discrepancies = [];
    if (hiddenMainBalanceTransactions.length) {
      discrepancies.push({
        type: 'orphan_main_balance_transactions',
        message: `${hiddenMainBalanceTransactions.length} completed main-balance transaction(s) are not attached to the current wallet ledger.`,
        count: hiddenMainBalanceTransactions.length,
        references: hiddenMainBalanceTransactions.slice(0, 20).map((txn) => txn.reference),
      });
    }
    if (deductionMismatches.length) {
      discrepancies.push({
        type: 'missing_deduction_ledger_links',
        message: `${deductionMismatches.length} admin deduction record(s) do not have a matching transaction ledger entry.`,
        count: deductionMismatches.length,
        references: deductionMismatches.slice(0, 20).map((item) => item.reference),
      });
    }
    if (incompleteTransactions.length) {
      discrepancies.push({
        type: 'incomplete_wallet_transactions',
        message: `${incompleteTransactions.length} wallet transaction(s) are missing required balance checkpoints or references.`,
        count: incompleteTransactions.length,
        references: incompleteTransactions.slice(0, 20).map((txn) => txn.reference),
      });
    }
    if (Math.abs(driftFromLedger) > 0.009) {
      discrepancies.push({
        type: 'wallet_balance_drift',
        message: `Wallet balance differs from latest ledger balance by ₦${driftFromLedger.toLocaleString()}.`,
        count: 1,
        amount: driftFromLedger,
      });
    }
    if (Math.abs(driftFromReconstructed - driftFromLedger) > 0.009) {
      discrepancies.push({
        type: 'ledger_sequence_inconsistency',
        message: `Ledger checkpoint reconstruction differs from the latest ledger chain by ₦${round2(driftFromReconstructed - driftFromLedger).toLocaleString()}.`,
        count: 1,
        amount: round2(driftFromReconstructed - driftFromLedger),
      });
    }

    const report = {
      ok: true,
      user,
      wallet: {
        id: wallet.id,
        status: wallet.status,
        balance: actualBalance,
        commission_balance: round2(wallet.commission_balance),
        bonus_balance: round2(wallet.bonus_balance),
        updatedAt: wallet.updatedAt ? new Date(wallet.updatedAt).toISOString() : null,
      },
      summary: {
        totalTransactions: walletTransactions.length,
        mainBalanceTransactions: mainBalanceTransactions.length,
        hiddenMainBalanceTransactions: hiddenMainBalanceTransactions.length,
        totalCredits,
        totalDebits,
        totalNet,
        latestLedgerBalance: lastLedgerBalance,
        reconstructedFromFirst,
        actualBalance,
        driftFromLedger,
        driftFromReconstructed,
        isConsistent: discrepancies.length === 0,
      },
      checkpoints: {
        firstMainTransaction: firstMainTxn,
        lastMainTransaction: lastMainTxn,
      },
      discrepancies,
      adminDeductions: deductions.map((row) => ({
        id: row.id,
        reference: row.reference,
        amount: toNumber(row.amount),
        status: row.status,
        balanceBefore: round2(row.balanceBefore),
        balanceAfter: round2(row.balanceAfter),
        transactionId: row.transactionId || null,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      })),
    };

    if (includeTransactions) {
      report.transactions = {
        walletLedger: walletTransactions.slice(-transactionLimit),
        orphanLedger: hiddenMainBalanceTransactions.slice(-transactionLimit),
      };
    }

    return report;
  }

  async sendDiscrepancyAlert(summary) {
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    const adminIds = admins.map((row) => row.id);
    if (!adminIds.length) return { ok: true, skipped: true };

    await notificationRealtimeService.sendBulk(adminIds, {
      title: 'Wallet reconciliation alert',
      message: `${summary.discrepancyUsers} wallet(s) have reconciliation discrepancies. Total drift: ₦${summary.totalDrift.toLocaleString()}.`,
      type: 'warning',
      priority: 'critical',
      link: '/admin/dashboard',
      metadata: summary,
    });
    return { ok: true };
  }

  async runReconciliation({ userId = null, includeTransactions = false, persist = true, alertOnDiscrepancy = true, limit = 500 } = {}) {
    const walletWhere = userId ? { userId } : {};
    const wallets = await Wallet.findAll({
      where: walletWhere,
      attributes: ['id', 'userId'],
      order: [['createdAt', 'ASC']],
      limit: userId ? undefined : limit,
    });

    const reports = [];
    for (const wallet of wallets) {
      const report = await this.buildUserReport(wallet.userId, { includeTransactions });
      if (report.ok) reports.push(report);
    }

    const discrepancyReports = reports.filter((report) => report.summary.isConsistent === false);
    const totalDrift = round2(
      discrepancyReports.reduce((sum, report) => sum + Math.abs(toNumber(report.summary.driftFromLedger)), 0)
    );

    const summary = {
      generatedAt: new Date().toISOString(),
      scannedWallets: reports.length,
      discrepancyUsers: discrepancyReports.length,
      consistentUsers: reports.length - discrepancyReports.length,
      totalDrift,
      topDiscrepancies: discrepancyReports.slice(0, 20).map((report) => ({
        userId: report.user.id,
        name: report.user.name,
        email: report.user.email,
        balance: report.wallet.balance,
        latestLedgerBalance: report.summary.latestLedgerBalance,
        driftFromLedger: report.summary.driftFromLedger,
        discrepancyTypes: report.discrepancies.map((item) => item.type),
      })),
    };

    const result = {
      ok: true,
      summary,
      reports: includeTransactions ? reports : discrepancyReports,
    };

    if (persist) {
      await SystemSetting.set(
        'wallet_last_reconciliation_report',
        result,
        'json',
        'wallet',
        'Last generated wallet reconciliation report'
      );
      await SystemSetting.set(
        'wallet_last_reconciliation_run_at',
        summary.generatedAt,
        'string',
        'wallet',
        'Last time wallet reconciliation completed'
      );
    }

    if (summary.discrepancyUsers > 0) {
      logger.warn('[WalletReconciliation] Discrepancies detected', summary);
      if (alertOnDiscrepancy) {
        await this.sendDiscrepancyAlert(summary);
      }
    } else {
      logger.info('[WalletReconciliation] All scanned wallets consistent', summary);
    }

    return result;
  }

  async getLatestStoredReport() {
    return SystemSetting.get('wallet_last_reconciliation_report', null);
  }

  async getRecentDiscrepancyNotifications(limit = 20) {
    return Notification.findAll({
      where: { title: 'Wallet reconciliation alert' },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }
}

module.exports = new WalletReconciliationService();
