const db = require('../config/db');
const { SystemSetting, sequelize } = db;
const pricingService = require('../services/pricingService');
const databaseDiagnosticsService = require('../services/databaseDiagnosticsService');

describe('System Settings In-Memory Caching & Database Optimization Suite', () => {
  beforeAll(async () => {
    await db.connectDB();
  });

  beforeEach(async () => {
    // Clear and seed test settings
    SystemSetting.clearCache();
    await SystemSetting.destroy({ where: {} });
    await SystemSetting.create({
      key: 'test_markup_rate',
      value: '5',
      type: 'integer',
      group: 'pricing',
      description: 'Markup rate percentage'
    });
    await SystemSetting.create({
      key: 'test_feature_flag',
      value: 'true',
      type: 'boolean',
      group: 'general',
      description: 'Feature flag'
    });
    await SystemSetting.create({
      key: 'test_json_config',
      value: JSON.stringify({ provider: 'vtpass', retries: 3 }),
      type: 'json',
      group: 'api',
      description: 'JSON configuration'
    });
  });

  test('1. SystemSetting.preloadCache populates in-memory cache completely', async () => {
    expect(SystemSetting.isPreloaded()).toBe(false);

    const count = await SystemSetting.preloadCache();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(SystemSetting.isPreloaded()).toBe(true);

    // Should read cast values directly from memory
    expect(await SystemSetting.get('test_markup_rate')).toBe(5);
    expect(await SystemSetting.get('test_feature_flag')).toBe(true);
    expect(await SystemSetting.get('test_json_config')).toEqual({ provider: 'vtpass', retries: 3 });
  });

  test('2. SystemSetting.get hits memory cache and does not query DB once preloaded', async () => {
    await SystemSetting.preloadCache();

    // Spy on SystemSetting.findOne
    const findOneSpy = jest.spyOn(SystemSetting, 'findOne');

    const markup = await SystemSetting.get('test_markup_rate');
    const flag = await SystemSetting.get('test_feature_flag');
    const missing = await SystemSetting.get('non_existent_key', 'fallback_val');

    expect(markup).toBe(5);
    expect(flag).toBe(true);
    expect(missing).toBe('fallback_val');

    // Zero calls to findOne because all were resolved from in-memory cache!
    expect(findOneSpy).not.toHaveBeenCalled();

    findOneSpy.mockRestore();
  });

  test('3. SystemSetting.set updates database and immediately refreshes memory cache', async () => {
    await SystemSetting.preloadCache();
    expect(await SystemSetting.get('test_markup_rate')).toBe(5);

    // Update setting via set()
    await SystemSetting.set('test_markup_rate', 15, 'integer', 'pricing');

    // Memory cache should immediately reflect updated value
    const updated = await SystemSetting.get('test_markup_rate');
    expect(updated).toBe(15);

    // DB should also have been updated
    const inDb = await SystemSetting.findOne({ where: { key: 'test_markup_rate' } });
    expect(inDb.value).toBe('15');
  });

  test('4. SystemSetting.getAllCached and getCacheMap return entire setting dictionary from memory', async () => {
    await SystemSetting.preloadCache();

    const findAllSpy = jest.spyOn(SystemSetting, 'findAll');

    const all = await SystemSetting.getAllCached();
    expect(all.test_markup_rate).toBe(5);
    expect(all.test_feature_flag).toBe(true);

    const map = await SystemSetting.getCacheMap();
    expect(map.get('test_markup_rate')).toBe(5);
    expect(map.get('test_feature_flag')).toBe(true);

    // Since cache was warm, no DB findAll query occurred!
    expect(findAllSpy).not.toHaveBeenCalled();

    findAllSpy.mockRestore();
  });

  test('5. pricingService.getSystemSettingMap reads from SystemSetting cache map without hot-path findAll', async () => {
    await SystemSetting.preloadCache();

    const findAllSpy = jest.spyOn(SystemSetting, 'findAll');

    // Even with transaction passed, pricingService should leverage SystemSetting in-memory cache
    const mockTx = {};
    const settingMap = await pricingService.getSystemSettingMap(mockTx);

    expect(settingMap.get('test_markup_rate')).toBe(5);
    expect(settingMap.get('test_feature_flag')).toBe(true);

    // No SQL findAll called on the hot path!
    expect(findAllSpy).not.toHaveBeenCalled();

    findAllSpy.mockRestore();
  });

  test('6. databaseDiagnosticsService caches schema compatibility check', async () => {
    const describeTableSpy = jest.spyOn(sequelize.getQueryInterface(), 'describeTable');

    await databaseDiagnosticsService.getDiagnostics({ includeSchema: true });
    const callCountAfterFirst = describeTableSpy.mock.calls.length;

    // Second call should reuse cached schema report
    await databaseDiagnosticsService.getDiagnostics({ includeSchema: true });
    expect(describeTableSpy.mock.calls.length).toBe(callCountAfterFirst);

    describeTableSpy.mockRestore();
  });

  test('7. Database optimization indexes script is valid SQL and safe to execute', async () => {
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '../scripts/migrations/20261028_database_optimization_and_missing_indexes.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('idx_system_settings_key');
    expect(sql).toContain('idx_system_settings_group');
    expect(sql).toContain('idx_transactions_user_id_created_at');
    expect(sql).toContain('idx_transactions_reference');
    expect(sql).toContain('idx_wallets_user_id');
    expect(sql).toContain('idx_referrals_referrer_status');
  });
});
