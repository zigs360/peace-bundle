const { connectDB, User } = require('../config/db');
const SystemSetting = require('../models/SystemSetting');
const virtualAccountService = require('../services/virtualAccountService');
const payvesselService = require('../services/payvesselService');

describe('Bulk assign missing virtual accounts', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'payvessel', 'string', 'api');
    await SystemSetting.set('allow_mock_bvn', true, 'boolean', 'api');
  });

  it('assigns provider virtual accounts to active users missing one', async () => {
    let seq = 0;
    const payvesselSpy = jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async (user) => {
      seq += 1;
      const accountNumber = String(6600000000 + seq);
      return {
        accountNumber,
        bankName: 'PALMPAY',
        accountName: user.name,
        trackingReference: `PV-${user.id}`,
      };
    });

    const createdUsers = [];
    for (let i = 0; i < 3; i++) {
      const user = await User.create({
        name: `Bulk VA User ${i}`,
        email: `bulk_va_${i}_${Date.now()}@test.com`,
        phone: `0801100111${i}`,
        password: 'password123',
        role: 'user',
        account_status: 'active',
      });
      createdUsers.push(user);
    }

    await User.create({
      name: 'Inactive VA User',
      email: `inactive_va_${Date.now()}@test.com`,
      phone: '08011001119',
      password: 'password123',
      role: 'user',
      account_status: 'suspended',
    });

    const summary = await virtualAccountService.bulkAssignMissingVirtualAccounts({
      batchSize: 2,
      maxUsers: 50,
      notify: false,
      includeInactive: false,
    });

    expect(payvesselSpy).toHaveBeenCalled();
    expect(summary.created).toBeGreaterThanOrEqual(3);
    expect(summary.failed).toBe(0);

    for (const u of createdUsers) {
      const updated = await User.findByPk(u.id);
      expect(updated.virtual_account_number).toMatch(/^\d{10}$/);
      expect(updated.virtual_account_bank).toBe('PALMPAY');
      expect(updated.virtual_account_name).toBe(updated.name);
      expect(updated.metadata?.va_provider).toBe('payvessel');
    }

    payvesselSpy.mockRestore();
  });

  it('continues processing even if one user fails (per-user transaction rollback)', async () => {
    const u1 = await User.create({
      name: 'Bulk Fail 1',
      email: `bulk_fail_1_${Date.now()}@test.com`,
      phone: '08011001221',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    const u2 = await User.create({
      name: 'Bulk Fail 2',
      email: `bulk_fail_2_${Date.now()}@test.com`,
      phone: '08011001222',
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });

    let seq = 0;
    const spy = jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async (user) => {
      if (user.id === u1.id) {
        throw new Error('Synthetic failure');
      }
      seq += 1;
      const accountNumber = String(6600000000 + seq);
      return {
        accountNumber,
        bankName: 'PALMPAY',
        accountName: user.name,
        trackingReference: `PV-${user.id}`,
      };
    });

    const summary = await virtualAccountService.bulkAssignMissingVirtualAccounts({
      batchSize: 10,
      maxUsers: 10,
      notify: false,
      includeInactive: false,
    });

    spy.mockRestore();

    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const after1 = await User.findByPk(u1.id);
    const after2 = await User.findByPk(u2.id);

    expect(after1.virtual_account_number).toBeNull();
    expect(after2.virtual_account_number).toBeTruthy();
  });
});
