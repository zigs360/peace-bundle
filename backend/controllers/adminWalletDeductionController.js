const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AdminWalletDeduction = require('../models/AdminWalletDeduction');
const adminWalletDeductionService = require('../services/adminWalletDeductionService');
const logger = require('../utils/logger');

const requirePasswordReauth = async (req) => {
  const password = String(req.body?.admin_password || '').trim();
  if (!password) {
    const err = new Error('admin_password_required');
    err.code = 'admin_password_required';
    throw err;
  }
  const admin = await User.findByPk(req.user.id);
  if (!admin) {
    const err = new Error('admin_not_found');
    err.code = 'admin_not_found';
    throw err;
  }
  const ok = await bcrypt.compare(password, admin.password || '');
  if (!ok) {
    const err = new Error('invalid_admin_password');
    err.code = 'invalid_admin_password';
    throw err;
  }
  return admin;
};

const getUserWalletSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await adminWalletDeductionService.getUserWalletSnapshot(id);
    if (!snap.ok) {
      if (snap.reason === 'user_not_found') return res.status(404).json({ success: false, message: 'User not found' });
      if (snap.reason === 'wallet_not_found') return res.status(404).json({ success: false, message: 'Wallet not found' });
      return res.status(400).json({ success: false, message: 'Unable to fetch wallet' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: snap });
  } catch (e) {
    logger.error('Admin Wallet Snapshot Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createWalletDeduction = async (req, res) => {
  try {
    await requirePasswordReauth(req);
    const { userId, amount, reason } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || null;
    const result = await adminWalletDeductionService.createDeduction({
      adminUserId: req.user.id,
      userId,
      amount,
      reason,
      idempotencyKey,
      adminIp: req.ip,
      adminAgent: req.headers['user-agent'] || null,
    });

    if (!result.ok) {
      if (result.reason === 'invalid_amount') return res.status(400).json({ success: false, message: 'Invalid amount' });
      if (result.reason === 'invalid_reason') return res.status(400).json({ success: false, message: 'Reason is required' });
      if (result.reason === 'user_not_found') return res.status(404).json({ success: false, message: 'User not found' });
      if (result.reason === 'wallet_not_found') return res.status(404).json({ success: false, message: 'Wallet not found' });
      return res.status(400).json({ success: false, message: 'Request rejected' });
    }

    res.json({ success: true, data: result.deduction, transaction: result.transaction });
  } catch (e) {
    const code = e.code || e.message;
    if (code === 'admin_password_required') return res.status(400).json({ success: false, message: 'Admin password is required' });
    if (code === 'invalid_admin_password') return res.status(401).json({ success: false, message: 'Invalid admin password' });
    if (code === 'insufficient_wallet_balance' || code === 'Insufficient wallet balance') {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }
    logger.error('Admin Wallet Deduction Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const listWalletDeductions = async (req, res) => {
  try {
    const { userId, limit = 20, page = 1 } = req.query;
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (Math.max(1, Number(page) || 1) - 1) * take;
    const where = {};
    if (userId) where.userId = String(userId);
    const { count, rows } = await AdminWalletDeduction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: take,
      offset,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count, rows });
  } catch (e) {
    logger.error('Admin Wallet Deduction List Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const reverseWalletDeduction = async (req, res) => {
  try {
    await requirePasswordReauth(req);
    const { reference } = req.params;
    const { reason } = req.body || {};
    const result = await adminWalletDeductionService.reverseDeduction({
      superAdminUserId: req.user.id,
      reference,
      reason,
      adminIp: req.ip,
      adminAgent: req.headers['user-agent'] || null,
    });

    if (!result.ok) {
      if (result.reason === 'not_super_admin') return res.status(403).json({ success: false, message: 'Super-admin required' });
      if (result.reason === 'not_found') return res.status(404).json({ success: false, message: 'Not found' });
      if (result.reason === 'window_expired') return res.status(400).json({ success: false, message: 'Rollback window expired' });
      if (result.reason === 'invalid_reason') return res.status(400).json({ success: false, message: 'Reason is required' });
      return res.status(400).json({ success: false, message: 'Request rejected' });
    }

    res.json({ success: true, data: result.deduction, transaction: result.transaction });
  } catch (e) {
    const code = e.code || e.message;
    if (code === 'admin_password_required') return res.status(400).json({ success: false, message: 'Admin password is required' });
    if (code === 'invalid_admin_password') return res.status(401).json({ success: false, message: 'Invalid admin password' });
    logger.error('Admin Wallet Deduction Reverse Error:', { error: e.message, adminId: req.user?.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getUserWalletSnapshot,
  createWalletDeduction,
  listWalletDeductions,
  reverseWalletDeduction,
};

