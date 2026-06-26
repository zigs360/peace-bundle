const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = require('../server');
const { connectDB, User, Wallet, Transaction, WalletTransaction, Sim } = require('../config/db');

const seedUser = async () => {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await User.create({
    name: 'Upload Tester',
    email: `upload-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`,
    password: passwordHash,
    phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    role: 'admin',
    account_status: 'active',
  });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'test_jwt_secret', { expiresIn: '1h' });
  const [wallet] = await Wallet.findOrCreate({ where: { userId: user.id }, defaults: { balance: 0 } });
  await wallet.update({ balance: 1000, daily_limit: 999999, daily_spent: 0, status: 'active' });
  return { user, token };
};

const tryDeleteUpload = (avatarPath) => {
  if (!avatarPath) return;
  const normalized = String(avatarPath).replace(/^\/+/, '');
  const absolute = path.join(__dirname, '..', normalized);
  try {
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  } catch (_) {}
};

describe('Profile photo upload', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    const users = await User.findAll({ limit: 50 });
    for (const u of users) {
      tryDeleteUpload(u.avatar);
    }
    await Transaction.destroy({ where: {}, force: true });
    await WalletTransaction.destroy({ where: {}, force: true });
    await Sim.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
  });

  it('accepts JPG and updates the avatar URL', async () => {
    const { token } = await seedUser();
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .field('fullName', 'Upload Tester Updated')
      .attach('avatar', jpg, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.statusCode).toBe(200);
    expect(res.body.avatar).toMatch(/^uploads\\//);
  });

  it('accepts WebP and does not reject it as an invalid file type', async () => {
    const { token } = await seedUser();
    const webp = Buffer.from(
      'RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x2f\x00\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25\xa4\x00\x03\x70\x00\xfe\xfb\xfd\x50',
      'binary',
    );

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .field('fullName', 'Upload Tester Updated')
      .attach('avatar', webp, { filename: 'avatar.webp', contentType: 'image/webp' });

    expect(res.statusCode).toBe(200);
    expect(res.body.avatar).toMatch(/^uploads\\//);
  });

  it('rejects unsupported file types with a clear 400 response', async () => {
    const { token } = await seedUser();
    const txt = Buffer.from('not-an-image');

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .field('fullName', 'Upload Tester Updated')
      .attach('avatar', txt, { filename: 'avatar.txt', contentType: 'text/plain' });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.message || '')).toMatch(/jpg|png|gif|webp/i);
  });

  it('rejects files larger than 5MB with a 413 response', async () => {
    const { token } = await seedUser();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .field('fullName', 'Upload Tester Updated')
      .attach('avatar', oversized, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.statusCode).toBe(413);
    expect(String(res.body.message || '')).toMatch(/5mb/i);
  });
});

