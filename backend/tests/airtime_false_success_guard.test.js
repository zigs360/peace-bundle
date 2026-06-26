jest.mock('../config/database', () => ({
  transaction: jest.fn(),
  define: jest.fn(),
}));

jest.mock('../models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../models/Wallet', () => ({}));
jest.mock('../models/Transaction', () => ({
  findOne: jest.fn(),
  findByPk: jest.fn(),
}));
jest.mock('../models/Commission', () => ({}));
jest.mock('../models/Referral', () => ({ findOne: jest.fn() }));
jest.mock('../models/SystemSetting', () => ({}));
jest.mock('../models/DataPlan', () => ({
  findByPk: jest.fn(),
}));
jest.mock('../models/Sim', () => ({}));

jest.mock('../services/walletService', () => ({
  debit: jest.fn(),
  getBalance: jest.fn(),
}));

jest.mock('../services/pricingService', () => ({
  quoteAirtime: jest.fn(),
  quoteDataPlan: jest.fn(),
}));

jest.mock('../services/transactionLimitService', () => ({
  canTransact: jest.fn(),
}));

jest.mock('../services/affiliateService', () => ({}));
jest.mock('../services/paymentGatewayService', () => ({}));
jest.mock('../services/billPaymentService', () => ({}));

jest.mock('../services/simManagementService', () => ({
  getOptimalSim: jest.fn(),
}));

jest.mock('../services/dataPurchaseService', () => ({
  dispenseAirtimeWithFallback: jest.fn(),
  dispenseData: jest.fn(),
}));

jest.mock('../services/airtimePurchaseWorkflowService', () => ({
  prepareCommittedPurchase: jest.fn(),
}));

jest.mock('../services/transactionIntegrityService', () => ({
  findDuplicateByReference: jest.fn(),
  buildFingerprint: jest.fn(),
  findLikelyDuplicate: jest.fn(),
  annotateDebitTransaction: jest.fn(),
  selectAirtimeRoute: jest.fn(),
  selectDataRoute: jest.fn(),
  lockRoute: jest.fn(),
  failAndRefund: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  sendTransactionNotification: jest.fn(),
  sendSMS: jest.fn(),
}));

jest.mock('../services/notificationRealtimeService', () => ({
  sendToUser: jest.fn(),
  emitToUser: jest.fn(),
}));

