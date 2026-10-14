const { connectDB } = require('../config/db');
const serviceControlService = require('../services/serviceControlService');
const SystemSetting = require('../models/SystemSetting');

describe('8 Independent Service Controls', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    // Reset all service settings to true for clean slate
    const keys = [
      'service_mtn_data_enabled',
      'service_mtn_airtime_enabled',
      'service_airtel_data_enabled',
      'service_airtel_airtime_enabled',
      'service_glo_data_enabled',
      'service_glo_airtime_enabled',
      'service_9mobile_data_enabled',
      'service_9mobile_airtime_enabled',
      'data_service_enabled',
      'airtime_service_enabled',
    ];
    for (const key of keys) {
      await SystemSetting.upsert({ key, value: 'true' });
    }
  });

  it('reports all 8 independent switches in getAllServiceStatuses', async () => {
    const statuses = await serviceControlService.getAllServiceStatuses();
    expect(statuses).toHaveProperty('data');
    expect(statuses).toHaveProperty('airtime');
    expect(statuses).toHaveProperty('master');

    // 4 Data switches
    expect(statuses.data).toHaveProperty('mtn');
    expect(statuses.data).toHaveProperty('airtel');
    expect(statuses.data).toHaveProperty('glo');
    expect(statuses.data).toHaveProperty('9mobile');

    // 4 Airtime switches
    expect(statuses.airtime).toHaveProperty('mtn');
    expect(statuses.airtime).toHaveProperty('airtel');
    expect(statuses.airtime).toHaveProperty('glo');
    expect(statuses.airtime).toHaveProperty('9mobile');
  });

  it('toggles MTN Data OFF without affecting MTN Airtime or other networks', async () => {
    // Turn MTN Data OFF
    await serviceControlService.toggleService('data', 'mtn', false, { id: 'test-admin', email: 'admin@test.com' });

    const mtnData = await serviceControlService.isServiceEnabled('data', 'mtn');
    const mtnAirtime = await serviceControlService.isServiceEnabled('airtime', 'mtn');
    const gloData = await serviceControlService.isServiceEnabled('data', 'glo');
    const airtelAirtime = await serviceControlService.isServiceEnabled('airtime', 'airtel');

    expect(mtnData).toBe(false);
    expect(mtnAirtime).toBe(true);
    expect(gloData).toBe(true);
    expect(airtelAirtime).toBe(true);

    // assertServiceAvailable throws 403 on disabled service
    await expect(
      serviceControlService.assertServiceAvailable('data', 'mtn')
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    // assertServiceAvailable succeeds on enabled services
    await expect(
      serviceControlService.assertServiceAvailable('airtime', 'mtn')
    ).resolves.not.toThrow();

    await expect(
      serviceControlService.assertServiceAvailable('data', 'glo')
    ).resolves.not.toThrow();
  });

  it('restores MTN Data back to ON', async () => {
    await serviceControlService.toggleService('data', 'mtn', true, { id: 'test-admin', email: 'admin@test.com' });

    const mtnData = await serviceControlService.isServiceEnabled('data', 'mtn');
    expect(mtnData).toBe(true);

    await expect(
      serviceControlService.assertServiceAvailable('data', 'mtn')
    ).resolves.not.toThrow();
  });

  it('handles canonical provider aliases (e.g. 9mobile and t2)', async () => {
    await serviceControlService.toggleService('airtime', '9mobile', false, { id: 'test-admin', email: 'admin@test.com' });

    const is9mEnabled = await serviceControlService.isServiceEnabled('airtime', '9mobile');
    const isT2Enabled = await serviceControlService.isServiceEnabled('airtime', 't2');

    expect(is9mEnabled).toBe(false);
    expect(isT2Enabled).toBe(false);

    // Re-enable via alias 't2'
    await serviceControlService.toggleService('airtime', 't2', true, { id: 'test-admin', email: 'admin@test.com' });

    const is9mRestored = await serviceControlService.isServiceEnabled('airtime', '9mobile');
    expect(is9mRestored).toBe(true);
  });
});
