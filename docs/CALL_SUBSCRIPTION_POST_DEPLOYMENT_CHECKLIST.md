# Airtel Call Subscription Post-Deployment Checklist

## Scope

Validate the Airtel TalkMore call subscription management module after deployment.

## Preconditions

- Deployment completed with the latest backend and frontend artifacts.
- Database migration `backend/scripts/migrations/20260503_call_subscription_module.sql` executed successfully.
- Airtel network integration credentials and routing are configured.
- Admin JWT for an authorised `admin` or `super_admin` user is available.

## Portfolio Validation

- Confirm all 9 TalkMore gifting bundles exist in the admin dashboard and API:
  - `N100` -> short-code `50093` -> sequence `1`
  - `N200` -> short-code `50094` -> sequence `2`
  - `N300` -> short-code `50095` -> sequence `3`
  - `N500` -> short-code `50096` -> sequence `4`
  - `N1,000` -> short-code `50097` -> sequence `5`
  - `N1,500` -> short-code `50098` -> sequence `6`
  - `N2,000` -> short-code `50099` -> sequence `7`
  - `N2,500` -> short-code `50100` -> sequence `8`
  - `N3,000` -> short-code `50101` -> sequence `9`
- Confirm every TalkMore gifting record shows:
  - provider `airtel`
  - validity `30 days`
  - portfolio `talkmore`
  - bundle class `talkmore_gifting`
  - dealer commission `<= 5%` of customer price
- Confirm duplicate short-code creation is rejected.

## API Validation

- `GET /api/callplans/admin/call-sub/airtel/plans?portfolio=talkmore` returns 9 managed plans.
- `GET /api/callplans/admin/call-sub/airtel/stock` returns stock snapshot for each TalkMore bundle.
- `POST /api/callplans/admin/call-sub/airtel/commission/calculate` returns prorated commission payload.
- `GET /api/callplans/admin/call-sub/airtel/analytics` returns totals, commission, inventory, and bundle aggregates.
- Confirm non-admin tokens receive `403` on admin routes.

## Dashboard Validation

- Open `/admin/call-sub` and confirm the Airtel module loads analytics, stock, and the TalkMore gifting table.
- Edit one non-production bundle price, commission, short-code, and stock limit, save, and confirm the values refresh.
- Toggle a bundle to `inactive`, verify it disappears from active public TalkMore bundle queries, then restore it.
- Confirm stock changes made in the dashboard are reflected in the stock endpoint.

## USSD Mapping Validation

- For each TalkMore bundle, confirm the dashboard or API exposes the expected USSD mapping:
  - `50093` -> `*312*50093#`
  - `50094` -> `*312*50094#`
  - `50095` -> `*312*50095#`
  - `50096` -> `*312*50096#`
  - `50097` -> `*312*50097#`
  - `50098` -> `*312*50098#`
  - `50099` -> `*312*50099#`
  - `50100` -> `*312*50100#`
  - `50101` -> `*312*50101#`
- Verify Airtel USSD routing maps each short-code to the correct internal sequence and bundle value.

## Provisioning Validation

- Execute one successful provisioning for each TalkMore bundle against the Airtel network.
- Confirm each request returns a platform reference and an Airtel provider reference.
- Confirm each purchase is recorded in `voice_bundle_purchases` with:
  - provider `airtel`
  - bundle category `talkmore_gifting`
  - correct `api_plan_id` and short-code
  - correct `expires_at`
- Confirm failed activations trigger wallet refund and stock restoration.

## Commission Validation

- Use `POST /api/callplans/admin/call-sub/airtel/commission/calculate` with a mid-month activation date.
- Confirm the prorated commission matches manual calculation.
- Execute a live partial-month activation and verify the resulting commission payload is stored in purchase metadata.
- Confirm downstream commission posting reflects the prorated amount, not the full-month amount.

## Stock and Concurrency Validation

- Set a bundle stock limit to `1`.
- Fire two simultaneous purchase requests.
- Confirm exactly one request succeeds and one returns `409 Bundle is out of stock`.
- Confirm stock remaining is `0` after the successful purchase.

## Audit Sign-Off

- Capture API evidence for:
  - managed plan list
  - analytics response
  - stock response
  - one successful commission calculation
  - one successful provisioning per TalkMore bundle
- Record deployment date, operator name, and Airtel validation contact before sign-off.
