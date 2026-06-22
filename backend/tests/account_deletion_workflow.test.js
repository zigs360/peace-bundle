const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const app = require('../server');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const AccountDeletionRequest = require('../models/AccountDeletionRequest');
const AccountDeletionAudit = require('../models/AccountDeletionAudit');

function authHeader(user) {
  return `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`;
}

async function makeUser(label, role = 'user') {
  const password = await bcrypt.hash('password123', 4);
  return User.create({
    name: `${label} user`,
    email: `${label}-${Date.now()}@account-deletion-test.com`,
    phone: `080${String(Date.now()).slice(-8)}`,
    password,
    role,
  });
}

describe('Account deletion workflow', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
    await connectDB();
  });

  afterEach(async () => {
    await AccountDeletionAudit.destroy({ where: {}, force: true, paranoid: false });
    await AccountDeletionRequest.destroy({ where: {}, force: true, paranoid: false });
    await User.destroy({
      where: {
        email: { [Op.like]: '%@account-deletion-test.com' },
      },
      force: true,
      paranoid: false,
    });
  });

  it('allows a user to submit and cancel a deletion request during the grace period', async () => {
    const user = await makeUser('cancel-flow');

    const verificationRes = await request(app)
      .post('/api/users/account-deletion/verification')
      .set('Authorization', authHeader(user));

    expect(verificationRes.statusCode).toBe(200);
    expect(verificationRes.body.success).toBe(true);

    const refreshedUser = await User.findByPk(user.id);
    const meta = refreshedUser.metadata || {};
    await refreshedUser.update({
      metadata: {
        ...meta,
        accountDeletionVerification: {
          ...(meta.accountDeletionVerification || {}),
          hash: crypto.createHash('sha256').update('654321').digest('hex'),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      },
    });

    const submitRes = await request(app)
      .post('/api/users/account-deletion/request')
      .set('Authorization', authHeader(user))
      .send({
        verificationCode: '654321',
        reason: 'I no longer need the service',
        confirmPermanentDeletion: true,
        acknowledgeRetentionPolicy: true,
      });

    expect(submitRes.statusCode).toBe(201);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.status).toBe('pending');
    expect(submitRes.body.data.canCancel).toBe(true);

    const duplicateRes = await request(app)
      .post('/api/users/account-deletion/request')
      .set('Authorization', authHeader(user))
      .send({
        verificationCode: '654321',
        confirmPermanentDeletion: true,
        acknowledgeRetentionPolicy: true,
      });

    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.body.code).toBe('ACCOUNT_DELETION_DUPLICATE_REQUEST');

    const cancelRes = await request(app)
      .post('/api/users/account-deletion/cancel')
      .set('Authorization', authHeader(user));

    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('cancelled');

    const storedRequest = await AccountDeletionRequest.findOne({ where: { userId: user.id } });
    expect(storedRequest.status).toBe('cancelled');
  });

  it('blocks non-admin users from accessing the admin deletion queue', async () => {
    const user = await makeUser('queue-user');

    const res = await request(app)
      .get('/api/admin/account-deletion/requests')
      .set('Authorization', authHeader(user));

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Not authorized as an admin');
  });

  it('allows an admin to approve and execute a deletion request after the grace period', async () => {
    const user = await makeUser('execute-user');
    const adminUser = await makeUser('execute-admin', 'admin');

    const deletionRequest = await AccountDeletionRequest.create({
      userId: user.id,
      status: 'pending',
      requestedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      graceEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      requestReason: 'Please delete my account',
      retentionAcknowledged: true,
      metadata: {},
    });

    const queueRes = await request(app)
      .get('/api/admin/account-deletion/requests')
      .set('Authorization', authHeader(adminUser));

    expect(queueRes.statusCode).toBe(200);
    expect(queueRes.body.rows.some((row) => row.id === deletionRequest.id)).toBe(true);

    const approveRes = await request(app)
      .post(`/api/admin/account-deletion/requests/${deletionRequest.id}/approve`)
      .set('Authorization', authHeader(adminUser))
      .send({ reason: 'Grace period elapsed and identity verified' });

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    const executeRes = await request(app)
      .post(`/api/admin/account-deletion/requests/${deletionRequest.id}/execute`)
      .set('Authorization', authHeader(adminUser))
      .send({ reason: 'Executing approved irreversible deletion' });

    expect(executeRes.statusCode).toBe(200);
    expect(executeRes.body.success).toBe(true);

    const deletedUser = await User.findByPk(user.id, { paranoid: false });
    expect(deletedUser).toBeNull();

    const completedRequest = await AccountDeletionRequest.findByPk(deletionRequest.id);
    expect(completedRequest.status).toBe('completed');
    expect(completedRequest.userId).toBeNull();

    const audits = await AccountDeletionAudit.findAll({
      where: { requestId: deletionRequest.id },
      order: [['createdAt', 'ASC']],
    });
    expect(audits.some((entry) => entry.eventType === 'request_approved')).toBe(true);
    expect(audits.some((entry) => entry.eventType === 'deletion_executed')).toBe(true);
  });

  it('prevents admin review before the grace period has elapsed', async () => {
    const user = await makeUser('grace-user');
    const adminUser = await makeUser('grace-admin', 'admin');
    const deletionRequest = await AccountDeletionRequest.create({
      userId: user.id,
      status: 'pending',
      requestedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      retentionAcknowledged: true,
      metadata: {},
    });

    const approveRes = await request(app)
      .post(`/api/admin/account-deletion/requests/${deletionRequest.id}/approve`)
      .set('Authorization', authHeader(adminUser))
      .send({ reason: 'Too early' });

    expect(approveRes.statusCode).toBe(409);
    expect(approveRes.body.code).toBe('ACCOUNT_DELETION_GRACE_PERIOD_ACTIVE');
  });
});
