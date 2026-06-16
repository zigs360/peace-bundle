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
}));
jest.mock('../models/Commission', () => ({}));
jest.mock('../models/Referral', () => ({ findOne: jest.fn() }));
jest.mock('../models/SystemSetting', () => ({}));
jest.mock('../models/DataPlan', () => ({}));
jest.mock('../models/Sim', () => ({}));

jest.mock('../services/walletService', () => ({
  debit: jest.fn(),
  getBalance: jest.fn(),
}));

jest.mock('../services/pricingService', () => ({
  quoteAirtime: jest.fn(),
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
}));

jest.mock('../services/transactionIntegrityService', () => ({
  findDuplicateByReference: jest.fn(),
  buildFingerprint: jest.fn(),
  findLikelyDuplicate: jest.fn(),
  annotateDebitTransaction: jest.fn(),
  selectAirtimeRoute: jest.fn(),
  lockRoute: jest.fn(),
  failAndRefund: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  sendTransactionNotification: jest.fn(),
  sendSMS: jest.fn(),
}));

const sequelize = require('../config/database');
const User = require('../models/User');
const walletService = require('../services/walletService');
const pricingService = require('../services/pricingService');
const transactionLimitService = require('../services/transactionLimitService');
const simManagementService = require('../services/simManagementService');
const dataPurchaseService = require('../services/dataPurchaseService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const { buyAirtime } = require('../controllers/transactionController');

describe('Airtime false-success guard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refunds and returns 502 when provider result does not confirm completion and txn is not queued', async () => {
    const t = { commit: jest.fn(), rollback: jest.fn(), finished: null };
    sequelize.transaction.mockResolvedValueOnce(t);

    const user = { id: 'user-1', role: 'user' };
    User.findByPk.mockResolvedValueOnce(user);

    transactionLimitService.canTransact.mockResolvedValueOnce({ allowed: true });
    pricingService.quoteAirtime.mockResolvedValueOnce({ total: 100 });
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

    walletService.debit.mockResolvedValueOnce(newTxn);
    walletService.getBalance.mockResolvedValue(670);

    transactionIntegrityService.selectAirtimeRoute.mockReturnValue({ fulfillmentRoute: 'ogdams_api', simId: null });
    transactionIntegrityService.lockRoute.mockResolvedValueOnce({});
    simManagementService.getOptimalSim.mockResolvedValueOnce(null);

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
    expect(t.commit).toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
