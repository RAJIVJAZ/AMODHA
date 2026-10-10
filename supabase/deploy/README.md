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

## Live data changes

- 10 October 2026: milk set up for sale — packaging configuration `GLASS-BOTTLE-1L` (1 L glass bottle) and
  SKU `MILK-1L` "Farm Fresh Milk — 1 L glass bottle" at ₹100 (HSN 0401, GST 0%), linked to the website
  pack `milk / 1 L glass bottle`; Milk product HSN/GST set to match. Recorded in the audit log.
