jest.mock('../config/database', () => ({
  transaction: jest.fn(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } })),
}));

jest.mock('../models/Transaction', () => ({
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
}));

jest.mock('../models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../models/SystemSetting', () => ({
  set: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../services/walletService', () => ({
  adminAdjust: jest.fn(),
  generateReference: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

const sequelize = require('../config/database');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const walletService = require('../services/walletService');
const airtimeFalseRefundAuditService = require('../services/airtimeFalseRefundAuditService');

describe('airtimeFalseRefundAuditService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('flags refunded airtime transactions that contain success-like Ogdams attempts', async () => {
    Transaction.findAll.mockResolvedValue([
      {
        id: 'txn-1',
        userId: 'user-1',
        source: 'airtime_purchase',
        type: 'debit',
        status: 'refunded',
        amount: 100,
        reference: 'AIR-REF-1',
        refund_reference: 'RFND-1',
        failure_reason: 'fallback failed',
        metadata: {
          provider_attempts: [
            {
              provider: 'ogdams',
              status: true,
              http_status: 200,
              request_reference: 'OGD-1',
            },
          ],
        },
      },
    ]);
    Transaction.findOne.mockResolvedValue({
      id: 'refund-1',
      reference: 'RFND-1',
      metadata: {},
    });

    const result = await airtimeFalseRefundAuditService.runAudit({ repair: false });

    expect(result.success).toBe(true);
    expect(result.matchedTransactions).toBe(1);
    expect(result.report[0]).toEqual(
      expect.objectContaining({
        originalReference: 'AIR-REF-1',
        refundReference: 'RFND-1',
        repaired: false,
      }),
    );
    expect(SystemSetting.set).toHaveBeenCalledTimes(1);
  });

  it('repairs historical false refunds by re-debiting the wallet and annotating both transactions', async () => {
    const originalTxn = {
      id: 'txn-2',
      userId: 'user-2',
      source: 'airtime_purchase',
      type: 'debit',
      status: 'refunded',
      amount: 100,
      reference: 'AIR-REF-2',
      refund_reference: 'RFND-2',
      failure_reason: 'SMEPlug fallback should not run',
      completed_at: null,
      metadata: {
        provider_attempts: [
          {
            provider: 'ogdams',
            status: true,
            http_status: 200,
            request_reference: 'OGD-2',
          },
        ],
      },
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };
    const refundTxn = {
      id: 'refund-2',
      reference: 'RFND-2',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };

    Transaction.findAll.mockResolvedValue([originalTxn]);
    Transaction.findOne.mockResolvedValue(refundTxn);
    Transaction.findByPk.mockImplementation(async (id) => {
      if (id === 'txn-2') return originalTxn;
      if (id === 'refund-2') return refundTxn;
      return null;
    });
    User.findByPk.mockResolvedValue({ id: 'user-2' });
    walletService.generateReference.mockReturnValue('AIRRFIX-123');
    walletService.adminAdjust.mockResolvedValue({
      txn: {
        amount: 100,
        balance_after: 900,
      },
    });

    const result = await airtimeFalseRefundAuditService.runAudit({
      repair: true,
      adminId: 'admin-1',
    });

    expect(sequelize.transaction).toHaveBeenCalled();
    expect(walletService.adminAdjust).toHaveBeenCalledWith(
      { id: 'user-2' },
      -100,
      'airtime_purchase',
      'Correct improper airtime refund after confirmed provider success',
      expect.objectContaining({
        reference: 'AIRRFIX-123',
        kind: 'airtime_false_refund_repair',
        corrected_reference: 'AIR-REF-2',
        corrected_refund_reference: 'RFND-2',
        admin_id: 'admin-1',
      }),
      expect.any(Object),
    );
    expect(originalTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        failure_reason: null,
        metadata: expect.objectContaining({
          false_refund_reconciliation: expect.objectContaining({
            correctedByReference: 'AIRRFIX-123',
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(refundTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          false_refund_reconciliation: expect.objectContaining({
            correctedByReference: 'AIRRFIX-123',
            originalReference: 'AIR-REF-2',
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(result.correctedTransactions).toBe(1);
    expect(result.corrected[0]).toEqual(
      expect.objectContaining({
        originalReference: 'AIR-REF-2',
        refundReference: 'RFND-2',
        correctionReference: 'AIRRFIX-123',
      }),
    );
  });
});
