const { protect, invalidateUserAuthCache, clearUserAuthCache, getUserAuthCacheStats } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { getTableColumnsFast, hasTableFast } = require('../utils/tableColumnsHelper');
const { connectDB, sequelize } = require('../config/db');
const jwt = require('jsonwebtoken');

describe('User Auth Caching and Database Performance Suite', () => {
  const secret = 'test_jwt_secret_key_12345';
  let testUser;
  let testToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    await connectDB();
    clearUserAuthCache();

    // Create a mock user in database
    testUser = await User.create({
      name: 'Perf Test User',
      email: `perf_${Date.now()}@example.com`,
      phone: `080${Date.now().toString().slice(-8)}`,
      password: 'hashedpassword123',
      role: 'user',
    });

    testToken = jwt.sign({ id: testUser.id }, secret);
  });

  afterAll(async () => {
    if (testUser?.id) {
      await User.destroy({ where: { id: testUser.id }, force: true });
    }
    clearUserAuthCache();
  });

  beforeEach(() => {
    clearUserAuthCache();
  });

  test('1. protect middleware populates req.user and caches subsequent calls', async () => {
    const findByPkSpy = jest.spyOn(User, 'findByPk');

    const req1 = { headers: { authorization: `Bearer ${testToken}` } };
    const res1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next1 = jest.fn();

    await protect(req1, res1, next1);

    expect(next1).toHaveBeenCalledTimes(1);
    expect(req1.user).toBeDefined();
    expect(req1.user.id).toBe(testUser.id);
    expect(findByPkSpy).toHaveBeenCalledTimes(1);

    // Second call with same token should hit in-memory cache and not call findByPk
    const req2 = { headers: { authorization: `Bearer ${testToken}` } };
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next2 = jest.fn();

    await protect(req2, res2, next2);

    expect(next2).toHaveBeenCalledTimes(1);
    expect(req2.user.id).toBe(testUser.id);
    expect(findByPkSpy).toHaveBeenCalledTimes(1); // Still 1! Zero DB queries!

    findByPkSpy.mockRestore();
  });

  test('2. Concurrent burst requests are deduplicated into a single DB query', async () => {
    const findByPkSpy = jest.spyOn(User, 'findByPk');

    // Simulate 5 simultaneous requests from frontend dashboard loading
    const concurrentRequests = Array.from({ length: 5 }, () => {
      const req = { headers: { authorization: `Bearer ${testToken}` } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      return { req, res, next, promise: protect(req, res, next) };
    });

    await Promise.all(concurrentRequests.map((r) => r.promise));

    concurrentRequests.forEach(({ req, next }) => {
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.id).toBe(testUser.id);
    });

    // All 5 requests coalesced into exactly 1 database query!
    expect(findByPkSpy).toHaveBeenCalledTimes(1);

    findByPkSpy.mockRestore();
  });

  test('3. invalidateUserAuthCache clears the cache and refreshes on next call', async () => {
    const findByPkSpy = jest.spyOn(User, 'findByPk');

    const req1 = { headers: { authorization: `Bearer ${testToken}` } };
    await protect(req1, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
    expect(findByPkSpy).toHaveBeenCalledTimes(1);

    // Invalidate user cache
    invalidateUserAuthCache(testUser.id);

    // Next request must query DB again
    const req2 = { headers: { authorization: `Bearer ${testToken}` } };
    await protect(req2, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
    expect(findByPkSpy).toHaveBeenCalledTimes(2);

    findByPkSpy.mockRestore();
  });

  test('4. User model save/update hooks automatically invalidate auth cache', async () => {
    const findByPkSpy = jest.spyOn(User, 'findByPk');

    // Prime the cache
    const req1 = { headers: { authorization: `Bearer ${testToken}` } };
    await protect(req1, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
    expect(findByPkSpy).toHaveBeenCalledTimes(1);

    // Update user in DB
    await testUser.update({ name: 'Updated Name Via Hook' });

    // Next protect call should hit DB because hook cleared the cache
    const req2 = { headers: { authorization: `Bearer ${testToken}` } };
    await protect(req2, { status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());
    expect(findByPkSpy).toHaveBeenCalledTimes(2);
    expect(req2.user.name).toBe('Updated Name Via Hook');

    findByPkSpy.mockRestore();
  });

  test('5. getTableColumnsFast and hasTableFast return schema info quickly', async () => {
    const hasUsers = await hasTableFast(sequelize, 'Users');
    expect(hasUsers).toBe(true);

    const cols = await getTableColumnsFast(sequelize, 'Users');
    expect(typeof cols).toBe('object');
    expect(cols).toHaveProperty('id');
    expect(cols).toHaveProperty('email');
    expect(cols).toHaveProperty('role');
  });

  test('6. Database optimization migration script contains Users indexes', () => {
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '../scripts/migrations/20261028_database_optimization_and_missing_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('idx_users_id_deleted_at');
    expect(sql).toContain('idx_users_email_deleted_at');
    expect(sql).toContain('idx_users_phone_deleted_at');
    expect(sql).toContain('idx_users_referral_code');
    expect(sql).toContain('idx_users_referred_by');
  });
});
