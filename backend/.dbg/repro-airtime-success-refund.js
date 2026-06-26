process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'debug_jwt_secret';
process.env.OGDAMS_STATUS_CHECK_ENABLED = 'false';

const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../server');
const { connectDB, User, Wallet, WalletTransaction, Transaction, Sim } = require('../config/db');
const ogdamsService = require('../services/ogdamsService');
const smeplugService = require('../services/smeplugService');

async function main() {
  await connectDB();

  jestLikeSpy(ogdamsService, 'purchaseAirtime', async ({ reference }) => ({
    status: true,
    httpStatus: 200,
    reference: `OGD-BOOL-${reference}`,
    delivery: { credited: true },
  }));
  jestLikeSpy(ogdamsService, 'checkAirtimeStatus', async () => null);
  jestLikeSpy(smeplugService, 'purchaseVTU', async () => ({
    success: false,
    status_code: 200,
    error: 'SMEPlug fallback should not run for boolean success payload',
  }));

  const email = `airtime-debug-${Date.now()}@test.com`;
  const password = await bcrypt.hash('password123', 4);
  const pinHash = await bcrypt.hash('1994', 4);

  const user = await User.create({
    name: 'Airtime Debug User',
    email,
    password,
    phone: `080${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    role: 'admin',
    account_status: 'active',
    transaction_pin_hash: pinHash,
  });

  const [wallet] = await Wallet.findOrCreate({
    where: { userId: user.id },
    defaults: { balance: 0 },
  });
  await wallet.update({ balance: 1000, daily_limit: 99999999, daily_spent: 0, status: 'active' });

  const agent = request.agent(app);

  const loginRes = await agent
    .post('/api/auth/login')
    .send({ emailOrPhone: email, password: 'password123' });

  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
  }

  const pinRes = await agent
    .post('/api/auth/transaction-pin/session')
    .send({ pin: '1994', scope: 'financial' });

  if (pinRes.statusCode !== 200) {
    throw new Error(`PIN session failed: ${JSON.stringify(pinRes.body)}`);
  }

  const reference = `DBGBOOL-${Date.now()}`;

  const purchaseRes = await agent
    .post('/api/transactions/airtime')
    .send({ network: 'mtn', phone: '08105880201', amount: 100, reference });

  const txn = await Transaction.findOne({ where: { reference } });
  const freshWallet = await Wallet.findOne({ where: { userId: user.id } });

  console.log(JSON.stringify({
    statusCode: purchaseRes.statusCode,
    body: purchaseRes.body,
    transaction: txn ? {
      reference: txn.reference,
      status: txn.status,
      failure_reason: txn.failure_reason,
      balance_before: txn.balance_before,
      balance_after: txn.balance_after,
      metadata: txn.metadata,
    } : null,
    walletBalance: freshWallet ? freshWallet.balance : null,
  }, null, 2));

  await Transaction.destroy({ where: {}, force: true });
  await WalletTransaction.destroy({ where: {}, force: true });
  await Sim.destroy({ where: {}, force: true });
  await Wallet.destroy({ where: {}, force: true });
  await User.destroy({ where: {}, force: true });
}

function jestLikeSpy(target, methodName, impl) {
  const original = target[methodName];
  target[methodName] = impl;
  return () => {
    target[methodName] = original;
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
