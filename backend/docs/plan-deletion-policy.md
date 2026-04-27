# Plan Deletion Policy

## Overview

Administrators can delete plans from the admin plans management screen. The deletion flow is intentionally retention-aware so the system can remove obsolete catalog entries without breaking historical billing, reporting, or audit trails.

## Deletion Rules

1. Only authenticated users with the `admin` or `super_admin` role can call `DELETE /api/admin/plans/:id`.
2. Every deletion attempt writes an audit entry to `plan_deletion_audits` with:
   - the deleted plan id
   - the acting admin id and identifier
   - the deletion mode (`hard` or `soft`)
   - the optional deletion reason
   - related record counts at the time of deletion
   - a snapshot of the plan payload
3. The API chooses the deletion mode automatically:
   - `hard delete`: used when the plan has no billing-history references
   - `soft delete`: used when the plan is referenced by transactions or admin OGDAMS purchase records

## Data Retention Behavior

### Hard Delete

Hard delete is applied only when the plan is safe to remove permanently.

- The `data_plans` row is permanently deleted.
- Related `reseller_plan_pricing` rows are deleted.
- Related `plan_price_history` rows are deleted.
- The audit entry remains available in `plan_deletion_audits`.

### Soft Delete

Soft delete is applied when the plan is still referenced by billing or purchase history.

- The plan is marked inactive and unavailable for SIM and wallet purchases.
- Sequelize paranoid deletion marks the row as deleted by setting `deletedAt`.
- Historical transaction and billing records remain intact.
- The plan disappears from normal active catalog queries.

## Related Data Handling

The current implementation handles these relationships during deletion:

- `transactions`: preserved and used as a soft-delete trigger
- `admin_ogdams_data_purchases`: preserved and used as a soft-delete trigger
- `pricing_rules`: disabled on soft delete and removed on hard delete when they target the deleted plan
- `reseller_plan_pricing`: removed on hard delete
- `plan_price_history`: removed on hard delete

If new plan-linked billing tables are introduced later, they must be added to the delete impact evaluation before production use.

## Operational Notes

- The admin UI always shows a confirmation dialog before calling the delete endpoint.
- The dialog warns that deletion may be permanent and that referenced plans are archived instead of destroyed.
- Success and failure states are surfaced to administrators through toast notifications.

## Retention Recommendation

- Keep `plan_deletion_audits` for at least 12 months, or longer if your finance or compliance policy requires it.
- Do not purge soft-deleted plans while downstream billing or reconciliation processes still depend on the original plan id.
