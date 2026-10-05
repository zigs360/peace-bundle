const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const { connectDB, User } = require('../config/db');
const { Wallet, Transaction, Notification } = require('../models');
const virtualAccountService = require('../services/virtualAccountService');
const billstackVirtualAccountService = require('../services/billstackVirtualAccountService');
const SystemSetting = require('../models/SystemSetting');
const jwt = require('jsonwebtoken');

describe('SafeHaven Migration and Fallback Strategy', () => {
  beforeAll(async () => {
    await connectDB();
    await SystemSetting.set('virtual_account_generation_enabled', true, 'boolean', 'api');
    await SystemSetting.set('virtual_account_provider', 'billstack', 'string', 'api');
    process.env.SAFEHAVEN_WEBHOOK_SECRET = 'test_safehaven_secret';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getAuthToken = (user) => {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'test_jwt_secret',
      { expiresIn: '1h' }
    );
  };

  describe('1. Lazy Re-Provisioning on GET /api/users/virtual-account and GET /api/wallet', () => {
    it('automatically migrates user with deprecated SafeHaven account to 9PSB or PalmPay on summary fetch', async () => {
      // Mock routed virtual account creation to return a supported 9PSB account
      jest.spyOn(billstackVirtualAccountService, 'generateVirtualAccountRouted').mockResolvedValue({
        accountNumber: '9900112233',
        bank: '9PSB',
        bankName: '9PSB',
        accountName: 'Migrated Test User',
        provider: 'billstack',
        trackingReference: 'TRK-9PSB-001',
        routing: {
          tier: 'primary',
          attempts: [{ tier: 'primary', provider: 'billstack', bank: '9PSB', status: 'success' }]
        }
      });

      const user = await User.create({
        name: 'Migrated Test User',
        email: `sh_migrated_${Date.now()}@test.com`,
        phone: '08123456789',
        password: 'password123',
        role: 'user',
        account_status: 'active',
        virtual_account_number: '1122334455',
        virtual_account_bank: 'SAFE HAVEN MFB',
        virtual_account_name: 'Migrated Test User',
        metadata: {
          va_provider: 'safehaven',
          va_status: 'active',
        }
      });

      const token = getAuthToken(user);

      // Verify that virtualAccountService considers the old SafeHaven account non-active/unsupported
      expect(virtualAccountService.hasActiveSupportedVirtualAccount(user)).toBe(false);

      // Calling GET /api/users/virtual-account should auto-reprovision 9PSB/PalmPay
      const res = await request(app)
        .get('/api/users/virtual-account')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasVirtualAccount).toBe(true);
      expect(res.body.bankName).toBe('9PSB');

      // Verify user in database now has 9PSB account and old SafeHaven account is quarantined / archived
      const reloaded = await User.findByPk(user.id);
      expect(reloaded.virtual_account_number).toBe('9900112233');
      expect(reloaded.virtual_account_bank).toBe('9PSB');
      expect(reloaded.metadata.va_provider).toBe('billstack');
      expect(reloaded.metadata.old_safehaven_account).toBeDefined();
      expect(reloaded.metadata.old_safehaven_account.accountNumber).toBe('1122334455');
      expect(reloaded.metadata.old_safehaven_account.status).toBe('deprecated');
    });

    it('returns wallet summary and needs_provider_migration_warning flag on GET /api/wallet', async () => {
      const user = await User.create({
        name: 'Wallet Summary User',
        email: `wallet_summary_${Date.now()}@test.com`,
        phone: '08123456788',
        password: 'password123',
        role: 'user',
        account_status: 'active',
        virtual_account_number: '8877665544',
        virtual_account_bank: '9PSB',
        virtual_account_name: 'Wallet Summary User',
        metadata: {
          va_provider: 'billstack',
          va_status: 'assigned',
          needs_provider_migration_warning: true
        }
      });

      const token = getAuthToken(user);

      const res = await request(app)
        .get('/api/wallet')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.needs_provider_migration_warning).toBe(true);
      expect(res.body.hasVirtualAccount).toBe(true);
      expect(res.body.virtualAccount.bankName).toBe('9PSB');
    });
  });

  describe('2. Legacy SafeHaven Webhook Grace-Period & Crediting', () => {
    it('credits deposit to user with archived SafeHaven account, marks legacy_provider_deposit, and sets warning flag', async () => {
      const legacyAccountNumber = '5544332211';
      const user = await User.create({
        name: 'Legacy SH User',
        email: `legacy_sh_${Date.now()}@test.com`,
        phone: '08099887766',
        password: 'password123',
        role: 'user',
        account_status: 'active',
        virtual_account_number: '9988776655', // Already has new 9PSB account
        virtual_account_bank: '9PSB',
        virtual_account_name: 'Legacy SH User',
        metadata: {
          va_provider: 'billstack',
          old_safehaven_account: {
            accountNumber: legacyAccountNumber,
            bankName: 'SAFE HAVEN MFB',
            accountName: 'Legacy SH User',
            status: 'deprecated',
            is_active: false
          }
        }
      });

      const walletBefore = await Wallet.findOne({ where: { userId: user.id } });
      const balanceBefore = parseFloat(walletBefore.balance || 0);

      const depositAmount = 2500;
      const shRef = `SH-DEPOSIT-${Date.now()}`;
      const payload = {
        sessionId: shRef,
        amount: depositAmount,
        accountNumber: legacyAccountNumber,
        creditAccountNumber: legacyAccountNumber,
        paymentReference: shRef,
        channel: 'Transfer'
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha512', process.env.SAFEHAVEN_WEBHOOK_SECRET).update(rawBody).digest('hex');

      const res = await request(app)
        .post('/api/webhooks/safehaven')
        .set('x-safehaven-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify wallet was credited
      const walletAfter = await Wallet.findOne({ where: { userId: user.id } });
      expect(parseFloat(walletAfter.balance)).toBe(balanceBefore + depositAmount);

      // Verify transaction record contains legacy_provider_deposit: true
      const txn = await Transaction.findOne({ where: { reference: shRef } });
      expect(txn).toBeDefined();
      expect(parseFloat(txn.amount)).toBe(depositAmount);
      expect(txn.metadata.gateway).toBe('safehaven');
      expect(txn.metadata.legacy_provider_deposit).toBe(true);

      // Verify user profile metadata has needs_provider_migration_warning: true
      const reloadedUser = await User.findByPk(user.id);
      expect(reloadedUser.metadata.needs_provider_migration_warning).toBe(true);

      // Verify urgent in-app notification was created
      const notification = await Notification.findOne({
        where: { userId: user.id, priority: 'high' }
      });
      expect(notification).toBeDefined();
      expect(notification.title).toContain('URGENT');
    });

    it('rejects invalid signature in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const payload = {
        sessionId: `SH-PROD-TEST-${Date.now()}`,
        amount: 500,
        accountNumber: '1111222233'
      };

      const res = await request(app)
        .post('/api/webhooks/safehaven')
        .set('x-safehaven-signature', 'invalid_signature_hash')
        .set('Content-Type', 'application/json')
        .send(payload);

      process.env.NODE_ENV = prevEnv;

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('responds to GET and HEAD health pings for SafeHaven webhook route', async () => {
      const getRes = await request(app).get('/api/webhooks/safehaven');
      expect(getRes.status).toBe(200);
      expect(getRes.body.ok).toBe(true);

      const headRes = await request(app).head('/api/webhooks/safehaven');
      expect(headRes.status).toBe(200);
    });
  });
});
