const { connectDB, User, Wallet, Referral, SystemSetting } = require('../config/db');
const referralService = require('../services/referralService');
const walletService = require('../services/walletService');
const { Op } = require('sequelize');

describe('Referral & Referee Qualifying Deposit System', () => {
  let referrer;
  let referee;
  const suffix = Date.now();

  beforeAll(async () => {
    await connectDB();

    // Ensure referral settings
    await SystemSetting.upsert({ key: 'referral_bonus_amount', value: '100' });
    await SystemSetting.upsert({ key: 'referee_bonus_amount', value: '50' });
    await SystemSetting.upsert({ key: 'referral_qualifying_deposit_min', value: '100' });

    // Create referrer
    referrer = await User.create({
      name: 'Referrer User',
      email: `referrer-${suffix}@test.com`,
      phone: `080${String(suffix).slice(-8)}`,
      password: 'password123',
      referral_code: `REF_${suffix}`,
    });
    // Wallet is auto-created by User afterCreate hook; ensure bonus is 0
    await Wallet.update(
      { balance: 0, bonus_balance: 0 },
      { where: { userId: referrer.id } }
    );

    // Create referee
    referee = await User.create({
      name: 'Referee User',
      email: `referee-${suffix}@test.com`,
      phone: `081${String(suffix).slice(-8)}`,
      password: 'password123',
      referral_code: `REF2_${suffix}`,
    });
    await Wallet.update(
      { balance: 0, bonus_balance: 0 },
      { where: { userId: referee.id } }
    );
  });

  afterAll(async () => {
    if (referrer && referee) {
      await Referral.destroy({
        where: {
          [Op.or]: [{ referrerId: referrer.id }, { referredUserId: referee.id }],
        },
        force: true,
      });
      await Wallet.destroy({
        where: { userId: [referrer.id, referee.id] },
        force: true,
      });
      await User.destroy({
        where: { id: [referrer.id, referee.id] },
        force: true,
      });
    }
  });

  it('rejects self-referrals', async () => {
    const res = await referralService.recordReferralSignup(referrer, referrer);
    expect(res.recorded).toBe(false);
    expect(res.reason).toBe('self_referral_disallowed');
  });

  it('creates referral record with status PENDING and no bonuses awarded upon signup', async () => {
    const result = await referralService.recordReferralSignup(referrer, referee);
    expect(result.recorded).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.referralId).toBeTruthy();

    const refRecord = await Referral.findByPk(result.referralId);
    expect(refRecord.status).toBe('pending');
    expect(refRecord.qualifying_deposit_amount).toBeNull();

    // Verify referrer bonus is still 0
    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    expect(Number(referrerWallet.bonus_balance)).toBe(0);

    // Verify referee bonus is still 0
    const refereeWallet = await Wallet.findOne({ where: { userId: referee.id } });
    expect(Number(refereeWallet.bonus_balance)).toBe(0);
  });

  it('does NOT award bonus on deposit below qualifying threshold (₦50 < ₦100)', async () => {
    const checkResult = await referralService.checkAndRewardQualifyingDeposit(
      referee,
      50,
      { id: 'test-txn-1' }
    );

    expect(checkResult.rewarded).toBe(false);
    expect(checkResult.reason).toBe('below_qualifying_threshold');

    // Referral remains pending
    const refRecord = await Referral.findOne({ where: { referredUserId: referee.id } });
    expect(refRecord.status).toBe('pending');

    // Wallets remain 0
    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    expect(Number(referrerWallet.bonus_balance)).toBe(0);
  });

  it('awards bonus atomically when qualifying deposit threshold is reached (₦200 >= ₦100)', async () => {
    const checkResult = await referralService.checkAndRewardQualifyingDeposit(
      referee,
      200,
      { id: 'test-txn-qualifying' }
    );

    expect(checkResult.rewarded).toBe(true);
    expect(checkResult.referrerBonusAmount).toBe(100);
    expect(checkResult.refereeBonusAmount).toBe(50);

    // Verify referral record updated
    const refRecord = await Referral.findOne({ where: { referredUserId: referee.id } });
    expect(refRecord.status).toBe('rewarded');
    expect(Number(refRecord.qualifying_deposit_amount)).toBe(200);
    expect(refRecord.qualifying_transaction_id).toBe('test-txn-qualifying');
    expect(refRecord.qualifying_deposit_at).toBeTruthy();

    // Verify referrer received ₦100 bonus
    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    expect(Number(referrerWallet.bonus_balance)).toBe(100);

    // Verify referee received ₦50 bonus
    const refereeWallet = await Wallet.findOne({ where: { userId: referee.id } });
    expect(Number(refereeWallet.bonus_balance)).toBe(50);
  });

  it('does NOT double-reward on subsequent deposits (idempotency)', async () => {
    const secondDeposit = await referralService.checkAndRewardQualifyingDeposit(
      referee,
      1000,
      { id: 'test-txn-second' }
    );

    expect(secondDeposit.rewarded).toBe(false);
    expect(secondDeposit.reason).toBe('no_pending_qualifying_referral');

    // Wallets remain at previous amounts (no extra payout)
    const referrerWallet = await Wallet.findOne({ where: { userId: referrer.id } });
    expect(Number(referrerWallet.bonus_balance)).toBe(100);

    const refereeWallet = await Wallet.findOne({ where: { userId: referee.id } });
    expect(Number(refereeWallet.bonus_balance)).toBe(50);
  });
});
