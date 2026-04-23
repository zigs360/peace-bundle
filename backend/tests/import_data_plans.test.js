const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  normalizeRecord,
  loadRecordsFromFile,
} = require('../scripts/importDataPlans');

describe('importDataPlans script', () => {
  it('normalizes raw provider table rows into DataPlan payloads', () => {
    const normalized = normalizeRecord(
      {
        'Plan Name': '1GB [GIFTING]',
        'Plan ID': '20002',
        Validity: '1 Day',
        'Teleco Price': '500.00',
        'Our Price': '475.00',
        'Wallet Price': '495.00',
        Network: 'MTN',
      },
      'mtn-plans.json',
      { source: 'smeplug' },
    );

    expect(normalized).toMatchObject({
      source: 'smeplug',
      provider: 'mtn',
      name: '1GB [GIFTING]',
      plan_id: '20002',
      data_size: '1GB',
      size_mb: 1024,
      validity: '1 Day',
      original_price: 500,
      your_price: 475,
      wallet_price: 495,
      admin_price: 475,
      api_cost: 495,
      available_sim: true,
      available_wallet: true,
      smeplug_plan_id: '20002',
    });
  });

  it('loads csv records with table headers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-import-'));
    const filePath = path.join(dir, 'airtel.csv');
    fs.writeFileSync(
      filePath,
      [
        'Plan Name,Plan ID,Validity,Teleco Price,Our Price,Network',
        '2GB [GIFTING],30002,7 Days,900,855,Airtel',
      ].join('\n'),
      'utf8',
    );

    const rows = loadRecordsFromFile(filePath);
    expect(rows).toHaveLength(1);
    expect(rows[0]['Plan Name']).toBe('2GB [GIFTING]');
    expect(rows[0]['Plan ID']).toBe('30002');
  });
});
