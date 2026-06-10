process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';

const path = require('path');
const fs = require('fs');
const jwt = require(path.resolve(__dirname, '../backend/node_modules/jsonwebtoken'));
const request = require(path.resolve(__dirname, '../backend/node_modules/supertest'));

const notificationService = require('../backend/services/notificationService');
const payvesselService = require('../backend/services/payvesselService');
const { connectDB, User } = require('../backend/config/db');
const app = require('../backend/server');

async function main() {
  const logFile = path.resolve(__dirname, 'trae-debug-log-manual-va-no-response.ndjson');
  try { fs.writeFileSync(logFile, ''); } catch (_) {}

  notificationService.sendTransactionNotification = async () => true;
  notificationService.sendSMS = async () => true;
  payvesselService.createVirtualAccount = async (user) => ({
    accountNumber: '1234567890',
    bankName: 'Mock Bank',
    accountName: user.name,
    trackingReference: `DBG-${user.id}`,
  });

  await connectDB();

  const admin = await User.create({
    name: `Admin ${Date.now()}`,
    email: `admin_retry_${Date.now()}@test.com`,
    phone: `080${String(Date.now()).slice(-8)}`,
    password: 'password123',
    role: 'admin',
    account_status: 'active',
  });

  const target = await User.create({
    name: `Target ${Date.now()}`,
    email: `target_retry_${Date.now()}@test.com`,
    phone: `081${String(Date.now()).slice(-8)}`,
    password: 'password123',
    role: 'user',
    account_status: 'active',
  });

  await target.update({
    virtual_account_number: null,
    virtual_account_bank: null,
    virtual_account_name: null,
    metadata: { va_status: 'pending' },
  });

  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
  const res = await request(app)
    .post(`/api/admin/users/${target.id}/virtual-account/retry`)
    .set('Authorization', `Bearer ${token}`)
    .send({});

  console.log(JSON.stringify({
    statusCode: res.statusCode,
    body: res.body,
    targetUserId: target.id,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
