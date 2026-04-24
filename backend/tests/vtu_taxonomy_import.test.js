const fs = require('fs');
const path = require('path');

const { connectDB } = require('../config/db');
const DataPlan = require('../models/DataPlan');
const { classifyPlan, flattenTaxonomy } = require('../utils/vtuTaxonomy');
const { applyTaxonomyToExistingPlans, loadRecordsFromFile, isTaxonomyPayload } = require('../scripts/importDataPlans');

describe('VTU taxonomy import', () => {
  const taxonomyPath = path.join(__dirname, '..', 'data', 'vtu-taxonomy.json');
  let taxonomy;

  beforeAll(async () => {
    await connectDB();
    taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  });

  afterEach(async () => {
    await DataPlan.destroy({ where: {}, force: true });
  });

  it('loads the saved taxonomy file as a taxonomy payload', () => {
    const loaded = loadRecordsFromFile(taxonomyPath);
    expect(isTaxonomyPayload(loaded)).toBe(true);
    expect(Array.isArray(loaded.networks)).toBe(true);
    expect(loaded.networks[0].code).toBe('mtn');
  });

  it('classifies plans into the expected category and subcategory', () => {
    const entries = flattenTaxonomy(taxonomy);

    const dailyMtn = classifyPlan(
      {
        provider: 'mtn',
        source: 'ogdams',
        name: '500MB Daily Bundle',
        validity: '1 Day',
      },
      entries,
    );

    const airtelSocial = classifyPlan(
      {
        provider: 'airtel',
        source: 'smeplug',
        name: 'Instagram TikTok Weekly Bundle',
        validity: '7 Days',
      },
      entries,
    );

    const mtnShare = classifyPlan(
      {
        provider: 'mtn',
        source: 'smeplug',
        name: 'SME Share - Weekly 5GB',
        validity: '7 Days',
      },
      entries,
    );

    expect(dailyMtn).toBeTruthy();
    expect(dailyMtn.assignment.category_name).toBe('Gifting Plans');
    expect(dailyMtn.assignment.subcategory_name).toBe('Daily Plans (1-2 Days)');

    expect(airtelSocial).toBeTruthy();
    expect(airtelSocial.assignment.category_name).toBe('Social Bundles');
    expect(airtelSocial.assignment.subcategory_name).toBe('Instagram/TikTok Plans');

    expect(mtnShare).toBeTruthy();
    expect(mtnShare.assignment.service_name).toBe('Data Plans');
    expect(mtnShare.assignment.category_name).toBe('Corporate Plans');
    expect(mtnShare.assignment.subcategory_name).toBe('Share Plans (Weekly)');
  });

  it('applies taxonomy assignments to existing plans', async () => {
    await DataPlan.bulkCreate([
      {
        source: 'ogdams',
        provider: 'mtn',
        category: 'gifting',
        name: '500MB Daily Bundle',
        size: '500MB',
        size_mb: 500,
        validity: '1 Day',
        data_size: '500MB',
        plan_id: 'MTN-500MB-1D',
        original_price: 200,
        your_price: 190,
        wallet_price: 200,
        admin_price: 190,
        api_cost: 200,
        is_active: true,
      },
      {
        source: 'smeplug',
        provider: 'airtel',
        category: 'social',
        name: 'Instagram TikTok Weekly Bundle',
        size: '1GB',
        size_mb: 1024,
        validity: '7 Days',
        data_size: '1GB',
        plan_id: 'AIRTEL-IG-TT-1GB',
        original_price: 500,
        your_price: 480,
        wallet_price: 500,
        admin_price: 480,
        api_cost: 500,
        is_active: true,
      },
      {
        source: 'smeplug',
        provider: 'mtn',
        category: 'gifting',
        name: 'SME Share - Weekly 10GB',
        size: '10GB',
        size_mb: 10240,
        validity: '7 Days',
        data_size: '10GB',
        plan_id: 'MTN-SHARE-10GB',
        original_price: 2500,
        your_price: 2400,
        wallet_price: 2500,
        admin_price: 2400,
        api_cost: 2500,
        is_active: true,
      },
    ]);

    const result = await applyTaxonomyToExistingPlans({
      taxonomy,
      dryRun: false,
    });

    expect(result.summary.examined).toBe(3);
    expect(result.summary.matched).toBe(3);
    expect(result.summary.updated).toBe(3);

    const updatedPlans = await DataPlan.findAll({ order: [['plan_id', 'ASC']] });

    const airtelSocial = updatedPlans.find((plan) => plan.plan_id === 'AIRTEL-IG-TT-1GB');
    const mtnDaily = updatedPlans.find((plan) => plan.plan_id === 'MTN-500MB-1D');
    const mtnShare = updatedPlans.find((plan) => plan.plan_id === 'MTN-SHARE-10GB');

    expect(mtnDaily.category_name).toBe('Gifting Plans');
    expect(mtnDaily.subcategory_name).toBe('Daily Plans (1-2 Days)');
    expect(mtnDaily.network_display_name).toBe('MTN');

    expect(airtelSocial.category_name).toBe('Social Bundles');
    expect(airtelSocial.subcategory_name).toBe('Instagram/TikTok Plans');
    expect(airtelSocial.network_display_name).toBe('Airtel');

    expect(mtnShare.category_name).toBe('Corporate Plans');
    expect(mtnShare.subcategory_name).toBe('Share Plans (Weekly)');
  });
});
