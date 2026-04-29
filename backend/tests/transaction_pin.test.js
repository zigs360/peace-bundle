const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { connectDB, User } = require('../config/db');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const TransactionPinSecurityEvent = require('../models/TransactionPinSecurityEvent');

describe('transaction PIN system', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    await connectDB();
  });

  beforeEach(async () => {
    await TransactionPinSecurityEvent.destroy({ where: {} });
    await Transaction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  const makeUser = async (emailPrefix = 'pin_user', role = 'user') => {
    const hashed = await bcrypt.hash('password123', 4);
    const user = await User.create({
      name: 'PIN User',
      email: `${emailPrefix}_${Date.now()}@test.com`,
      phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      password: hashed,
      role,
      account_status: 'active',
      bvn: `${Math.floor(10000000000 + Math.random() * 89999999999)}`,
    });
    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    await wallet.update({ balance: 50000, status: 'active', daily_limit: 99999999, daily_spent: 0 });
    return user;
  };

  const authHeader = (user) => `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`;

  it('creates a hashed 4-digit transaction PIN', async () => {
    const user = await makeUser('pin_create');

    const res = await request(app)
      .post('/api/auth/transaction-pin')
      .set('Authorization', authHeader(user))
      .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.transaction_pin_hash).toBeTruthy();
    expect(refreshedUser.transaction_pin_hash).not.toBe('4826');
    expect(refreshedUser.transaction_pin_failed_attempts).toBe(0);
  });

  it('issues a short-lived session token for a valid PIN and enforces it on debit routes', async () => {
    const user = await makeUser('pin_session');

    await request(app)
      .post('/api/auth/transaction-pin')
      .set('Authorization', authHeader(user))
      .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

    const noPinRes = await request(app)
      .post('/api/transactions/result-checker')
      .set('Authorization', authHeader(user))
      .send({ examType: 'WAEC', quantity: 1 });

    expect(noPinRes.statusCode).toBe(403);
    expect(noPinRes.body.code).toBe('TRANSACTION_PIN_REQUIRED');

    const sessionRes = await request(app)
      .post('/api/auth/transaction-pin/session')
      .set('Authorization', authHeader(user))
      .send({ pin: '4826', scope: 'financial' });

    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.body.data.token).toBeTruthy();

    const successRes = await request(app)
      .post('/api/transactions/result-checker')
      .set('Authorization', authHeader(user))
      .set('x-transaction-pin-token', sessionRes.body.data.token)
      .send({ examType: 'WAEC', quantity: 1 });

    expect(successRes.statusCode).toBe(200);
    expect(successRes.body.success).toBe(true);
  });

  it('locks the transaction PIN after repeated failed attempts', async () => {
    const user = await makeUser('pin_lock');

    await request(app)
      .post('/api/auth/transaction-pin')
      .set('Authorization', authHeader(user))
      .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/transaction-pin/session')
        .set('Authorization', authHeader(user))
        .send({ pin: '1111', scope: 'financial' });

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('TRANSACTION_PIN_INVALID');
    }

    const lockedRes = await request(app)
      .post('/api/auth/transaction-pin/session')
      .set('Authorization', authHeader(user))
      .send({ pin: '1111', scope: 'financial' });

    expect(lockedRes.statusCode).toBe(429);
    expect(lockedRes.body.code).toBe('TRANSACTION_PIN_LOCKED');
  });

  it('recovers the PIN after password and OTP verification', async () => {
    const user = await makeUser('pin_recover');

    await request(app)
      .post('/api/auth/transaction-pin')
      .set('Authorization', authHeader(user))
      .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

    const otpRequestRes = await request(app)
      .post('/api/auth/transaction-pin/recovery/otp')
      .set('Authorization', authHeader(user))
      .send({});

    expect(otpRequestRes.statusCode).toBe(200);
    expect(otpRequestRes.body.success).toBe(true);

    const refreshedBeforeRecover = await User.findByPk(user.id);
    expect(refreshedBeforeRecover.transaction_pin_recovery_otp_hash).toBeTruthy();

    const recoveryRes = await request(app)
      .post('/api/auth/transaction-pin/recover')
      .set('Authorization', authHeader(user))
      .send({
        password: 'password123',
        otp: '000000',
        newPin: '5937',
        confirmPin: '5937',
      });

    expect(recoveryRes.statusCode).toBe(401);
    expect(recoveryRes.body.code).toBe('TRANSACTION_PIN_RECOVERY_OTP_INVALID');

    const userWithKnownOtp = await User.findByPk(user.id);
    await userWithKnownOtp.update({
      transaction_pin_recovery_otp_hash: require('crypto').createHash('sha256').update('654321').digest('hex'),
      transaction_pin_recovery_otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      transaction_pin_recovery_otp_sent_at: new Date(),
    });

    const validRecoveryRes = await request(app)
      .post('/api/auth/transaction-pin/recover')
      .set('Authorization', authHeader(user))
      .send({
        password: 'password123',
        otp: '654321',
        newPin: '5937',
        confirmPin: '5937',
      });

    expect(validRecoveryRes.statusCode).toBe(200);
    expect(validRecoveryRes.body.success).toBe(true);

    const refreshedAfterRecover = await User.findByPk(user.id);
    expect(refreshedAfterRecover.transaction_pin_recovery_otp_hash).toBeNull();

    const recoveryEvents = await TransactionPinSecurityEvent.findAll({ where: { userId: user.id } });
    expect(recoveryEvents.some((event) => event.eventType === 'pin_recovery_otp_requested')).toBe(true);
    expect(recoveryEvents.some((event) => event.eventType === 'pin_recovered')).toBe(true);

    const sessionRes = await request(app)
      .post('/api/auth/transaction-pin/session')
      .set('Authorization', authHeader(user))
      .send({ pin: '5937', scope: 'financial' });

    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.body.data.token).toBeTruthy();
  });

  it('allows admins to view PIN security audit events', async () => {
    const user = await makeUser('pin_audit_user');
    const admin = await makeUser('pin_audit_admin', 'admin');

    await request(app)
      .post('/api/auth/transaction-pin')
      .set('Authorization', authHeader(user))
      .send({ password: 'password123', pin: '4826', confirmPin: '4826' });

    await request(app)
      .post('/api/auth/transaction-pin/session')
      .set('Authorization', authHeader(user))
      .send({ pin: '1111', scope: 'financial' });

    const res = await request(app)
      .get('/api/admin/audit/transaction-pin-events')
      .set('Authorization', authHeader(admin));

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.some((event) => event.userId === user.id)).toBe(true);
  });
});
