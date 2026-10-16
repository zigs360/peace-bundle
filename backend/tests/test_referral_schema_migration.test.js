const { connectDB, sequelize, Referral, User } = require('../config/db');
const referralService = require('../services/referralService');

describe('Referral Schema & Status Column Migration', () => {
  beforeAll(async () => {
    await connectDB();
  });

  it('ensures status and qualifying deposit columns exist and are queryable on Referral model', async () => {
    const qi = sequelize.getQueryInterface();
    const tableName = typeof Referral.getTableName === 'function' ? Referral.getTableName() : 'referrals';
    const desc = await qi.describeTable(tableName);

    expect(desc).toHaveProperty('status');
    expect(desc).toHaveProperty('qualifying_deposit_amount');
    expect(desc).toHaveProperty('qualifying_deposit_at');
    expect(desc).toHaveProperty('qualifying_transaction_id');
    expect(desc).toHaveProperty('referrer_signup_bonus_amount');
    expect(desc).toHaveProperty('referee_signup_bonus_amount');
  });

  it('creates and queries a Referral with status and qualifying deposit data without schema errors', async () => {
    const rand = Math.floor(Math.random() * 100000);
    const referrer = await User.create({
      name: `Ref Tester ${rand}`,
      email: `reftester_${rand}@test.com`,
      phone: `0809${String(rand).padStart(7, '0')}`,
      password: 'password123',
    });

    const referee = await User.create({
      name: `Ref Referee ${rand}`,
      email: `referee_${rand}@test.com`,
      phone: `0808${String(rand).padStart(7, '0')}`,
      password: 'password123',
    });

    const rec = await Referral.create({
      referrerId: referrer.id,
      referredUserId: referee.id,
      status: 'pending',
      total_commissions_earned: 0,
      total_transactions: 0,
    });

    expect(rec.id).toBeDefined();
    expect(rec.status).toBe('pending');

    await rec.update({
      status: 'rewarded',
      qualifying_deposit_amount: 500,
      qualifying_deposit_at: new Date(),
      qualifying_transaction_id: 'TXN-TEST-123',
    });

    const updated = await Referral.findByPk(rec.id);
    expect(updated.status).toBe('rewarded');
    expect(parseFloat(updated.qualifying_deposit_amount)).toBe(500);
    expect(updated.qualifying_transaction_id).toBe('TXN-TEST-123');
  });

  it('handles _ensureSchemaCompatibility gracefully without throwing', async () => {
    await expect(referralService._ensureSchemaCompatibility()).resolves.not.toThrow();
  });
});
