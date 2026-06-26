const airtimeWalletAuditService = require('../services/airtimeWalletAuditService');
const logger = require('../utils/logger');

function parsePositiveInt(value, fallback, max = 1000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

const getAirtimeWalletAuditReport = async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query?.limit, 250, 2000);
    const userId = req.query?.userId ? String(req.query.userId) : null;
    const report = await airtimeWalletAuditService.runAudit({
      userId,
      limit,
      repair: false,
      adminId: req.user?.id || null,
    });

    return res.json(report);
  } catch (error) {
    logger.error('[AirtimeWalletAudit][ADMIN] Failed to generate audit report', {
      adminId: req.user?.id || null,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to generate airtime wallet deduction audit report',
    });
  }
};

const runAirtimeWalletAuditRepair = async (req, res) => {
  try {
    const limit = parsePositiveInt(req.body?.limit ?? req.query?.limit, 250, 2000);
    const userId = req.body?.userId || req.query?.userId || null;
    const report = await airtimeWalletAuditService.runAudit({
      userId: userId ? String(userId) : null,
      limit,
      repair: true,
      adminId: req.user?.id || null,
    });

    return res.json({
      success: true,
      message: 'Airtime wallet deduction repair pass completed',
      ...report,
    });
  } catch (error) {
    logger.error('[AirtimeWalletAudit][ADMIN] Failed to run repair pass', {
      adminId: req.user?.id || null,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to run airtime wallet deduction repair pass',
    });
  }
};

const getLatestAirtimeWalletAuditReport = async (_req, res) => {
  try {
    const report = await airtimeWalletAuditService.getLatestReport();
    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('[AirtimeWalletAudit][ADMIN] Failed to fetch latest report', {
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to load latest airtime wallet deduction audit report',
    });
  }
};

module.exports = {
  getAirtimeWalletAuditReport,
  runAirtimeWalletAuditRepair,
  getLatestAirtimeWalletAuditReport,
};
