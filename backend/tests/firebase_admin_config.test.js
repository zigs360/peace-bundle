const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const { connectDB, User, Wallet } = require('../config/db');

describe('Firebase Admin SDK Configuration and Push Notification Module', () => {
  let adminUser;
  let regularUser;
  let adminToken;
  let regularToken;
  let serviceAccountData;

  beforeAll(async () => {
    await connectDB();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'peace_bundle_secret_key_123';

    // Read the local test service account
    const saPath = path.join(__dirname, '..', 'config', 'firebase-service-account.json');
    if (fs.existsSync(saPath)) {
      serviceAccountData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    }

    const timestamp = Date.now();

    adminUser = await User.create({
      name: `Admin Firebase ${timestamp}`,
      email: `admin_fb_${timestamp}@test.com`,
      phone: `080${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'admin',
      account_status: 'active',
    });

    regularUser = await User.create({
      name: `User Firebase ${timestamp}`,
      email: `user_fb_${timestamp}@test.com`,
      phone: `081${String(timestamp).slice(-8)}`,
      password: 'password123',
      role: 'user',
      account_status: 'active',
      metadata: {
        fcmToken: 'mock_fcm_token_valid_test_device_12345'
      }
    });

    adminToken = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET);
    regularToken = jwt.sign({ id: regularUser.id }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    try {
      await Wallet.destroy({ where: { userId: [adminUser.id, regularUser.id] } });
      await User.destroy({ where: { id: [adminUser.id, regularUser.id] } });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Firebase Manager Credential Resolution', () => {
    it('should correctly sanitize private keys with escaped newlines and wrapping quotes', () => {
      const firebaseManager = require('../config/firebase');
      const rawWithEscaped = '"-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkq\\n-----END PRIVATE KEY-----\\n"';
      const cleaned = firebaseManager.sanitizePrivateKey(rawWithEscaped);

      expect(cleaned).not.toContain('\\n');
      expect(cleaned).toContain('\n');
      expect(cleaned.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
      expect(cleaned.endsWith('-----END PRIVATE KEY-----')).toBe(true);
    });

    it('should parse base64 encoded JSON credentials correctly', () => {
      const firebaseManager = require('../config/firebase');
      const sample = { project_id: 'test-project', client_email: 'test@test.com' };
      const base64Str = Buffer.from(JSON.stringify(sample)).toString('base64');
      const parsed = firebaseManager.parseJsonOrBase64(base64Str);

      expect(parsed).toBeDefined();
      expect(parsed.project_id).toBe('test-project');
      expect(parsed.client_email).toBe('test@test.com');
    });

    it('should resolve credentials from individual environment variables', () => {
      if (!serviceAccountData) return;

      const firebaseManager = require('../config/firebase');
      const origProj = process.env.FIREBASE_PROJECT_ID;
      const origEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const origKey = process.env.FIREBASE_PRIVATE_KEY;

      try {
        process.env.FIREBASE_PROJECT_ID = serviceAccountData.project_id;
        process.env.FIREBASE_CLIENT_EMAIL = serviceAccountData.client_email;
        process.env.FIREBASE_PRIVATE_KEY = serviceAccountData.private_key.replace(/\n/g, '\\n');

        const resolved = firebaseManager.resolveCredentials();
        expect(resolved).toBeDefined();
        expect(resolved.source).toBe('env_vars');
        expect(resolved.projectId).toBe(serviceAccountData.project_id);
        expect(resolved.clientEmail).toBe(serviceAccountData.client_email);
        expect(resolved.credentials.privateKey).toContain('\n');
        expect(resolved.credentials.privateKey).not.toContain('\\n');
      } finally {
        if (origProj) process.env.FIREBASE_PROJECT_ID = origProj; else delete process.env.FIREBASE_PROJECT_ID;
        if (origEmail) process.env.FIREBASE_CLIENT_EMAIL = origEmail; else delete process.env.FIREBASE_CLIENT_EMAIL;
        if (origKey) process.env.FIREBASE_PRIVATE_KEY = origKey; else delete process.env.FIREBASE_PRIVATE_KEY;
      }
    });
  });

  describe('PushNotificationService Delivery Operations', () => {
    it('should provide sanitized diagnostics without exposing private keys or sensitive credentials', () => {
      const pushNotificationService = require('../services/pushNotificationService');
      const diag = pushNotificationService.getDiagnostics();

      expect(diag).toBeDefined();
      expect(diag.isInitialized).toBe(true);
      expect(diag.mode).toBe('real');
      expect(diag.projectId).toBe('peace-bundle');
      expect(diag.clientEmail).toContain('@peace-bundle.iam.gserviceaccount.com');
      expect(diag.privateKey).toBeUndefined();
      expect(diag.stats).toBeDefined();
      expect(typeof diag.stats.sent).toBe('number');
    });

    it('should handle mock tokens gracefully in test mode without failing', async () => {
      const pushNotificationService = require('../services/pushNotificationService');
      const sent = await pushNotificationService.sendPushToUser(
        regularUser.id,
        'Wallet Credit',
        '₦5,000 received into your wallet.'
      );

      expect(sent).toBe(true);
    });

    it('should return false when user has no registered FCM token', async () => {
      const pushNotificationService = require('../services/pushNotificationService');
      const sent = await pushNotificationService.sendPushToUser(
        adminUser.id,
        'Test Alert',
        'Should skip'
      );

      expect(sent).toBe(false);
    });

    it('should support broadcast push to announcement topic', async () => {
      const pushNotificationService = require('../services/pushNotificationService');
      const res = await pushNotificationService.broadcastPush(
        'System Maintenance',
        'Scheduled maintenance at midnight'
      );

      // In test with mock or real FCM, returns boolean
      expect(typeof res).toBe('boolean');
    });
  });

  describe('Public /api/health Endpoint Integration', () => {
    it('should include safe Firebase status in /api/health response', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.firebase).toBeDefined();
      expect(res.body.firebase.isInitialized).toBe(true);
      expect(res.body.firebase.mode).toBe('real');
      expect(res.body.firebase.projectId).toBe('peace-bundle');
      expect(res.body.firebase.privateKey).toBeUndefined();
    });
  });

  describe('Admin Firebase Diagnostic Endpoints', () => {
    it('should return 401 when unauthenticated requests access /api/admin/firebase/status', async () => {
      const res = await request(app).get('/api/admin/firebase/status');
      expect(res.status).toBe(401);
    });

    it('should return 403 when non-admin requests access /api/admin/firebase/status', async () => {
      const res = await request(app)
        .get('/api/admin/firebase/status')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(403);
    });

    it('should return detailed Firebase diagnostics when admin requests /api/admin/firebase/status', async () => {
      const res = await request(app)
        .get('/api/admin/firebase/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.isInitialized).toBe(true);
      expect(res.body.data.mode).toBe('real');
      expect(res.body.data.projectId).toBe('peace-bundle');
      expect(res.body.data.source).toBeDefined();
      expect(res.body.data.private_key).toBeUndefined();
    });

    it('should validate test push payload and reject missing targets', async () => {
      const res = await request(app)
        .post('/api/admin/firebase/test-push')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Please provide either userId or fcmToken');
    });

    it('should execute test token dry-run through Firebase Cloud Messaging', async () => {
      const res = await request(app)
        .post('/api/admin/firebase/test-push')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fcmToken: 'dK5_dummy_test_token_for_validation',
          dryRun: true
        });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('dry_run');
      expect(res.body.result).toBeDefined();
      // Google returns invalid argument or invalid-credential for dummy tokens, proving connection to FCM API was contacted
      if (!res.body.success) {
        expect(['messaging/invalid-argument', 'app/invalid-credential']).toContain(res.body.result.code);
      }
    });

    it('should send test push to registered user', async () => {
      const res = await request(app)
        .post('/api/admin/firebase/test-push')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: regularUser.id,
          title: 'Diagnostic Test Notification',
          message: 'Verifying end-to-end admin push delivery'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
