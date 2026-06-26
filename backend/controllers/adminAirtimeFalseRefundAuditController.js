const airtimeFalseRefundAuditService = require('../services/airtimeFalseRefundAuditService');
const logger = require('../utils/logger');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getAirtimeFalseRefundReport = async (req, res) => {
  try {
    const report = await airtimeFalseRefundAuditService.runAudit({
      userId: req.query.userId || null,
      limit: parsePositiveInt(req.query.limit, 200),
      repair: false,
      adminId: req.user?.id || null,
    });
    res.json(report);
  } catch (error) {
    logger.error('[Admin][AirtimeFalseRefundAudit] Failed to generate report', {
      adminId: req.user?.id || null,
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to generate airtime false-refund audit report',
    });
  }
};

const runAirtimeFalseRefundRepair = async (req, res) => {
  try {
    const report = await airtimeFalseRefundAuditService.runAudit({
      userId: req.body?.userId || null,
      limit: parsePositiveInt(req.body?.limit, 200),
      repair: true,
      adminId: req.user?.id || null,
    });
    res.json(report);
  } catch (error) {
    logger.error('[Admin][AirtimeFalseRefundAudit] Failed to run repair', {
      adminId: req.user?.id || null,
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to repair airtime false refunds',
    });
  }
};

const getLatestAirtimeFalseRefundReport = async (_req, res) => {
  try {
    const report = await airtimeFalseRefundAuditService.getLatestReport();
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'No airtime false-refund audit report found',
      });
    }
    return res.json(report);
  } catch (error) {
    logger.error('[Admin][AirtimeFalseRefundAudit] Failed to load latest report', {
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to load latest airtime false-refund audit report',
    });
  }
};

module.exports = {
  getAirtimeFalseRefundReport,
  runAirtimeFalseRefundRepair,
  getLatestAirtimeFalseRefundReport,
};