const sequelize = require('../config/database');
const DataPlan = require('../models/DataPlan');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const walletService = require('../services/walletService');
const pricingService = require('../services/pricingService');
const transactionLimitService = require('../services/transactionLimitService');
const simManagementService = require('../services/simManagementService');
const dataPurchaseService = require('../services/dataPurchaseService');
const airtimePurchaseWorkflowService = require('../services/airtimePurchaseWorkflowService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const { buyAirtime, buyData } = require('../controllers/transactionController');

describe('Airtime false-success guard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refunds and returns 502 when provider result does not confirm completion and txn is not queued', async () => {
    const user = { id: 'user-1', role: 'user' };
    User.findByPk.mockResolvedValueOnce(user);

    transactionLimitService.canTransact.mockResolvedValueOnce({ allowed: true });
    pricingService.quoteAirtime.mockResolvedValueOnce({ charged_amount: 100 });
    transactionIntegrityService.findDuplicateByReference.mockResolvedValueOnce(null);
    transactionIntegrityService.buildFingerprint.mockReturnValueOnce('fp-1');
    transactionIntegrityService.findLikelyDuplicate.mockResolvedValueOnce(null);

    const newTxn = {
      id: 'txn-1',
      reference: 'WLT-TEST-FALSE-SUCCESS',
      status: 'initiated',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
      save: jest.fn(async function save() { return this; }),
    };

    airtimePurchaseWorkflowService.prepareCommittedPurchase.mockResolvedValueOnce({
      duplicate: false,
      transaction: newTxn,
      chargedAmount: 100,
    });
    walletService.getBalance.mockResolvedValue(670);
    Transaction.findByPk.mockImplementation(async () => newTxn);
    dataPurchaseService.dispenseAirtimeWithFallback.mockResolvedValueOnce({ provider: 'smeplug' });
    transactionIntegrityService.failAndRefund.mockImplementationOnce(async (txn) => {
      txn.status = 'refunded';
      return txn;
    });

    const req = {
      user: { id: user.id },
      body: { network: 'mtn', phone: '08105880201', amount: 100 },
      headers: {},
    };

    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await buyAirtime(req, res);

    expect(transactionIntegrityService.failAndRefund).toHaveBeenCalled();
    expect(airtimePurchaseWorkflowService.prepareCommittedPurchase).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        network: 'mtn',
        faceValue: 100,
        phone: '08105880201',
      }),
    );
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it('does not trigger a second refund when the provider flow already marked the transaction refunded', async () => {
    const user = { id: 'user-2', role: 'user' };
    User.findByPk.mockResolvedValueOnce(user);

    transactionLimitService.canTransact.mockResolvedValueOnce({ allowed: true });
    pricingService.quoteAirtime.mockResolvedValueOnce({ charged_amount: 100 });
    transactionIntegrityService.findDuplicateByReference.mockResolvedValueOnce(null);
    transactionIntegrityService.buildFingerprint.mockReturnValueOnce('fp-2');
    transactionIntegrityService.findLikelyDuplicate.mockResolvedValueOnce(null);

    const newTxn = {
      id: 'txn-2',
      reference: 'WLT-TEST-ALREADY-REFUNDED',
      status: 'initiated',
      failure_reason: 'Momo integration not configured',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
      save: jest.fn(async function save() { return this; }),
    };

    airtimePurchaseWorkflowService.prepareCommittedPurchase.mockResolvedValueOnce({
      duplicate: false,
      transaction: newTxn,
      chargedAmount: 100,
    });
    walletService.getBalance.mockResolvedValue(570);
    dataPurchaseService.dispenseAirtimeWithFallback.mockImplementationOnce(async (txn) => {
      txn.status = 'refunded';
      txn.failure_reason = 'Momo integration not configured';
      return { provider: 'smeplug', failed: true };
    });
    Transaction.findByPk.mockImplementation(async () => newTxn);

    const req = {
      user: { id: user.id },
      body: { network: 'mtn', phone: '08105880201', amount: 100 },
      headers: {},
    };

    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await buyAirtime(req, res);

    expect(transactionIntegrityService.failAndRefund).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).toMatch(/momo integration not configured/i);
  });

  it('refunds and returns 502 when data provider flow does not confirm completion', async () => {
    const t = { commit: jest.fn(), rollback: jest.fn(), finished: null };
    sequelize.transaction.mockResolvedValueOnce(t);

    const user = { id: 'user-3', role: 'user' };
    const plan = {
      id: 11,
      provider: 'mtn',
      is_active: true,
      wallet_price: 95,
      original_price: 100,
      api_cost: 95,
      name: '1GB',
      getPriceForUser: jest.fn().mockResolvedValue(95),
    };

    User.findByPk.mockResolvedValueOnce(user);
    DataPlan.findByPk.mockResolvedValueOnce(plan);
    transactionLimitService.canTransact.mockResolvedValueOnce({ allowed: true });
    transactionIntegrityService.buildFingerprint.mockReturnValueOnce('fp-data-1');
    transactionIntegrityService.findLikelyDuplicate.mockResolvedValueOnce(null);
    pricingService.quoteDataPlan.mockResolvedValueOnce({ charged_amount: 95 });
    simManagementService.getOptimalSimForData = jest.fn().mockResolvedValueOnce(null);
    transactionIntegrityService.selectDataRoute.mockReturnValue({ fulfillmentRoute: 'smeplug_api', simId: null });

    const newTxn = {
      id: 'txn-data-1',
      reference: 'DATA-TEST-FALSE-SUCCESS',
      status: 'initiated',
      metadata: {},
      save: jest.fn(async function save() { return this; }),
    };

    walletService.debit.mockResolvedValueOnce(newTxn);
    walletService.getBalance.mockResolvedValue(5000);
    dataPurchaseService.dispenseData.mockImplementationOnce(async () => {});
    transactionIntegrityService.failAndRefund.mockImplementationOnce(async (txn) => {
      txn.status = 'refunded';
      txn.failure_reason = 'Data provider did not confirm success';
      return txn;
    });

    const req = {
      user: { id: user.id },
      body: { network: 'mtn', phone: '08105880201', amount: 95, planId: 11 },
      headers: {},
    };

    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await buyData(req, res);

    expect(transactionIntegrityService.failAndRefund).toHaveBeenCalledWith(
      newTxn,
      'Data provider did not confirm success',
      t,
      expect.objectContaining({
        auditEvent: 'data_delivery_inconsistent_success',
      }),
    );
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
