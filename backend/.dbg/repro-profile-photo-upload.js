process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { connectDB, User, Wallet } = require('../config/db');

async function run() {
  await connectDB();

  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await User.create({
    name: 'Upload Tester',
    email: `upload-${Date.now()}@test.com`,
    password: passwordHash,
    phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    role: 'admin',
    account_status: 'active',
  });

  const [wallet] = await Wallet.findOrCreate({ where: { userId: user.id }, defaults: { balance: 0 } });
  await wallet.update({ balance: 1000, daily_limit: 999999, daily_spent: 0, status: 'active' });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const webp = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x2f\x00\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25\xa4\x00\x03\x70\x00\xfe\xfb\xfd\x50', 'binary');

  const resJpg = await request(app)
    .put('/api/auth/profile')
    .set('Authorization', `Bearer ${token}`)
    .field('fullName', 'Upload Tester Updated')
    .attach('avatar', jpg, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

  const resWebp = await request(app)
    .put('/api/auth/profile')
    .set('Authorization', `Bearer ${token}`)
    .field('fullName', 'Upload Tester Updated 2')
    .attach('avatar', webp, { filename: 'avatar.webp', contentType: 'image/webp' });

  process.stdout.write(
    `${JSON.stringify({ jpg: { status: resJpg.statusCode, body: resJpg.body }, webp: { status: resWebp.statusCode, body: resWebp.body } }, null, 2)}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${String(error && error.stack ? error.stack : error)}\n`);
  process.exitCode = 1;
});

