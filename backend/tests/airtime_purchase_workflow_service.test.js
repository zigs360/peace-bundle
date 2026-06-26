jest.mock('../config/database', () => ({
  transaction: jest.fn(),
}));

jest.mock('../models/Transaction', () => ({
  findOne: jest.fn(),
}));

jest.mock('../services/walletService', () => ({
  generateReference: jest.fn(),
  debit: jest.fn(),
}));

jest.mock('../services/pricingService', () => ({
  quoteAirtime: jest.fn(),
}));

jest.mock('../services/transactionIntegrityService', () => ({
  buildFingerprint: jest.fn(),
  findLikelyDuplicate: jest.fn(),
  annotateDebitTransaction: jest.fn(),
  selectAirtimeRoute: jest.fn(),
  lockRoute: jest.fn(),
}));

jest.mock('../services/simManagementService', () => ({
  getOptimalSim: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const sequelize = require('../config/database');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const pricingService = require('../services/pricingService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const simManagementService = require('../services/simManagementService');
const logger = require('../utils/logger');
const airtimePurchaseWorkflowService = require('../services/airtimePurchaseWorkflowService');

describe('airtimePurchaseWorkflowService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('retries retryable wallet debit preparation failures and succeeds once the database call recovers', async () => {
    const user = { id: 'user-1' };
    const transactionRecord = {
      id: 'txn-1',
      reference: 'AIRTIME-123',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
      save: jest.fn(async function save() {
        return this;
      }),
    };

    walletService.generateReference.mockReturnValue('AIRTIME-123');
    pricingService.quoteAirtime.mockResolvedValue({ charged_amount: 100 });
    transactionIntegrityService.buildFingerprint.mockReturnValue('fp-1');
    transactionIntegrityService.findLikelyDuplicate.mockResolvedValue(null);
    walletService.debit.mockResolvedValue(transactionRecord);
    transactionIntegrityService.annotateDebitTransaction.mockResolvedValue(transactionRecord);
    simManagementService.getOptimalSim.mockResolvedValue(null);
    transactionIntegrityService.selectAirtimeRoute.mockReturnValue({
      paymentChannel: 'wallet',
      fulfillmentRoute: 'ogdams_api',
      provider: 'mtn',
      simId: null,
    });
    transactionIntegrityService.lockRoute.mockResolvedValue(transactionRecord);
    Transaction.findOne.mockResolvedValue(null);
    jest.spyOn(Math, 'random').mockReturnValue(0);

    let attempts = 0;
    sequelize.transaction.mockImplementation(async (work) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('connection acquire timeout');
        error.name = 'SequelizeTimeoutError';
        throw error;
      }
      return work({ LOCK: { UPDATE: 'UPDATE' } });
    });

    const result = await airtimePurchaseWorkflowService.prepareCommittedPurchase(user, {
      network: 'mtn',
      faceValue: 100,
      phone: '08105880201',
    });

    expect(result.duplicate).toBe(false);
    expect(result.reference).toBe('AIRTIME-123');
    expect(result.transaction).toBe(transactionRecord);
    expect(sequelize.transaction).toHaveBeenCalledTimes(2);
    expect(walletService.debit).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[Airtime][WalletDebit] Attempt failed',
      expect.objectContaining({
        userId: 'user-1',
        reference: 'AIRTIME-123',
        retryable: true,
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[Airtime][WalletDebit] Scheduling retry',
      expect.objectContaining({
        userId: 'user-1',
        reference: 'AIRTIME-123',
      }),
    );
  });

  it('recovers an existing transaction after a failed attempt to keep wallet deductions idempotent', async () => {
    const user = { id: 'user-2' };
    const existing = {
      id: 'txn-existing',
      reference: 'AIRTIME-EXISTING',
      amount: 100,
      status: 'processing',
      provider: 'mtn',
      metadata: {
        charged_amount: 100,
        pricing: { charged_amount: 100 },
        transaction_fingerprint: 'fp-existing',
      },
    };

    sequelize.transaction.mockImplementation(async () => {
      const error = new Error('deadlock detected');
      error.name = 'SequelizeDatabaseError';
      error.original = { code: '40P01' };
      throw error;
    });
    Transaction.findOne.mockResolvedValue(existing);

    const result = await airtimePurchaseWorkflowService.prepareCommittedPurchase(user, {
      network: 'mtn',
      faceValue: 100,
      phone: '08105880201',
      reference: 'AIRTIME-EXISTING',
    });

    expect(result.duplicate).toBe(true);
    expect(result.transaction).toBe(existing);
    expect(result.reference).toBe('AIRTIME-EXISTING');
    expect(walletService.debit).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[Airtime][WalletDebit] Recovered existing transaction after failed attempt',
      expect.objectContaining({
        userId: 'user-2',
        reference: 'AIRTIME-EXISTING',
        status: 'processing',
      }),
    );
  });
});
