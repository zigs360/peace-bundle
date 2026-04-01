const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction } = require('../models');

describe('Admin funding pending review', () => {
  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';
  });

  it('approves a pending_review funding transaction and credits wallet exactly once', async () => {
    const adminUser = await User.create({
      name: 'Admin Reviewer',
      email: `admin_reviewer_${Date.now()}@test.com`,
      phone: '08011008810',
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const user = await User.create({
      name: 'Pending Review User',
      email: `pending_review_${Date.now()}@test.com`,
      phone: '08011008811',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      metadata: { mock_bvn_status: 'mock' },
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const balanceBefore = parseFloat(wallet.balance);

    const pending = await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'credit',
      amount: 2000,
      balance_before: balanceBefore,
      balance_after: balanceBefore,
      source: 'funding',
      reference: `PENDING-REF-${Date.now()}`,
      description: 'Held funding',
      metadata: { review_status: 'pending_review', review_reason: 'mock_bvn_cap' },
      status: 'pending',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post(`/api/admin/funding/pending-review/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(balanceBefore + 2000);

    const updatedTxn = await Transaction.findByPk(pending.id);
    expect(updatedTxn.status).toBe('completed');
    expect(updatedTxn.metadata.review_status).toBe('approved');

    const res2 = await request(app)
      .post(`/api/admin/funding/pending-review/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res2.statusCode).toBe(200);
  });

  it('rejects a pending_review funding transaction without crediting wallet', async () => {
    const adminUser = await User.create({
      name: 'Admin Reviewer 2',
      email: `admin_reviewer2_${Date.now()}@test.com`,
      phone: '08011008812',
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    const user = await User.create({
      name: 'Pending Review User 2',
      email: `pending_review2_${Date.now()}@test.com`,
      phone: '08011008813',
      password: 'password123',
      role: 'user',
      account_status: 'active',
      metadata: { mock_bvn_status: 'mock' },
    });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    const balanceBefore = parseFloat(wallet.balance);

    const pending = await Transaction.create({
      walletId: wallet.id,
      userId: user.id,
      type: 'credit',
      amount: 1500,
      balance_before: balanceBefore,
      balance_after: balanceBefore,
      source: 'funding',
      reference: `PENDING-REF-${Date.now()}`,
      description: 'Held funding',
      metadata: { review_status: 'pending_review', review_reason: 'mock_bvn_velocity' },
      status: 'pending',
    });

    const token = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post(`/api/admin/funding/pending-review/${pending.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
    expect(parseFloat(walletAfter.balance)).toBe(balanceBefore);

    const updatedTxn = await Transaction.findByPk(pending.id);
    expect(updatedTxn.status).toBe('failed');
    expect(updatedTxn.metadata.review_status).toBe('rejected');
  });
});
