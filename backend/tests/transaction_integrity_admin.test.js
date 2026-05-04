const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const TransactionIntegrityAudit = require('../models/TransactionIntegrityAudit');
const SystemSetting = require('../models/SystemSetting');
const transactionIntegrityService = require('../services/transactionIntegrityService');

describe('transaction integrity admin endpoints', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    await connectDB();
  });

  beforeEach(async () => {
    await TransactionIntegrityAudit.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {}, force: true });
    await SystemSetting.destroy({
      where: {
        key: [
          'transaction_integrity_last_monitor_report',
          'transaction_integrity_last_monitor_run_at',
        ],
      },
    });
    jest.restoreAllMocks();
  });

  const makeUser = async (role, prefix) => {
    const hashed = await bcrypt.hash('password123', 4);
    const user = await User.create({
      name: `${role} ${prefix}`,
      email: `${prefix}_${Date.now()}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role,
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 5000, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return { user, wallet };
  };

  const authHeader = (user) => `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`;

  it('allows admins to view transaction integrity summaries and audit events', async () => {
    const { user: admin } = await makeUser('admin', 'integrity_admin');
    const { user, wallet } = await makeUser('user', 'integrity_target');

    const txn = await Transaction.create({
      userId: user.id,
      walletId: wallet.id,
      type: 'debit',
      amount: 300,
      balance_before: 5000,
      balance_after: 4700,
      source: 'data_purchase',
      reference: `INT-AUDIT-${Date.now()}`,
      description: 'Failed data delivery',
      status: 'failed',
      payment_channel: 'smeplug_wallet',
      fulfillment_route: 'smeplug_api',
      delivery_status: 'failed',
      integrity_status: 'route_locked',
      anomaly_flag: true,
      metadata: {
        client_reference: 'CLI-INTEGRITY-001',
        transaction_fingerprint: 'FP-INTEGRITY-001',
      },
    });

    await TransactionIntegrityAudit.create({
      transactionId: txn.id,
      userId: user.id,
      eventType: 'failed_delivery_detected',
      severity: 'critical',
      status: 'open',
      details: { reason: 'provider failure' },
    });

    await SystemSetting.set(
      'transaction_integrity_last_monitor_report',
      JSON.stringify({ duplicateRefunds: 1, failedRefundsRecovered: 2, staleTransactionsResolved: 3, scanned: 4 }),
      'json',
      'billing',
    );
    await SystemSetting.set(
      'transaction_integrity_last_monitor_run_at',
      new Date().toISOString(),
      'string',
      'billing',
    );

    const summaryRes = await request(app)
      .get('/api/admin/audit/transaction-integrity/summary')
      .set('Authorization', authHeader(admin));

    expect(summaryRes.statusCode).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.audits.open).toBeGreaterThan(0);
    expect(summaryRes.body.transactions.flagged).toBeGreaterThan(0);
    expect(summaryRes.body.latestMonitor.report.failedRefundsRecovered).toBe(2);

    const auditsRes = await request(app)
      .get('/api/admin/audit/transaction-integrity')
      .query({ severity: 'critical', anomalyOnly: 'true' })
      .set('Authorization', authHeader(admin));

    expect(auditsRes.statusCode).toBe(200);
    expect(auditsRes.body.success).toBe(true);
    expect(Array.isArray(auditsRes.body.rows)).toBe(true);
    expect(auditsRes.body.rows.some((row) => row.transaction.reference === txn.reference)).toBe(true);
  });

  it('allows admins to trigger a manual integrity repair pass', async () => {
    const { user: admin } = await makeUser('admin', 'integrity_repair_admin');
    const monitorSpy = jest.spyOn(transactionIntegrityService, 'monitorAndRepair').mockResolvedValue({
      duplicateRefunds: 2,
      failedRefundsRecovered: 1,
      staleTransactionsResolved: 1,
      scanned: 7,
    });

    const res = await request(app)
      .post('/api/admin/audit/transaction-integrity/repair')
      .set('Authorization', authHeader(admin))
      .send({ limit: 250 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.duplicateRefunds).toBe(2);
    expect(monitorSpy).toHaveBeenCalledWith({ limit: 250 });
  });

  it('blocks non-admin users from the transaction integrity audit endpoints', async () => {
    const { user } = await makeUser('user', 'integrity_non_admin');

    const res = await request(app)
      .get('/api/admin/audit/transaction-integrity/summary')
      .set('Authorization', authHeader(user));

    expect(res.statusCode).toBe(403);
  });
});
