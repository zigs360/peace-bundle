const dataPurchaseService = require('../services/dataPurchaseService');
const ogdamsService = require('../services/ogdamsService');
const smeplugService = require('../services/smeplugService');
const simManagementService = require('../services/simManagementService');
const transactionIntegrityService = require('../services/transactionIntegrityService');
const ogdamsFailoverService = require('../services/ogdamsFailoverService');

describe('Airtime Ogdams insufficient balance handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    ogdamsFailoverService.getStore().status = 'healthy';
    ogdamsFailoverService.getStore().activeReason = null;
    ogdamsFailoverService.getStore().openUntil = 0;
    ogdamsFailoverService.getStore().lastFailureAt = null;
    ogdamsFailoverService.getStore().lastSuccessAt = null;
    ogdamsFailoverService.getStore().lastFailureMeta = null;
  });

  it('falls back to SMEPlug when Ogdams returns insufficient balance', async () => {
    const transaction = {
      id: 'txn-1',
      reference: 'WLT-TEST-1',
      provider: 'mtn',
      recipient_phone: '08012012012',
      fulfillment_route: 'ogdams_api',
      payment_channel: 'ogdams_wallet',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };

    const ogErr = new Error('Insufficient balance');
    ogErr.statusCode = 424;
    ogErr.code = 'OGDAMS_INSUFFICIENT_BALANCE';

    jest.spyOn(ogdamsService, 'purchaseAirtime').mockRejectedValueOnce(ogErr);
    const optimalSim = { id: 'sim-1', phoneNumber: '08030000000', provider: 'mtn' };
    jest.spyOn(simManagementService, 'getOptimalSim').mockResolvedValueOnce(optimalSim);
    const simProcessSpy = jest.spyOn(simManagementService, 'processTransaction').mockResolvedValueOnce({
      success: true,
      reference: 'SIM-1',
      details: { status: 'success' },
      platform: 'smeplug',
    });
    const smeplugSpy = jest.spyOn(smeplugService, 'purchaseVTU');
    const failAndRefundSpy = jest.spyOn(transactionIntegrityService, 'failAndRefund').mockImplementation(async (txn, reason) => {
      txn.status = 'refunded';
      txn.failure_reason = reason;
      return txn;
    });
    const successSpy = jest.spyOn(transactionIntegrityService, 'markProviderSuccess').mockImplementation(async (txn, payload) => {
      txn.status = 'completed';
      txn.smeplug_reference = payload.providerReference;
      txn.smeplug_response = payload.response;
      return txn;
    });
    const markFailureSpy = jest.spyOn(ogdamsFailoverService, 'markFailure').mockResolvedValue({
      active: true,
      reason: 'insufficient_balance',
      status: 'failedover',
    });

    const result = await dataPurchaseService.dispenseAirtimeWithFallback(
      transaction,
      { network: 'mtn', amount: 100, phoneNumber: '08012012012' },
      { endpoint: 'test' },
      null,
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'smeplug',
        switched: true,
      }),
    );
    expect(markFailureSpy).toHaveBeenCalledWith(
      'insufficient_balance',
      expect.objectContaining({
        reference: 'WLT-TEST-1',
      }),
    );
    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(failAndRefundSpy).not.toHaveBeenCalled();
    expect(simProcessSpy).toHaveBeenCalledTimes(1);
    expect(smeplugSpy).not.toHaveBeenCalled();
    expect(transaction.status).toBe('completed');
    expect(transaction.simId).toBe('sim-1');
  });

  it('bypasses Ogdams completely while failover is active', async () => {
    const store = ogdamsFailoverService.getStore();
    store.status = 'failedover';
    store.activeReason = 'insufficient_balance';
    store.openUntil = Date.now() + 60_000;

    const transaction = {
      id: 'txn-2',
      reference: 'WLT-TEST-2',
      provider: 'mtn',
      recipient_phone: '08012012012',
      fulfillment_route: 'ogdams_api',
      payment_channel: 'ogdams_wallet',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };

    const ogSpy = jest.spyOn(ogdamsService, 'purchaseAirtime');
    jest.spyOn(simManagementService, 'getOptimalSim').mockResolvedValueOnce(null);
    const smeplugSpy = jest.spyOn(smeplugService, 'purchaseVTU').mockResolvedValueOnce({
      success: true,
      data: { reference: 'SME-2', status: 'success' },
    });
    jest.spyOn(transactionIntegrityService, 'markProviderSuccess').mockImplementation(async (txn, payload) => {
      txn.status = 'completed';
      txn.smeplug_reference = payload.providerReference;
      txn.smeplug_response = payload.response;
      return txn;
    });

    const result = await dataPurchaseService.dispenseAirtimeWithFallback(
      transaction,
      { network: 'mtn', amount: 100, phoneNumber: '08012012012' },
      { endpoint: 'test' },
      null,
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'smeplug',
        switched: true,
      }),
    );
    expect(ogSpy).not.toHaveBeenCalled();
    expect(smeplugSpy).toHaveBeenCalledTimes(1);
    expect(transaction.status).toBe('completed');
  });

  it('falls back to SMEPlug wallet mode when no usable SMEPlug SIM route is available', async () => {
    const transaction = {
      id: 'txn-3',
      reference: 'WLT-TEST-3',
      provider: 'mtn',
      recipient_phone: '08012012012',
      fulfillment_route: 'ogdams_api',
      payment_channel: 'ogdams_wallet',
      metadata: {},
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
    };

    const ogErr = new Error('Insufficient balance');
    ogErr.statusCode = 424;
    ogErr.code = 'OGDAMS_INSUFFICIENT_BALANCE';

    jest.spyOn(ogdamsService, 'purchaseAirtime').mockRejectedValueOnce(ogErr);
    jest.spyOn(simManagementService, 'getOptimalSim').mockResolvedValueOnce(null);
    const smeplugSpy = jest.spyOn(smeplugService, 'purchaseVTU').mockResolvedValueOnce({
      success: true,
      data: { reference: 'SME-3', status: 'success' },
    });
    jest.spyOn(transactionIntegrityService, 'markProviderSuccess').mockImplementation(async (txn, payload) => {
      txn.status = 'completed';
      txn.smeplug_reference = payload.providerReference;
      txn.smeplug_response = payload.response;
      return txn;
    });
    jest.spyOn(ogdamsFailoverService, 'markFailure').mockResolvedValue({
      active: true,
      reason: 'insufficient_balance',
      status: 'failedover',
    });

    const result = await dataPurchaseService.dispenseAirtimeWithFallback(
      transaction,
      { network: 'mtn', amount: 100, phoneNumber: '08012012012' },
      { endpoint: 'test' },
      null,
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'smeplug',
        switched: true,
      }),
    );
    expect(smeplugSpy).toHaveBeenCalledTimes(1);
    expect(transaction.status).toBe('completed');
  });

  it('clears failover after a healthy Ogdams success', async () => {
    const store = ogdamsFailoverService.getStore();
    store.status = 'failedover';
    store.activeReason = 'unavailable';
    store.openUntil = Date.now() + 60_000;
    jest.spyOn(ogdamsFailoverService, 'notifyAdmins').mockResolvedValue({ ok: true, alerted: false });

    await ogdamsFailoverService.markHealthy({ source: 'test' });

    const snapshot = ogdamsFailoverService.getSnapshot();
    expect(snapshot.active).toBe(false);
    expect(snapshot.reason).toBe(null);
    expect(snapshot.status).toBe('healthy');
  });
});
