const { connectDB, User } = require('../config/db');
const virtualAccountService = require('../services/virtualAccountService');
const payvesselService = require('../services/payvesselService');

describe('Virtual account migration', () => {
  beforeAll(async () => {
    await connectDB();
  });

  it('creates virtual accounts for legacy users without virtual accounts', async () => {
    jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async (user) => {
      return {
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountName: user.name,
        trackingReference: `TEST-REF-${user.id}`,
      };
    });

    const legacyUsers = [];
    for (let i = 1; i <= 3; i++) {
      const user = await User.create({
        name: `Legacy User ${i}`,
        email: `legacy${i}_${Date.now()}@test.com`,
        phone: `0800000000${i}`,
        password: 'password123',
        role: 'user',
        account_status: 'active',
      });
      legacyUsers.push(user);
    }

    const summary = await virtualAccountService.bulkMigrateLegacyUsers(10);
    expect(summary.total_found).toBeGreaterThanOrEqual(3);
    expect(summary.failed).toBe(0);

    for (const user of legacyUsers) {
      const updatedUser = await User.findByPk(user.id);
      expect(updatedUser.virtual_account_number).toBe('1234567890');
      expect(updatedUser.virtual_account_bank).toBe('Test Bank');
      expect(updatedUser.virtual_account_name).toBe(user.name);
    }
  });
});
