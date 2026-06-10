const request = require('supertest');
const app = require('../server');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

function extractResetToken(message) {
  const match = String(message || '').match(/reset-password\?token=([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

describe('Password Reset Flow', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await User.destroy({ where: { email: { [require('sequelize').Op.like]: '%@reset.test' } } });
  });

  it('completes the full reset flow and invalidates the token after use', async () => {
    const userData = {
      name: 'Reset User',
      email: `reset_${Date.now()}@reset.test`,
      password: 'Password123!',
      phone: `080${String(Date.now()).slice(-8)}`,
    };

    await request(app).post('/api/auth/register').send(userData).expect(201);

    const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({
      success: true,
      messageId: 'password-reset-test',
    });

    const requestRes = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: userData.email })
      .expect(200);

    expect(requestRes.body.message).toMatch(/password reset link will be sent shortly/i);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    const sentArgs = sendEmailSpy.mock.calls[0];
    const emailText = sentArgs[2];
    const emailHtml = sentArgs[3];
    const resetToken = extractResetToken(emailText) || extractResetToken(emailHtml);
    expect(resetToken).toBeTruthy();

    const userAfterRequest = await User.findOne({ where: { email: userData.email } });
    expect(userAfterRequest.metadata?.passwordReset?.tokenHash).toBeTruthy();
    expect(userAfterRequest.metadata?.passwordReset?.tokenHash).not.toBe(resetToken);
    expect(userAfterRequest.metadata?.passwordReset?.status).toBe('unused');

    const validateRes = await request(app)
      .get('/api/auth/password-reset/validate')
      .query({ token: resetToken })
      .expect(200);

    expect(validateRes.body.success).toBe(true);

    const weakRes = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token: resetToken, newPassword: 'weakpass', confirmPassword: 'weakpass' })
      .expect(400);

    expect(weakRes.body.code).toBe('PASSWORD_TOO_WEAK');

    const completeRes = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({
        token: resetToken,
        newPassword: 'N3wP@ssword!',
        confirmPassword: 'N3wP@ssword!',
      })
      .expect(200);

    expect(completeRes.body.message).toMatch(/password has been reset successfully/i);

    const userAfterComplete = await User.findOne({ where: { email: userData.email } });
    expect(userAfterComplete.metadata?.passwordReset?.status).toBe('used');
    expect(userAfterComplete.metadata?.passwordReset?.usedAt).toBeTruthy();

    await request(app)
      .post('/api/auth/login')
      .send({ emailOrPhone: userData.email, password: userData.password })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ emailOrPhone: userData.email, password: 'N3wP@ssword!' })
      .expect(200);

    const reusedRes = await request(app)
      .get('/api/auth/password-reset/validate')
      .query({ token: resetToken })
      .expect(410);

    expect(reusedRes.body.code).toBe('PASSWORD_RESET_TOKEN_USED');
  });

  it('returns a generic success response for non-existent emails and enforces rate limits per email', async () => {
    const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail');
    const email = `missing_${Date.now()}@reset.test`;

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(200);
      expect(res.body.message).toMatch(/if an account exists/i);
    }

    const limited = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email })
      .expect(429);

    expect(limited.body.message).toMatch(/too many password reset requests/i);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('clears the active token state when email delivery fails', async () => {
    const userData = {
      name: 'Reset Delivery User',
      email: `delivery_${Date.now()}@reset.test`,
      password: 'Password123!',
      phone: `081${String(Date.now()).slice(-8)}`,
    };

    await request(app).post('/api/auth/register').send(userData).expect(201);
    jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({
      success: false,
      reason: 'smtp_not_configured',
    });

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: userData.email })
      .expect(200);

    expect(res.body.message).toMatch(/if you do not receive it, please try again later/i);

    const user = await User.findOne({ where: { email: userData.email } });
    expect(user.metadata?.passwordReset?.tokenHash).toBeNull();
    expect(user.metadata?.passwordReset?.expiresAt).toBeNull();
  });

  it('returns a development reset link when SMTP is not configured outside production', async () => {
    const userData = {
      name: 'Reset Dev Link User',
      email: `devlink_${Date.now()}@reset.test`,
      password: 'Password123!',
      phone: `082${String(Date.now()).slice(-8)}`,
    };

    await request(app).post('/api/auth/register').send(userData).expect(201);
    jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({
      success: false,
      reason: 'smtp_not_configured',
    });

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: userData.email })
      .expect(200);

    expect(res.body.message).toMatch(/development reset link/i);
    expect(res.body.devResetLink).toMatch(/reset-password\?token=/i);

    const user = await User.findOne({ where: { email: userData.email } });
    expect(user.metadata?.passwordReset?.tokenHash).toBeTruthy();
    expect(user.metadata?.passwordReset?.status).toBe('unused');
  });
});
