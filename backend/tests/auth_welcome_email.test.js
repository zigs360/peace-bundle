const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../server');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const welcomeEmailService = require('../services/welcomeEmailService');

describe('Welcome Email Flow', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    await connectDB();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await User.destroy({ where: { email: { [Op.like]: '%@welcome.test' } } });
  });

  it('sends a personalized welcome email only after successful registration', async () => {
    const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail').mockResolvedValue({
      success: true,
      messageId: 'welcome-message-id',
    });

    const userData = {
      name: 'Welcome User',
      email: `welcome_${Date.now()}@welcome.test`,
      password: 'Password123!',
      phone: `080${String(Date.now()).slice(-8)}`,
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    expect(res.body.message).toBe('Registration successful');

    for (let i = 0; i < 10 && sendEmailSpy.mock.calls.length === 0; i += 1) {
      // Wait for the async welcome-email dispatch kicked off after success.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const [to, subject, text, html, options] = sendEmailSpy.mock.calls[0];
    expect(to).toBe(userData.email.toLowerCase());
    expect(subject).toMatch(/welcome to peace bundle/i);
    expect(text).toContain(userData.name);
    expect(text).toContain('Getting started:');
    expect(text).toContain('Key features:');
    expect(html).toContain('Manage communication preferences');
    expect(options.headers['List-Unsubscribe']).toContain('/contact');

    const savedUser = await User.findOne({ where: { email: userData.email.toLowerCase() } });
    expect(savedUser.metadata?.welcomeEmail?.status).toBe('sent');
    expect(savedUser.metadata?.welcomeEmail?.attempts).toBe(1);
    expect(savedUser.metadata?.welcomeEmail?.sentAt).toBeTruthy();
    expect(new Date(savedUser.metadata.welcomeEmail.sentAt).getTime() - new Date(savedUser.createdAt).getTime()).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('does not send the welcome email when registration fails', async () => {
    const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail');

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Incomplete User',
        email: 'not-an-email',
        phone: '08012345678',
        password: 'Password123!',
      })
      .expect(400);

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('retries failed welcome email delivery and logs permanent failures without duplicating notifications', async () => {
    const user = await User.create({
      name: 'Retry Welcome User',
      email: `retry_${Date.now()}@welcome.test`,
      phone: `081${String(Date.now()).slice(-8)}`,
      password: 'hashed-password-placeholder',
      role: 'user',
    });

    const sendEmailSpy = jest.spyOn(notificationService, 'sendEmail')
      .mockResolvedValueOnce({ success: false, reason: 'smtp_timeout' })
      .mockResolvedValueOnce({ success: false, reason: 'smtp_timeout' })
      .mockResolvedValueOnce({ success: true, messageId: 'retry-success-id' });

    const successResult = await welcomeEmailService.sendWelcomeEmailForUser(user.id);
    expect(successResult.success).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalledTimes(3);

    const refreshed = await User.findByPk(user.id);
    expect(refreshed.metadata?.welcomeEmail?.status).toBe('sent');
    expect(refreshed.metadata?.welcomeEmail?.attempts).toBe(3);

    const dedupeResult = await welcomeEmailService.sendWelcomeEmailForUser(user.id);
    expect(dedupeResult.skipped).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalledTimes(3);

    const permanentFailureUser = await User.create({
      name: 'Permanent Failure User',
      email: `permanent_${Date.now()}@welcome.test`,
      phone: `082${String(Date.now()).slice(-8)}`,
      password: 'hashed-password-placeholder',
      role: 'user',
    });

    const logSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    sendEmailSpy.mockReset();
    sendEmailSpy
      .mockResolvedValueOnce({ success: false, reason: 'smtp_down' })
      .mockResolvedValueOnce({ success: false, reason: 'smtp_down' })
      .mockResolvedValueOnce({ success: false, reason: 'smtp_down' });

    const failureResult = await welcomeEmailService.sendWelcomeEmailForUser(permanentFailureUser.id);
    expect(failureResult.success).toBe(false);
    expect(sendEmailSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      '[Auth] Welcome email permanently failed',
      expect.objectContaining({
        userId: permanentFailureUser.id,
        attempts: 3,
      }),
    );

    const failedUser = await User.findByPk(permanentFailureUser.id);
    expect(failedUser.metadata?.welcomeEmail?.status).toBe('failed');
  });
});
