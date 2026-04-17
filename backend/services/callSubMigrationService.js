const { Op } = require('sequelize');
const sequelize = require('../config/database');
const VoiceBundlePurchase = require('../models/VoiceBundlePurchase');
const VoiceBundlePurchaseAudit = require('../models/VoiceBundlePurchaseAudit');
const CallPlan = require('../models/CallPlan');
const VoiceBundle = require('../models/VoiceBundle');
const callSubLifecycleService = require('./callSubLifecycleService');

class CallSubMigrationService {
  async deactivateLegacyOfferings(providerKey, transaction) {
    const legacy = callSubLifecycleService.getLegacyValidityBundles(providerKey);
    const legacyCodes = legacy.map((item) => item.code);
    const legacyAmounts = legacy.map((item) => Number(item.amount || 0));
    if (legacyCodes.length === 0) return { callPlans: 0, voiceBundles: 0 };

    const [callPlans] = await CallPlan.update(
      { status: 'inactive' },
      {
        where: {
          provider: providerKey,
          api_plan_id: { [Op.in]: legacyCodes },
        },
        transaction,
      },
    );

    const [voiceBundles] = await VoiceBundle.update(
      { is_active: false },
      {
        where: {
          network: providerKey,
          [Op.or]: [
            { api_plan_id: { [Op.in]: legacyCodes.map((code) => code.replace(/^ATM-/, 'TM')) } },
            { amount: { [Op.in]: legacyAmounts } },
          ],
        },
        transaction,
      },
    );

    return { callPlans, voiceBundles };
  }

  async migrateActiveLegacyValidityBundles(providerKey, { dryRun = false, migrationAt = new Date() } = {}) {
    const legacy = callSubLifecycleService.getLegacyValidityBundles(providerKey);
    const legacyCodes = legacy.map((item) => item.code);
    if (legacyCodes.length === 0) {
      return { provider: providerKey, scanned: 0, migrated: 0, skipped: 0, details: [] };
    }

    const purchases = await VoiceBundlePurchase.findAll({
      where: {
        provider: providerKey,
        status: 'completed',
        [Op.or]: [
          { apiPlanId: { [Op.in]: legacyCodes } },
          { minutes: 0 },
        ],
      },
      order: [['createdAt', 'ASC']],
    });

    const details = [];
    let migrated = 0;
    let skipped = 0;

    for (const purchase of purchases) {
      const purchaseJson = purchase.toJSON();
      const existingMigration = await VoiceBundlePurchase.findOne({
        where: { migratedFromPurchaseId: purchase.id },
      });
      if (existingMigration) {
        skipped += 1;
        details.push({ reference: purchase.reference, action: 'skipped_existing_migration' });
        continue;
      }

      const credit = callSubLifecycleService.computeMigrationCredit({
        purchase: purchaseJson,
        providerKey,
        migrationAt,
      });
      if (!credit || credit.creditedMinutes <= 0 || !credit.publicBundle) {
        skipped += 1;
        details.push({ reference: purchase.reference, action: 'skipped_inactive_or_unmapped' });
        continue;
      }

      const now = new Date(migrationAt);
      if (credit.naturalExpiry <= now) {
        skipped += 1;
        details.push({ reference: purchase.reference, action: 'skipped_expired' });
        continue;
      }

      details.push({
        reference: purchase.reference,
        action: dryRun ? 'would_migrate' : 'migrated',
        creditedMinutes: credit.creditedMinutes,
        naturalExpiry: credit.naturalExpiry.toISOString(),
        targetCode: credit.publicBundle.code,
      });

      if (dryRun) {
        migrated += 1;
        continue;
      }

      await sequelize.transaction(async (transaction) => {
        const callPlan = await CallPlan.findOne({
          where: { provider: providerKey, api_plan_id: credit.publicBundle.code },
          transaction,
        });
        if (!callPlan) {
          throw new Error(`Target call plan not found for ${credit.publicBundle.code}`);
        }

        const migratedReference = `MIG-${purchase.reference}`;
        const migratedPurchase = await VoiceBundlePurchase.create(
          {
            reference: migratedReference,
            userId: purchase.userId,
            callPlanId: callPlan.id,
            transactionId: purchase.transactionId,
            provider: providerKey,
            recipientPhoneNumber: purchase.recipientPhoneNumber,
            amountCharged: 0,
            minutes: credit.creditedMinutes,
            validityDays: credit.remainingDays,
            apiPlanId: credit.publicBundle.code,
            providerReference: null,
            status: 'completed',
            bundleCategory: 'migrated_credit',
            expiresAt: credit.naturalExpiry,
            migratedFromPurchaseId: purchase.id,
            metadata: {
              migration: {
                sourceReference: purchase.reference,
                sourceApiPlanId: purchase.apiPlanId,
                sourceAmountCharged: purchase.amountCharged,
                remainingFraction: credit.remainingFraction,
                creditedMinutes: credit.creditedMinutes,
                naturalExpiry: credit.naturalExpiry.toISOString(),
                targetCode: credit.publicBundle.code,
              },
            },
          },
          { transaction },
        );

        await VoiceBundlePurchase.update(
          {
            bundleCategory: 'legacy_validity',
            expiresAt: credit.naturalExpiry,
            metadata: {
              ...(purchase.metadata || {}),
              migration: {
                status: 'migrated',
                migratedPurchaseId: migratedPurchase.id,
                migratedReference,
                migratedAt: now.toISOString(),
              },
            },
          },
          { where: { id: purchase.id }, transaction },
        );

        await VoiceBundlePurchaseAudit.bulkCreate(
          [
            {
              purchaseId: purchase.id,
              userId: purchase.userId,
              eventType: 'completed',
              metadata: { auditKind: 'migration_source_marked', migratedReference, targetCode: credit.publicBundle.code },
            },
            {
              purchaseId: migratedPurchase.id,
              userId: purchase.userId,
              eventType: 'created',
              metadata: { auditKind: 'migrated_credit_created', sourcePurchaseId: purchase.id, sourceReference: purchase.reference },
            },
          ],
          { transaction },
        );
      });

      migrated += 1;
    }

    if (!dryRun) {
      await sequelize.transaction(async (transaction) => {
        await this.deactivateLegacyOfferings(providerKey, transaction);
      });
    }

    return {
      provider: providerKey,
      scanned: purchases.length,
      migrated,
      skipped,
      details,
    };
  }

