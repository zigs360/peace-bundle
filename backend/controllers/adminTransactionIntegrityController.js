const { Op } = require('sequelize');

const TransactionIntegrityAudit = require('../models/TransactionIntegrityAudit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const logger = require('../utils/logger');

const PURCHASE_SOURCES = ['airtime_purchase', 'data_purchase'];

const parsePositiveInt = (value, fallback, max = 500) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
};

const buildAuditWhere = (query) => {
  const where = {};
  if (query.status) where.status = String(query.status).trim();
  if (query.severity) where.severity = String(query.severity).trim();
  if (query.eventType) where.eventType = String(query.eventType).trim();
  if (query.userId) where.userId = String(query.userId).trim();
  if (String(query.includeResolved || '').toLowerCase() !== 'true') {
    where.status = where.status || { [Op.ne]: 'resolved' };
  }
  return where;
};

const buildTransactionWhere = (query, since) => {
  const where = {
    source: { [Op.in]: PURCHASE_SOURCES },
    createdAt: { [Op.gte]: since },
  };

  if (query.transactionReference) {
    where.reference = { [Op.like]: `%${String(query.transactionReference).trim()}%` };
  }
  if (query.source) {
    where.source = String(query.source).trim();
  }
  if (query.integrityStatus) {
    where.integrity_status = String(query.integrityStatus).trim();
  }
  if (String(query.anomalyOnly || '').toLowerCase() === 'true') {
    where.anomaly_flag = true;
  }

  return where;
};

const getIntegritySummary = async (req, res) => {
  try {
    const sinceHours = parsePositiveInt(req.query.sinceHours, 24, 24 * 30);
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const [audits, transactions, latestReportSetting, latestRunSetting] = await Promise.all([
      TransactionIntegrityAudit.findAll({
        where: {
          createdAt: { [Op.gte]: since },
        },
        order: [['createdAt', 'DESC']],
        limit: 1000,
        include: [
          { model: Transaction, as: 'transaction', attributes: ['id', 'reference', 'source', 'status', 'payment_channel', 'fulfillment_route', 'integrity_status', 'refund_reference', 'anomaly_flag'] },
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
        ],
      }),
      Transaction.findAll({
        where: {
          source: { [Op.in]: PURCHASE_SOURCES },
          createdAt: { [Op.gte]: since },
        },
        order: [['createdAt', 'DESC']],
        limit: 1000,
      }),
      SystemSetting.findOne({ where: { key: 'transaction_integrity_last_monitor_report' } }),
      SystemSetting.findOne({ where: { key: 'transaction_integrity_last_monitor_run_at' } }),
    ]);

    const countsBy = (items, field) =>
      items.reduce((acc, item) => {
        const key = String(item?.[field] || 'unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

    const openAudits = audits.filter((audit) => String(audit.status || '').toLowerCase() !== 'resolved');
    const refundedTransactions = transactions.filter((txn) => String(txn.status || '').toLowerCase() === 'refunded');
    const failedTransactions = transactions.filter((txn) => String(txn.status || '').toLowerCase() === 'failed');
    const flaggedTransactions = transactions.filter((txn) => Boolean(txn.anomaly_flag));
    const pendingIntegrityTransactions = transactions.filter((txn) =>
      ['route_locked', 'pending', 'queued', 'processing'].includes(String(txn.integrity_status || '').toLowerCase()) ||
      ['pending', 'queued', 'processing'].includes(String(txn.status || '').toLowerCase()),
    );

    let latestMonitorReport = null;
    try {
      latestMonitorReport = latestReportSetting?.value ? JSON.parse(latestReportSetting.value) : null;
    } catch (error) {
      latestMonitorReport = null;
    }

    return res.json({
      success: true,
      window: {
        since: since.toISOString(),
        sinceHours,
      },
      audits: {
        total: audits.length,
        open: openAudits.length,
        resolved: audits.length - openAudits.length,
        bySeverity: countsBy(audits, 'severity'),
        byStatus: countsBy(audits, 'status'),
        byEventType: countsBy(audits, 'eventType'),
      },
      transactions: {
        scanned: transactions.length,
        flagged: flaggedTransactions.length,
        refunded: refundedTransactions.length,
        failed: failedTransactions.length,
        pendingIntegrityReview: pendingIntegrityTransactions.length,
        byIntegrityStatus: countsBy(transactions, 'integrity_status'),
        byPaymentChannel: countsBy(transactions, 'payment_channel'),
        byFulfillmentRoute: countsBy(transactions, 'fulfillment_route'),
      },
      latestMonitor: {
        runAt: latestRunSetting?.value || null,
        report: latestMonitorReport,
      },
      recentOpenAudits: openAudits.slice(0, 10),
    });
  } catch (error) {
    logger.error('[TransactionIntegrity][ADMIN] Failed to build summary', {
      adminId: req.user?.id,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction integrity summary',
    });
  }
};

const listTransactionIntegrityAudits = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const offset = (page - 1) * limit;
    const sinceHours = parsePositiveInt(req.query.sinceHours, 72, 24 * 30);
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const where = buildAuditWhere(req.query);
    const transactionWhere = buildTransactionWhere(req.query, since);

    const { count, rows } = await TransactionIntegrityAudit.findAndCountAll({
      where: {
        ...where,
        createdAt: { [Op.gte]: since },
      },
      include: [
        {
          model: Transaction,
          as: 'transaction',
          attributes: ['id', 'reference', 'source', 'status', 'payment_channel', 'fulfillment_route', 'delivery_status', 'integrity_status', 'refund_reference', 'anomaly_flag', 'createdAt'],
          where: transactionWhere,
          required: true,
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      count,
      page,
      limit,
      rows,
    });
  } catch (error) {
    logger.error('[TransactionIntegrity][ADMIN] Failed to list audits', {
      adminId: req.user?.id,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction integrity audits',
    });
  }
};

const runTransactionIntegrityRepair = async (req, res) => {
  try {
    const requestedLimit = req.body?.limit ?? req.query?.limit;
    const limit = parsePositiveInt(requestedLimit, 100, 1000);
    const summary = await transactionIntegrityService.monitorAndRepair({ limit });

    return res.json({
      success: true,
      message: 'Transaction integrity repair pass completed',
      summary,
    });
  } catch (error) {
    logger.error('[TransactionIntegrity][ADMIN] Failed to run repair pass', {
      adminId: req.user?.id,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to run transaction integrity repair pass',
    });
  }
};

module.exports = {
  getIntegritySummary,
  listTransactionIntegrityAudits,
  runTransactionIntegrityRepair,
};
