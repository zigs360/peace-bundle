const treasuryService = require('../services/treasuryService');
const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

const getTreasuryBalance = async (req, res) => {
  try {
    const balance = await treasuryService.getBalance();
    const lastSyncAt = await SystemSetting.get('treasury_last_sync_at', null);
    res.json({ success: true, balance, currency: 'NGN', lastSyncAt });
  } catch (e) {
    logger.error('Admin Get Treasury Balance Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const syncTreasuryRevenue = async (req, res) => {
  try {
    const result = await treasuryService.syncRevenue({ adminUserId: req.user?.id || null });
    res.json({ success: true, ...result });
  } catch (e) {
    logger.error('Admin Treasury Sync Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const withdrawTreasuryToSettlement = async (req, res) => {
  try {
    const { amount, description } = req.body || {};
    const result = await treasuryService.withdrawToSettlement({
      adminUserId: req.user?.id || null,
      amount,
      description: description || null,
    });
    if (!result.ok) {
      if (result.reason === 'invalid_amount') return res.status(400).json({ success: false, message: 'Invalid amount' });
      if (result.reason === 'settlement_not_configured') return res.status(400).json({ success: false, message: 'Settlement account not configured' });
      if (result.reason === 'insufficient_balance') return res.status(400).json({ success: false, message: 'Insufficient treasury balance' });
      return res.status(502).json({ success: false, message: 'Withdrawal failed', reason: result.reason, error: result.error || null });
    }
    res.json({ success: true, message: 'Settlement withdrawal initiated', data: result });
  } catch (e) {
    logger.error('Admin Treasury Withdraw Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getTreasuryBalance,
  syncTreasuryRevenue,
  withdrawTreasuryToSettlement,
};

