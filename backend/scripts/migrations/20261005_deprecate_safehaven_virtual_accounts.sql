BEGIN;

-- 1. Archive existing SafeHaven virtual accounts into user metadata and deprecate them
UPDATE "Users"
SET 
  "metadata" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE("metadata"::jsonb, '{}'::jsonb),
          '{old_safehaven_account}',
          jsonb_build_object(
            'accountNumber', "virtual_account_number",
            'bankName', "virtual_account_bank",
            'accountName', "virtual_account_name",
            'deprecatedAt', NOW(),
            'status', 'deprecated',
            'is_active', false
          ),
          true
        ),
        '{va_status}',
        '"deprecated"'::jsonb,
        true
      ),
      '{safehaven_deprecated}',
      'true'::jsonb,
      true
    ),
    '{va_provider}',
    'null'::jsonb,
    true
  ),
  "virtual_account_number" = NULL,
  "virtual_account_bank" = NULL,
  "virtual_account_name" = NULL
WHERE 
  ("metadata"->>'va_provider' = 'safehaven')
  OR ("virtual_account_bank" ILIKE '%safehaven%')
  OR ("virtual_account_bank" ILIKE '%safe haven%');

-- 2. Create index on old_safehaven_account accountNumber for fast webhook matching
CREATE INDEX IF NOT EXISTS "users_old_safehaven_account_number_idx"
  ON "Users" (("metadata"->'old_safehaven_account'->>'accountNumber'));

COMMIT;
