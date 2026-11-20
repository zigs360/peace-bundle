const { connectDB, User, Wallet, Transaction, Referral } = require('../config/db');
const referralService = require('../services/referralService');
const walletService = require('../services/walletService');

describe('Referral Main Balance Crediting & Reconciliation Test', () => {
  let referrerUser, refereeUser;
  let referrerWallet, refereeWallet;
  const suffix = Date.now();

  beforeAll(async () => {
    await connectDB();

    referrerUser = await User.create({
      name: `MainBal Referrer ${suffix}`,
      email: `mainbal_referrer_${suffix}@test.com`,
      phone: `0802${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
      referral_code: `MBAL${suffix}`
    });
    referrerWallet = await walletService.ensureWallet(referrerUser);

    refereeUser = await User.create({
      name: `MainBal Referee ${suffix}`,
      email: `mainbal_referee_${suffix}@test.com`,
      phone: `0807${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
      referred_by: `MBAL${suffix}`
    });
    refereeWallet = await walletService.ensureWallet(refereeUser);
    await referralService.recordReferralSignup(referrerUser, refereeUser);
  });

  it('credits both wallet.balance and bonus_balance upon qualifying deposit', async () => {
    await referrerWallet.reload();
    const initBalance = parseFloat(referrerWallet.balance || 0);

    // Fund referee with qualifying deposit
    const depTx = await walletService.credit(refereeUser, 500, 'funding', 'Deposit');
    const result = await referralService.checkAndRewardQualifyingDeposit(refereeUser, 500, depTx);

    expect(result.rewarded).toBe(true);
    expect(result.referrerBonusAmount).toBe(100);

    // Verify referrer's main balance increased by ₦100
    await referrerWallet.reload();
    expect(parseFloat(referrerWallet.balance)).toBe(initBalance + 100);
    expect(parseFloat(referrerWallet.bonus_balance)).toBe(100);

    // Verify transaction record has main balance recorded
    const bonusTx = await Transaction.findOne({
      where: { userId: referrerUser.id, source: 'bonus', status: 'completed' }
    });
    expect(bonusTx).toBeDefined();
    expect(parseFloat(bonusTx.amount)).toBe(100);
    expect(parseFloat(bonusTx.balance_after)).toBe(initBalance + 100);
    expect(bonusTx.metadata?.credited_to_main_balance).toBe(true);
  });

  it('reconciles historical uncredited bonus transactions to main balance', async () => {
    // Create a user with a simulated uncredited bonus transaction
    const testUser = await User.create({
      name: `Uncredited User ${suffix}`,
      email: `uncredited_${suffix}@test.com`,
      phone: `0811${String(suffix).slice(-7)}`,
      password: 'password123',
      role: 'user',
    });
    const testWallet = await walletService.ensureWallet(testUser);
    const startBal = parseFloat(testWallet.balance || 0);

    // Create an old-style bonus transaction without credited_to_main_balance
    await Transaction.create({
      id: require('crypto').randomUUID(),
      userId: testUser.id,
      walletId: testWallet.id,
      type: 'credit',
      amount: 150,
      balance_before: 0,
      balance_after: 150,
      source: 'bonus',
      status: 'completed',
      reference: `HIST-${suffix}`,
      description: 'Historical referral bonus',
      metadata: { kind: 'referrer_vtu_bonus' }, // missing credited_to_main_balance
      completed_at: new Date(),
    });

    // Run reconciliation
    const rec = await referralService.reconcileUncreditedBonusBalances(testUser.id);
    expect(rec.reconciled).toBe(true);
    expect(rec.amount).toBe(150);

    // Verify main balance was credited
    await testWallet.reload();
    expect(parseFloat(testWallet.balance)).toBe(startBal + 150);

    // Running again should be idempotent (no-op)
    const secondRec = await referralService.reconcileUncreditedBonusBalances(testUser.id);
    expect(secondRec.reconciled).toBe(false);
  });
});
