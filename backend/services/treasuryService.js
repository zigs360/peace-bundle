const sequelize = require('../config/database');
const { QueryTypes, Op } = require('sequelize');
const SystemSetting = require('../models/SystemSetting');
const TreasuryBalance = require('../models/TreasuryBalance');
const TreasuryLedgerEntry = require('../models/TreasuryLedgerEntry');
const logger = require('../utils/logger');
const crypto = require('crypto');

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const genRef = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

class TreasuryService {
  async getBalanceRow(transaction) {
    const t = transaction || null;
    const lock = t ? { transaction: t, lock: t.LOCK.UPDATE } : {};
    let row = await TreasuryBalance.findOne(lock);
    if (!row) {
      row = await TreasuryBalance.create({ balance: 0, currency: 'NGN' }, { transaction: t });
    }
    return row;
  }

  async getBalance() {
    const row = await TreasuryBalance.findOne();
    return row ? toNumber(row.balance) : 0;
  }

  async syncRevenue({ adminUserId = null } = {}) {
    const dialect = sequelize.getDialect ? sequelize.getDialect() : null;
    const lastSyncAt = await SystemSetting.get('treasury_last_sync_at', null);
    const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);

    let feeRevenue = 0;
    let dataProfit = 0;

    if (dialect === 'sqlite') {
      const Transaction = require('../models/Transaction');
      const DataPlan = require('../models/DataPlan');

      const txns = await Transaction.findAll({
        where: {
          status: 'completed',
          createdAt: { [Op.gt]: since },
        },
      });

      for (const t of txns) {
        if (t.type === 'credit' && t.source === 'funding') {
          feeRevenue += toNumber(t.metadata?.fee_amount || 0);
        }
      }

      const dataTxns = txns.filter((t) => t.type === 'debit' && t.status === 'completed' && t.source === 'data_purchase' && t.dataPlanId);
      if (dataTxns.length) {
        const plans = await DataPlan.findAll({ where: { id: dataTxns.map((x) => x.dataPlanId) } });
        const byId = new Map(plans.map((p) => [String(p.id), p]));
        for (const t of dataTxns) {
          const p = byId.get(String(t.dataPlanId));
          const apiCost = toNumber(p?.api_cost || 0);
          dataProfit += Math.max(0, toNumber(t.amount) - apiCost);
        }
      }
    } else {
      const feesRow = await sequelize.query(
        `
          SELECT COALESCE(SUM(NULLIF(("metadata"::jsonb #>> '{fee_amount}'), '')::numeric), 0) AS fee_total
          FROM transactions
          WHERE "status" = 'completed'
            AND "type" = 'credit'
            AND "source" = 'funding'
            AND "createdAt" > :since
        `,
        { replacements: { since }, type: QueryTypes.SELECT }
      );
      feeRevenue = toNumber(feesRow?.[0]?.fee_total || 0);

      const profitRow = await sequelize.query(
        `
          SELECT COALESCE(SUM(t.amount - COALESCE(dp.api_cost, 0)), 0) AS profit
          FROM transactions t
          LEFT JOIN data_plans dp ON dp.id = t."dataPlanId"
          WHERE t."status" = 'completed'
            AND t."type" = 'debit'
            AND t."source" = 'data_purchase'
            AND t."createdAt" > :since
        `,
        { replacements: { since }, type: QueryTypes.SELECT }
      );
      dataProfit = Math.max(0, toNumber(profitRow?.[0]?.profit || 0));
    }

    const totalCredit = feeRevenue + dataProfit;
    if (totalCredit <= 0) {
      await SystemSetting.set('treasury_last_sync_at', new Date().toISOString(), 'string', 'treasury', 'Last treasury sync timestamp');
      return { ok: true, credited: 0, feeRevenue: 0, dataProfit: 0 };
    }

    await sequelize.transaction(async (t) => {
      const balanceRow = await this.getBalanceRow(t);
      const before = toNumber(balanceRow.balance);
      const after = before + totalCredit;

      await TreasuryLedgerEntry.create(
        {
          type: 'credit',
          status: 'completed',
          amount: totalCredit,
          balance_before: before,
          balance_after: after,
          source: 'revenue_sync',
          reference: genRef('TRSY-SYNC'),
          metadata: { adminUserId, since: since.toISOString(), feeRevenue, dataProfit },
        },
        { transaction: t }
      );

      balanceRow.balance = after;
      await balanceRow.save({ transaction: t });
    });

