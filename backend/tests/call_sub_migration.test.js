const crypto = require('crypto');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const CallPlan = require('../models/CallPlan');
const VoiceBundle = require('../models/VoiceBundle');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const callSubLifecycleService = require('../services/callSubLifecycleService');
const callSubMigrationService = require('../services/callSubMigrationService');

describe('Call sub legacy validity migration', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await VoiceBundle.sync();
    await VoiceBundlePurchase.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await VoiceBundle.destroy({ where: {} });
  });

  const createUserAndWallet = async () => {
    const user = await User.create({
      name: 'Migration User',
      email: `migration_${Date.now()}@test.com`,
      phone: `0803${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 10000, status: 'active' });
    return { user, wallet };
  };

  it('computes corrected expiry rules for public minute bundles', () => {
    expect(callSubLifecycleService.hasIncorrectPublicExpiry('airtel')).toHaveLength(0);
    const ten = callSubLifecycleService.getPublicBundleByCode('airtel', 'ATM-120-10M');
    const twenty = callSubLifecycleService.getPublicBundleByCode('airtel', 'ATM-230-20M');
    const thirty = callSubLifecycleService.getPublicBundleByCode('airtel', 'ATM-330-30M');
    const fifty = callSubLifecycleService.getPublicBundleByCode('airtel', 'ATM-700-50M');
    const oneFifty = callSubLifecycleService.getPublicBundleByCode('airtel', 'ATM-2000-150M-30D');

    expect(ten.validityDays).toBe(3);
    expect(twenty.validityDays).toBe(7);
    expect(thirty.validityDays).toBe(7);
    expect(fifty.validityDays).toBe(14);
    expect(oneFifty.validityDays).toBe(30);
  });

  it('migrates active legacy validity purchases into prorated minute credits and deactivates legacy rows', async () => {
    const now = new Date('2026-04-18T12:00:00.000Z');
    const createdAt = new Date('2026-04-17T00:00:00.000Z');
    const naturalExpiry = new Date('2026-04-20T00:00:00.000Z');
    const { user, wallet } = await createUserAndWallet();
    const callPlan = await CallPlan.findOne({ where: { provider: 'airtel', api_plan_id: 'ATM-120-10M' } });
    const transaction = await Transaction.create({
      type: 'debit',
      amount: 100,
      balance_before: 10000,
      balance_after: 9900,
      source: 'airtime_purchase',
      provider: 'airtel',
      recipient_phone: user.phone,
      reference: `TX-${crypto.randomUUID()}`,
      description: 'Legacy validity bundle source transaction',
      status: 'completed',
      userId: user.id,
      walletId: wallet.id,
    });

    await VoiceBundle.create({
      network: 'airtel',
      plan_name: 'Legacy Validity Bundle',
      amount: 100,
      validity: '3 days',
      api_plan_id: 'TM100',
      is_active: true,
    });

    const sourcePurchase = await VoiceBundlePurchase.create({
      reference: `SRC-${crypto.randomUUID()}`,
      userId: user.id,
      callPlanId: callPlan.id,
      transactionId: transaction.id,
      provider: 'airtel',
      recipientPhoneNumber: user.phone,
      amountCharged: 100,
      minutes: 0,
      validityDays: 3,
      apiPlanId: 'ATM-100-3D',
      status: 'completed',
      bundleCategory: 'legacy_validity',
      expiresAt: naturalExpiry,
      metadata: {},
      createdAt,
      updatedAt: createdAt,
    });

    const result = await callSubMigrationService.migrateActiveLegacyValidityBundles('airtel', { migrationAt: now });

    expect(result.migrated).toBe(1);
    const migrated = await VoiceBundlePurchase.findOne({ where: { migratedFromPurchaseId: sourcePurchase.id } });
    expect(migrated).toBeTruthy();
    expect(migrated.bundleCategory).toBe('migrated_credit');
    expect(migrated.minutes).toBe(5);
    expect(Number(migrated.amountCharged)).toBe(0);
    expect(new Date(migrated.expiresAt).toISOString()).toBe(naturalExpiry.toISOString());

    const refreshedSource = await VoiceBundlePurchase.findByPk(sourcePurchase.id);
    expect(refreshedSource.metadata?.migration?.status).toBe('migrated');

    const legacyVoiceBundle = await VoiceBundle.findOne({ where: { api_plan_id: 'TM100' } });
    expect(legacyVoiceBundle.is_active).toBe(false);

    const snapshot = await callSubMigrationService.buildMonitoringSnapshot('airtel');
    expect(snapshot.invalidPublicExpiryCount).toBe(0);
    expect(snapshot.unmigratedActiveLegacyCount).toBe(0);
  });

  it('skips expired legacy validity purchases', async () => {
    const now = new Date('2026-04-18T12:00:00.000Z');
    const createdAt = new Date('2026-04-10T00:00:00.000Z');
    const expiredAt = new Date('2026-04-13T00:00:00.000Z');
    const { user, wallet } = await createUserAndWallet();
    const callPlan = await CallPlan.findOne({ where: { provider: 'airtel', api_plan_id: 'ATM-120-10M' } });
    const transaction = await Transaction.create({
      type: 'debit',
      amount: 100,
      balance_before: 10000,
      balance_after: 9900,
      source: 'airtime_purchase',
      provider: 'airtel',
      recipient_phone: user.phone,
      reference: `TX-${crypto.randomUUID()}`,
      description: 'Expired legacy validity source transaction',
      status: 'completed',
      userId: user.id,
      walletId: wallet.id,
    });

    await VoiceBundlePurchase.create({
      reference: `EXP-${crypto.randomUUID()}`,
      userId: user.id,
      callPlanId: callPlan.id,
      transactionId: transaction.id,
      provider: 'airtel',
      recipientPhoneNumber: user.phone,
      amountCharged: 100,
      minutes: 0,
      validityDays: 3,
      apiPlanId: 'ATM-100-3D',
      status: 'completed',
      bundleCategory: 'legacy_validity',
      expiresAt: expiredAt,
      metadata: {},
      createdAt,
      updatedAt: createdAt,
    });

    const result = await callSubMigrationService.migrateActiveLegacyValidityBundles('airtel', { migrationAt: now });

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    const migrated = await VoiceBundlePurchase.count({ where: { bundleCategory: 'migrated_credit' } });
    expect(migrated).toBe(0);
  });
});
