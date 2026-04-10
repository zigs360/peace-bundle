const adminOgdamsDataPurchaseService = require('../services/adminOgdamsDataPurchaseService');
const AdminOgdamsDataPurchase = require('../models/AdminOgdamsDataPurchase');
const logger = require('../utils/logger');

const listAdminOgdamsSims = async (req, res) => {
  try {
    const forceBalance = req.query.force_balance === 'true' || req.query.force_balance === '1';
    const sims = await adminOgdamsDataPurchaseService.listAdminSims(req.user.id, { forceBalance });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: sims });
  } catch (e) {
    logger.error('Admin Ogdams Sims Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createAdminOgdamsDataPurchase = async (req, res) => {
  try {
    const { userId, recipientPhone, dataPlanId, simId } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || null;
    const result = await adminOgdamsDataPurchaseService.createPurchase({
      adminUser: req.user,
      userId,
      recipientPhone,
      dataPlanId,
      simId,
      idempotencyKey,
    });

    if (!result.ok) {
      if (result.reason === 'invalid_phone') return res.status(400).json({ success: false, message: 'Invalid phone number' });
      if (result.reason === 'user_not_found') return res.status(404).json({ success: false, message: 'User not found' });
      if (result.reason === 'plan_not_found') return res.status(404).json({ success: false, message: 'Data plan not found' });
      if (result.reason === 'plan_not_mapped') return res.status(400).json({ success: false, message: 'Data plan not mapped to Ogdams SKU' });
      if (result.reason === 'invalid_plan_cost') return res.status(400).json({ success: false, message: 'Invalid data plan cost' });
      if (result.reason === 'sim_not_found') return res.status(404).json({ success: false, message: 'SIM not found' });
      if (result.reason === 'sim_inactive') return res.status(400).json({ success: false, message: 'SIM is not active' });
      if (result.reason === 'daily_cap_exceeded') return res.status(429).json({ success: false, message: 'Daily cap exceeded', cap: result.cap });
      if (result.reason === 'monthly_cap_exceeded') return res.status(429).json({ success: false, message: 'Monthly cap exceeded', cap: result.cap });
      if (result.reason === 'provider_failed') return res.status(502).json({ success: false, message: result.message || 'Provider failed' });
      return res.status(400).json({ success: false, message: 'Request rejected', reason: result.reason });
    }

    res.json({ success: true, data: result.purchase });
  } catch (e) {
    const msg = e?.message || 'Server error';
    if (msg === 'insufficient_sim_balance') return res.status(400).json({ success: false, message: 'Insufficient SIM balance' });
    if (msg === 'sim_balance_unknown') return res.status(400).json({ success: false, message: 'SIM balance unavailable' });
    logger.error('Admin Ogdams Data Purchase Error:', { error: msg, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAdminOgdamsDataPurchase = async (req, res) => {
  try {
    const { reference } = req.params;
    const ref = String(reference || '').trim();
    const purchase = await AdminOgdamsDataPurchase.findOne({ where: { reference: ref } });
    if (!purchase) return res.status(404).json({ success: false, message: 'Not found' });
    if (String(purchase.adminId) !== String(req.user.id)) return res.status(403).json({ success: false, message: 'Unauthorized' });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: purchase });
  } catch (e) {
    logger.error('Admin Ogdams Data Purchase Get Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  listAdminOgdamsSims,
  createAdminOgdamsDataPurchase,
  getAdminOgdamsDataPurchase,
};

