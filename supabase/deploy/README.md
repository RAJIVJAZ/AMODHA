# One-time live deployment (already applied)

`2026-10-10-ops-live-remaining.sql` (and the same content in `parts/`) completed the business-app
database on the live Supabase project on 10 October 2026. **It has been applied — do not run it again**
(it would stop at the first object that already exists and change nothing).

After it ran, the live database was checked against a clean build of `supabase/migrations/`:
columns, functions, permissions, access policies, row-level security and triggers are identical.

New environments: apply `supabase/migrations/` in order. Local tests: `supabase/tests/run-tests.sh`.

## Later migrations

- `20261011100000_subscriber_app.sql` (customer schedule change and monthly milk statement) — applied
  to live on 10 October 2026; function bodies and permissions checked identical to the tested build.

- `20261013100000_b2b_sales_wholesale.sql` (B2B wholesale: Sales app, Wholesale app, customer master, pricing,
  CRM, consent, unified order workflow) — **not yet applied to live.** Back up first, apply to a staging copy and run
  `supabase/tests/run-tests.sh`, then apply to live. See `docs/b2b-wholesale.md`.

- `20261019100000_security_fixes.sql` (security audit fixes: milk-subscriber benefits only for a started subscription with
  a delivery, cash-collected corrections post exact differences, credit notes capped at the order total, dismissed staff
  cannot be re-activated through salesperson approval, only owners can switch off owners, customer terms need a permission)
  — **not yet applied to live.** Run `2026-10-19-security-fixes.sql` in the SQL Editor after the 2026-10-14 parts 1–6.
- `20261019110000_security_fixes_low.sql` (owners' sign-in reset, wholesale customers no longer see internal sales notes,
  sales applications need a verified email, bottle charges only for subscribers) — **not yet applied to live.** Run
  `2026-10-19-security-fixes-2.sql` right after `2026-10-19-security-fixes.sql`.

- `20261028100000_compliance_and_equipment.sql` (Documents & licences with renewal reminders, Machinery & equipment
  register with checks, warranty, services and repair costs) — **not yet applied to live.** Run
  `2026-10-28-documents-and-equipment.sql` once (it does not depend on the 2026-10-14 / 2026-10-19 files). See `docs/documents-and-equipment.md`.

## Live data changes

- 10 October 2026: milk set up for sale — packaging configuration `GLASS-BOTTLE-1L` (1 L glass bottle) and
  SKU `MILK-1L` "Farm Fresh Milk — 1 L glass bottle" at ₹100 (HSN 0401, GST 0%), linked to the website
  pack `milk / 1 L glass bottle`; Milk product HSN/GST set to match. Recorded in the audit log.
