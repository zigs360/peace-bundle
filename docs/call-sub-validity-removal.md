# Call Sub Validity Removal Runbook

## Scope

- Unifies Airtel call sub offerings into minute bundles only.
- Corrects expiry rules:
  - `10` minutes -> `3` days
  - `20` minutes -> `7` days
  - `30` minutes -> `7` days
  - `50` minutes -> `14` days
  - `150` minutes -> `30` days
- Retires legacy validity-only bundles from active purchase surfaces.
- Migrates active legacy validity purchases into prorated minute credits that expire no later than the user's original natural expiry.

## Deployment Checklist

1. Deploy backend commit containing:
   - updated call sub catalog
   - migration services and monitoring endpoint
   - corrected expiry logic
   - retired legacy validity purchase paths
2. Deploy frontend commit containing:
   - unified Call Sub UI
   - dashboard stat cleanup
   - admin monitoring cards/watchlist
3. Run a dry run first:

```bash
cd backend
npm run migrate:legacy-validity:dry-run
```

4. Review the dry-run output:
   - confirm the number of scanned legacy purchases
   - confirm expected migrated minute amounts
   - confirm no expired bundles are being migrated
5. Run the live migration:

```bash
cd backend
npm run migrate:legacy-validity
```

6. Verify the admin monitoring endpoint:

```bash
GET /api/callplans/admin/call-sub/airtel/monitoring
```

7. Verify the user bundle endpoint:

```bash
GET /api/callplans/call-sub/airtel/bundles
```

Expected result:
- only minute bundles are returned
- no `minutes: 0` rows appear
- corrected validity periods are present

8. Verify purchase flow:
   - buy one `10 minute` bundle
   - confirm stored `expiresAt` is `3` days from purchase
   - confirm history shows minute bundle only

## Rollback Plan

1. Roll back application code to the previous stable commit.
2. Do not delete migrated credit rows immediately.
3. If rollback is required before users rely on migrated credits:
   - disable the new frontend deployment
   - restore the previous backend release
   - keep migrated credit rows for audit
4. If a full data rollback is required:
   - identify rows where `bundle_category = 'migrated_credit'`
   - identify source rows where `metadata.migration.status = 'migrated'`
   - archive both sets before any destructive action
   - remove migrated credit rows only after business approval
   - clear the migration metadata on source rows only after the archive is complete
5. Re-enable legacy offerings only if absolutely necessary:
   - re-activate legacy call plan rows
   - re-activate legacy `voice_bundles` rows
   - restore any previous UI entry points

## Post-Release Monitoring

Use the admin Call Sub monitoring panel and `/api/callplans/admin/call-sub/airtel/monitoring`.

Watch these signals:

- `unmigratedActiveLegacyCount`
  - should trend to `0`
- `invalidPublicExpiryCount`
  - must stay at `0`
- `activeLegacyPurchaseCount`
  - may remain above `0` temporarily while old bundles naturally expire
- `migratedCreditCount`
  - should increase during migration, then stabilize
- `activeVoiceBundleRows`
  - should not expose legacy active validity rows

Investigate immediately if:

- any bundle endpoint returns `minutes = 0`
- any public bundle shows wrong validity days
- any new purchase is created with `bundle_category = legacy_validity`
- any purchase history row has missing or obviously incorrect `expiresAt`
- the admin watchlist still shows legacy references after the expected expiry window

## Residual Reference Queries

Check for retired legacy call plan codes:

```sql
select provider, api_plan_id, status
from call_plans
where provider = 'airtel'
  and api_plan_id in ('ATM-100-3D', 'ATM-200-7D', 'ATM-330-7D', 'ATM-700-14D', 'ATM-1300-14D');
```

Check for active legacy purchases still awaiting natural expiry:

```sql
select reference, api_plan_id, minutes, validity_days, expires_at, bundle_category, status
from voice_bundle_purchases
where provider = 'airtel'
  and (bundle_category = 'legacy_validity' or minutes = 0)
order by created_at desc;
```

Check for migrated credits:

```sql
select reference, migrated_from_purchase_id, minutes, expires_at, status
from voice_bundle_purchases
where provider = 'airtel'
  and bundle_category = 'migrated_credit'
order by created_at desc;
```
