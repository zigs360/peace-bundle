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

  await dynamicProviderService.setPrimaryProvider(found.id);
  console.log(`\n✅ Success! "${found.name}" (${found.slug}) is now the ACTIVE PRIMARY provider!`);
  console.log('All data and airtime purchases will now be routed directly through this provider.');
  console.log('================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
