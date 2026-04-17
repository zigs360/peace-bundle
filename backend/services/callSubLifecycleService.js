const { getCallSubProvider } = require('./callSubCatalog');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

class CallSubLifecycleService {
  getPublicBundles(providerKey) {
    const provider = getCallSubProvider(providerKey);
    return provider?.bundles || [];
  }

  getLegacyValidityBundles(providerKey) {
    const provider = getCallSubProvider(providerKey);
    return provider?.legacyValidityBundles || [];
  }

  computeExpiryFromBundle(bundle, purchasedAt = new Date()) {
    const days = Number(bundle?.validityDays || 0);
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(new Date(purchasedAt).getTime() + days * MS_PER_DAY);
  }

  inferBundleCategory({ minutes, metadata }) {
    const explicit = String(metadata?.bundleCategory || '').trim().toLowerCase();
    if (explicit) return explicit;
    return Number(minutes || 0) > 0 ? 'minute' : 'legacy_validity';
  }

  isLegacyValidityPurchase(purchase) {
    const category = this.inferBundleCategory(purchase || {});
    return category === 'legacy_validity' || Number(purchase?.minutes || 0) === 0;
  }

  getLegacyValidityMapping(providerKey, codeOrAmount) {
    const rows = this.getLegacyValidityBundles(providerKey);
    return rows.find(
      (row) => row.code === codeOrAmount || Number(row.amount) === Number(codeOrAmount),
    ) || null;
  }

  getPublicBundleByCode(providerKey, code) {
    const rows = this.getPublicBundles(providerKey);
    return rows.find((row) => row.code === code) || null;
  }

  getNaturalExpiryForPurchase(purchase) {
    if (purchase?.expiresAt) return new Date(purchase.expiresAt);
    const createdAt = purchase?.createdAt ? new Date(purchase.createdAt) : new Date();
    const days = Number(purchase?.validityDays || 0);
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(createdAt.getTime() + days * MS_PER_DAY);
  }

  computeMigrationCredit({ purchase, providerKey, migrationAt = new Date() }) {
    const mapping = this.getLegacyValidityMapping(
      providerKey,
      purchase?.apiPlanId || purchase?.api_plan_id || Number(purchase?.amountCharged || 0),
    );
    if (!mapping) return null;

    const naturalExpiry = this.getNaturalExpiryForPurchase(purchase);
    if (!naturalExpiry) return null;

    const createdAt = purchase?.createdAt ? new Date(purchase.createdAt) : new Date(migrationAt);
    const totalWindowMs = Math.max(MS_PER_DAY, naturalExpiry.getTime() - createdAt.getTime());
    const remainingWindowMs = Math.max(0, naturalExpiry.getTime() - new Date(migrationAt).getTime());
    const remainingFraction = Math.min(1, remainingWindowMs / totalWindowMs);
    const totalMinutes = Number(mapping.migrationMinutes || 0);
    const creditedMinutes = remainingFraction <= 0 ? 0 : Math.max(1, Math.round(totalMinutes * remainingFraction));
    const remainingDays = remainingWindowMs <= 0 ? 0 : Math.max(1, Math.ceil(remainingWindowMs / MS_PER_DAY));
    const publicBundle = this.getPublicBundleByCode(providerKey, mapping.migrateToCode);

    return {
      mapping,
      publicBundle,
      naturalExpiry,
      remainingFraction,
      creditedMinutes,
      remainingDays,
    };
  }

  hasIncorrectPublicExpiry(providerKey) {
    const bundles = this.getPublicBundles(providerKey);
    const expected = new Map([
      [10, 3],
      [20, 7],
      [30, 7],
      [50, 14],
      [150, 30],
    ]);
    return bundles.filter((bundle) => expected.get(Number(bundle.minutes)) !== Number(bundle.validityDays));
  }
}

module.exports = new CallSubLifecycleService();
