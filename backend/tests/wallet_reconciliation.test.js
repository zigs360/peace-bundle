const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');
const walletReconciliationService = require('../services/walletReconciliationService');
const { runWalletReconciliationOnce } = require('../jobs/walletReconciliationJob');

describe('Wallet reconciliation system', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  });

  beforeEach(async () => {
    await Notification.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {} });
    await SystemSetting.set('wallet_last_reconciliation_report', '{}', 'json', 'wallet');
    await SystemSetting.set('wallet_last_reconciliation_run_at', '', 'string', 'wallet');
  });

  const makeUser = async (role, prefix) => {
    const user = await User.create({
      name: `${role} ${prefix}`,
      email: `${prefix}_${Date.now()}@test.com`,
      phone: `081${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: 'password123',
      role,
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 0, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return { user, wallet };
  };

  it('records admin wallet funding in the main ledger and user history', async () => {
    const { user: admin } = await makeUser('admin', 'recon_admin_fund');
    const { user, wallet } = await makeUser('user', 'recon_target_fund');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 200 });

    expect(res.statusCode).toBe(200);
    expect(res.body.transaction).toBeTruthy();
    expect(parseFloat(String(res.body.newBalance))).toBe(200);

    const txn = await Transaction.findOne({ where: { reference: res.body.transaction.reference } });
    expect(txn).toBeTruthy();
    expect(txn.walletId).toBe(wallet.id);
    expect(txn.source).toBe('funding');
    expect(parseFloat(String(txn.balance_before))).toBe(0);
    expect(parseFloat(String(txn.balance_after))).toBe(200);
    expect(txn.metadata.kind).toBe('wallet_funding_admin');

    const userToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    const historyRes = await request(app)
      .get('/api/transactions/my')
      .set('Authorization', `Bearer ${userToken}`);

    expect(historyRes.statusCode).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.some((row) => row.reference === txn.reference)).toBe(true);
  });

  it('flags orphan completed wallet-affecting transactions in reconciliation reports', async () => {
    const { user } = await makeUser('user', 'recon_orphan_user');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 650 });

    await Transaction.create({
      userId: user.id,
      walletId: null,
      type: 'credit',
      amount: 200,
      balance_before: 0,
      balance_after: 200,
      source: 'funding',
      reference: `ORPHAN-${Date.now()}`,
      description: 'Legacy orphan funding entry',
      metadata: { kind: 'wallet_funding_admin' },
      status: 'completed',
      completed_at: new Date(),
    });

    const report = await walletReconciliationService.runReconciliation({
      userId: user.id,
      includeTransactions: true,
      persist: false,
      alertOnDiscrepancy: false,
    });

    expect(report.ok).toBe(true);
    expect(report.summary.discrepancyUsers).toBe(1);
    expect(report.reports[0].discrepancies.some((item) => item.type === 'orphan_main_balance_transactions')).toBe(true);
    expect(report.reports[0].transactions.orphanLedger).toHaveLength(1);
  });

  it('persists daily reconciliation results and sends exception alerts to admins', async () => {
    const { user: admin } = await makeUser('admin', 'recon_admin_alert');
    const { user } = await makeUser('user', 'recon_alert_user');
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 650 });

    await Transaction.create({
      userId: user.id,
      walletId: null,
      type: 'credit',
      amount: 1070,
      balance_before: 650,
      balance_after: 1720,
      source: 'funding',
      reference: `ALERT-${Date.now()}`,
      description: 'Legacy missing transaction link',
      metadata: { kind: 'wallet_funding_admin' },
      status: 'completed',
      completed_at: new Date(),
    });

    const result = await runWalletReconciliationOnce();
    expect(result).toBeTruthy();
    expect(result.summary.discrepancyUsers).toBeGreaterThan(0);

    const latest = await walletReconciliationService.getLatestStoredReport();
    expect(latest).toBeTruthy();
    expect(latest.summary.discrepancyUsers).toBeGreaterThan(0);

    const alert = await Notification.findOne({
      where: {
        userId: admin.id,
        title: 'Wallet reconciliation alert',
      },
    });
    expect(alert).toBeTruthy();
  });

  it('exposes reconciliation reports through the admin reports API', async () => {
    const { user: admin } = await makeUser('admin', 'recon_admin_route');
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/api/reports/wallet-reconciliation')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    const latestRes = await request(app)
      .get('/api/reports/wallet-reconciliation/latest')
      .set('Authorization', `Bearer ${token}`);

    expect(latestRes.statusCode).toBe(200);
    expect(latestRes.body.success).toBe(true);
    expect(latestRes.body.report).toBeTruthy();
  });
});
