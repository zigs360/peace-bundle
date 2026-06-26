jest.mock('../config/database', () => ({
  transaction: jest.fn(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } })),
}));

jest.mock('../models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../models/Wallet', () => ({
  findAll: jest.fn(),
}));

jest.mock('../models/Transaction', () => ({
  findAll: jest.fn(),
}));

jest.mock('../models/SystemSetting', () => ({
  set: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../services/walletService', () => ({
  adminAdjust: jest.fn(),
  generateReference: jest.fn(),
}));

jest.mock('../services/walletReconciliationService', () => ({
  buildUserReport: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const sequelize = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const walletReconciliationService = require('../services/walletReconciliationService');
const airtimeWalletAuditService = require('../services/airtimeWalletAuditService');

describe('airtimeWalletAuditService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('finds completed airtime debits with zero balance impact as repair candidates', async () => {
    walletReconciliationService.buildUserReport.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'user@test.com' },
      wallet: { balance: 500 },
      summary: { driftFromLedger: 100 },
      discrepancies: [],
      transactions: {
        walletLedger: [
          {
            id: 'txn-1',
            source: 'airtime_purchase',
            type: 'debit',
            status: 'completed',
            amount: 100,
            balance_before: 500,
            balance_after: 500,
            reference: 'AIR-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            metadata: {},
          },
        ],
        orphanLedger: [],
      },
    });

    const result = await airtimeWalletAuditService.listRepairCandidatesForUser('user-1');

    expect(result.ok).toBe(true);
    expect(result.drift).toBe(100);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].reference).toBe('AIR-1');
    expect(result.selection.matched).toBe(true);
    expect(result.selection.total).toBe(100);
  });

  it('repairs matched missing deductions and persists a correction report', async () => {
    const originalTxn = {
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };

    Wallet.findAll.mockResolvedValue([{ userId: 'user-1' }]);
    walletReconciliationService.buildUserReport.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'user@test.com' },
      wallet: { balance: 500 },
      summary: { driftFromLedger: 100 },
      discrepancies: [],
      transactions: {
        walletLedger: [
          {
            id: 'txn-1',
            source: 'airtime_purchase',
            type: 'debit',
            status: 'completed',
            amount: 100,
            balance_before: 500,
            balance_after: 500,
            reference: 'AIR-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            metadata: {},
          },
        ],
        orphanLedger: [],
      },
    });
    User.findByPk.mockResolvedValue({ id: 'user-1' });
    walletService.generateReference.mockReturnValue('AIRFIX-123');
    walletService.adminAdjust.mockResolvedValue({
      txn: {
        balance_after: 400,
      },
    });
    Transaction.findAll.mockResolvedValue([originalTxn]);

    const result = await airtimeWalletAuditService.runAudit({
      repair: true,
      adminId: 'admin-1',
    });

    expect(sequelize.transaction).toHaveBeenCalled();
    expect(walletService.adminAdjust).toHaveBeenCalledWith(
      { id: 'user-1' },
      -100,
      'airtime_purchase',
      'Repair missing wallet deduction for completed airtime purchase',
      expect.objectContaining({
        reference: 'AIRFIX-123',
        kind: 'airtime_missing_wallet_deduction_repair',
        corrected_references: ['AIR-1'],
        corrected_user_id: 'user-1',
      }),
      expect.any(Object),
    );
    expect(originalTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          repair: expect.objectContaining({
            correctedByReference: 'AIRFIX-123',
            correctedByAdminId: 'admin-1',
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(SystemSetting.set).toHaveBeenCalledTimes(2);
    expect(result.summary.correctedUsers).toBe(1);
    expect(result.summary.correctedTransactions).toBe(1);
    expect(result.correctedTransactions[0]).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        amount: 100,
        repairReference: 'AIRFIX-123',
      }),
    );
  });
});
