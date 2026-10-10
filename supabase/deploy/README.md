# One-time live deployment (already applied)

`2026-10-10-ops-live-remaining.sql` (and the same content in `parts/`) completed the business-app
database on the live Supabase project on 10 October 2026. **It has been applied — do not run it again**
(it would stop at the first object that already exists and change nothing).

After it ran, the live database was checked against a clean build of `supabase/migrations/`:
columns, functions, permissions, access policies, row-level security and triggers are identical.

New environments: apply `supabase/migrations/` in order. Local tests: `supabase/tests/run-tests.sh`.