    await SystemSetting.set('treasury_last_sync_at', new Date().toISOString(), 'string', 'treasury', 'Last treasury sync timestamp');
    logger.info('[Treasury] Revenue sync applied', { adminUserId, since: since.toISOString(), feeRevenue, dataProfit, totalCredit });
    return { ok: true, credited: totalCredit, feeRevenue, dataProfit };
  }

  async withdrawToSettlement({ adminUserId, amount, description = null }) {
    const withdrawAmount = toNumber(amount);
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    const bankCode = await SystemSetting.get('settlement_bank_code', null);
    const bankName = await SystemSetting.get('settlement_bank_name', null);
    const accountNumber = await SystemSetting.get('settlement_account_number', null);
    const accountName = await SystemSetting.get('settlement_account_name', null);

    if (!bankCode || !accountNumber || !accountName) {
      return { ok: false, reason: 'settlement_not_configured' };
    }

    const fee = toNumber(process.env.SETTLEMENT_TRANSFER_FEE_NGN || '50');
    const totalDeduction = withdrawAmount + (fee > 0 ? fee : 0);

    const customerReference = genRef('SETTLE');
    const billstackTransferService = require('./billstackTransferService');

    let debitRef = null;
    let balanceAfterDebit = null;

    try {
      await sequelize.transaction(async (t) => {
        const bal = await this.getBalanceRow(t);
        const before = toNumber(bal.balance);
        if (before < totalDeduction) {
          throw new Error('insufficient_treasury_balance');
        }
        balanceAfterDebit = before - totalDeduction;
        debitRef = genRef('TRSY-WD');

        await TreasuryLedgerEntry.create(
          {
            type: 'debit',
            status: 'pending',
            amount: totalDeduction,
            balance_before: before,
            balance_after: balanceAfterDebit,
            source: 'settlement_withdrawal',
            reference: debitRef,
            metadata: {
              adminUserId,
              description,
              bankCode,
              bankName,
              accountNumber,
              accountName,
              withdrawAmount,
              fee,
              customerReference,
            },
          },
          { transaction: t }
        );

        bal.balance = balanceAfterDebit;
        await bal.save({ transaction: t });
      });

      const sendResult = await billstackTransferService.initiateTransfer({
        bankCode,
        accountNumber,
        amount: withdrawAmount,
        narration: description || 'Peace Bundlle settlement payout',
        reference: customerReference,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'provider_transfer_failed');
      }

      const providerReference = sendResult.reference || null;

      const debitEntry = await TreasuryLedgerEntry.findOne({ where: { reference: debitRef } });
      if (debitEntry) {
        debitEntry.status = 'completed';
        debitEntry.metadata = { ...(debitEntry.metadata || {}), providerReference };
        await debitEntry.save();
      }

      logger.info('[AUDIT][Treasury] Settlement withdrawal completed', {
        adminUserId,
        amount: withdrawAmount,
        fee,
        totalDeduction,
        debitRef,
        providerReference,
      });

      return { ok: true, reference: debitRef, providerReference, debited: totalDeduction };
    } catch (e) {
      const errorMsg = e?.message || String(e);
      if (errorMsg === 'insufficient_treasury_balance') {
        return { ok: false, reason: 'insufficient_balance' };
      }

      try {
        if (debitRef) {
          await sequelize.transaction(async (t) => {
            const bal = await this.getBalanceRow(t);
            const before = toNumber(bal.balance);
            const reverseAmount = totalDeduction;
            const after = before + reverseAmount;

            await TreasuryLedgerEntry.create(
              {
                type: 'credit',
                status: 'completed',
                amount: reverseAmount,
                balance_before: before,
                balance_after: after,
                source: 'settlement_withdrawal_reversal',
                reference: genRef('TRSY-REV'),
                metadata: { adminUserId, failed_reference: debitRef, error: errorMsg },
              },
              { transaction: t }
            );

            await TreasuryLedgerEntry.update(
              { status: 'failed' },
              { where: { reference: debitRef }, transaction: t }
            );
            const debitEntry = await TreasuryLedgerEntry.findOne({ where: { reference: debitRef }, transaction: t, lock: t.LOCK.UPDATE });
            if (debitEntry) {
              debitEntry.metadata = { ...(debitEntry.metadata || {}), error: errorMsg };
              await debitEntry.save({ transaction: t });
            }

            bal.balance = after;
            await bal.save({ transaction: t });
          });
        }
      } catch (rollbackErr) {
        logger.error('[Treasury] Failed to rollback settlement withdrawal', { debitRef, error: rollbackErr.message });
      }

      logger.error('[AUDIT][Treasury] Settlement withdrawal failed', { adminUserId, debitRef, error: errorMsg });
      return { ok: false, reason: 'provider_failed', error: errorMsg };
    }
  }
}

module.exports = new TreasuryService();
