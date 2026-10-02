const dynamicProviderService = require('../services/dynamicProviderService');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const targetSlug = process.argv[2];
  await dynamicProviderService.ensureDefaultProviders();
  const all = await dynamicProviderService.getAllProviders();

  console.log('================================================================');
  console.log('             Peace Bundle - API Provider Management             ');
  console.log('================================================================');

  if (!targetSlug) {
    console.log('Configured Providers:');
    for (const p of all) {
      const activeMark = p.is_primary ? '⭐ ACTIVE PRIMARY' : '   Inactive';
      console.log(`  ${activeMark} -> [${p.slug}] ${p.name}`);
      console.log(`      Base URL: ${p.base_url}`);
      console.log(`      Key set:  ${Boolean(p.api_key)}`);
    }
    console.log('\nTo activate a provider as the PRIMARY provider for Data & Airtime:');
    console.log('  node /app/scripts/set-primary-provider.js <slug>');
    console.log('Example:');
    console.log('  node /app/scripts/set-primary-provider.js quicklysim');
    process.exit(0);
  }

  const found = all.find(p => p.slug.toLowerCase() === targetSlug.toLowerCase());
  if (!found) {
    console.error(`❌ Provider with slug "${targetSlug}" not found!`);
    console.log('Available slugs:', all.map(p => p.slug).join(', '));
    process.exit(1);
  }

  const newKey = process.argv[3];
  if (newKey) {
    found.api_key = newKey.trim();
    console.log(`🔑 Updated API Key for ${found.name}.`);
  }

  if (found.slug.toLowerCase() === 'quicklysim') {
    found.base_url = 'https://quicklysim.com';
    found.endpoint_map = {
      ...(found.endpoint_map || {}),
      devices: '/topupmate/api/user',
      device_balance: '/topupmate/api/user',
      ussd: '/devices/:id/ussd',
      data_purchase: '/topupmate/api/data',
      airtime_purchase: '/topupmate/api/airtime',
      balance: '/topupmate/api/user',
    };
    await found.save();
    console.log('✅ Synchronized verified Topupmate API endpoints for QuicklySIM.');
  } else {
    await found.save();
  }

  await dynamicProviderService.setPrimaryProvider(found.id);
  console.log(`\n✅ Success! "${found.name}" (${found.slug}) is now the ACTIVE PRIMARY provider!`);
  console.log('All data and airtime purchases will now be routed directly through this provider.');

  // Live connectivity & balance check
  console.log('\n--- Live Provider Connectivity Test ---');
  try {
    const devicesRes = await dynamicProviderService.getLinkedDevices(found.slug);
    console.log(`Status: ${devicesRes.success ? 'CONNECTED' : 'FAILED'}`);
    console.log(`Message: ${devicesRes.message || 'Ready'}`);
    if (devicesRes.devices?.length) {
      console.log(`Wallet Balance: ₦${devicesRes.devices[0].balance}`);
    }
  } catch (testErr) {
    console.warn(`Connection warning: ${testErr.message}`);
  }
  console.log('================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