  async buildMonitoringSnapshot(providerKey) {
    const legacyCodes = callSubLifecycleService.getLegacyValidityBundles(providerKey).map((item) => item.code);
    const legacyPurchases = await VoiceBundlePurchase.findAll({
      where: {
        provider: providerKey,
        [Op.or]: [
          { bundleCategory: 'legacy_validity' },
          { apiPlanId: { [Op.in]: legacyCodes } },
          { minutes: 0 },
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const migratedCredits = await VoiceBundlePurchase.count({
      where: {
        provider: providerKey,
        bundleCategory: 'migrated_credit',
      },
    });

    const activeVoiceBundleRows = await VoiceBundle.count({
      where: {
        network: providerKey,
        is_active: true,
      },
    });

    const invalidExpiryBundles = callSubLifecycleService.hasIncorrectPublicExpiry(providerKey);
    const now = new Date();
    const activeLegacy = legacyPurchases.filter((purchase) => {
      const expiry = callSubLifecycleService.getNaturalExpiryForPurchase(purchase);
      return expiry && expiry > now;
    });
    const unmigratedActiveLegacy = activeLegacy.filter((purchase) => !purchase.migratedFromPurchaseId && !purchase.metadata?.migration?.migratedPurchaseId);

    return {
      provider: providerKey,
      publicBundleCount: callSubLifecycleService.getPublicBundles(providerKey).length,
      activeVoiceBundleRows,
      activeLegacyPurchaseCount: activeLegacy.length,
      unmigratedActiveLegacyCount: unmigratedActiveLegacy.length,
      migratedCreditCount: migratedCredits,
      invalidPublicExpiryCount: invalidExpiryBundles.length,
      invalidPublicExpiryBundles: invalidExpiryBundles,
      legacyReferences: legacyPurchases.slice(0, 20).map((purchase) => ({
        reference: purchase.reference,
        apiPlanId: purchase.apiPlanId,
        amountCharged: Number(purchase.amountCharged || 0),
        minutes: purchase.minutes,
        validityDays: purchase.validityDays,
        expiresAt: callSubLifecycleService.getNaturalExpiryForPurchase(purchase)?.toISOString() || null,
        status: purchase.status,
        bundleCategory: purchase.bundleCategory || callSubLifecycleService.inferBundleCategory(purchase),
      })),
    };
  }
}

module.exports = new CallSubMigrationService();
