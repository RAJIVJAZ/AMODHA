# Staff activity monitoring and session management

Part of the existing Ops ERP (`/ops`) and Sales app (`/sales`). It uses the existing Supabase sign-in, the existing
permission checks and the existing audit log; there is no separate monitoring system.

## What was there before
- Sign-in: Supabase Auth, one-time code by email (`siteConfig.loginMethod`), one account per person.
- Sessions: Supabase JWT (with `session_id`) + refresh tokens in `auth.sessions`; no idle timeout.
- Permissions: `has_permission()` / `require_permission()` in Postgres, used by every protected read policy and business function.
- Audit: append-only `audit_log`, written by `write_audit()` inside business functions.
- Drafts: none for staff forms (only B2B order drafts).

## What was added
- `supabase/migrations/20261014100000_staff_activity_monitoring.sql`
  - `staff_sessions`: one record per sign-in of a staff member, with the roles and permissions held at sign-in,
    app, device, browser, address, server times of the last interaction / business action, active seconds,
    how it ended (`manual`, `idle_timeout`, `revoked`, `expired`, `absolute_timeout`, `deactivated`, `security`),
    whether drafts were saved, and whether the browser stopped reporting (`interrupted`, no invented sign-out time).
  - `staff_session_events` (append-only; interaction rows purgeable after the retention period), `staff_role_history`
    (append-only, with who and why), `staff_drafts`, `staff_policy_acknowledgements`.
  - `audit_log` gains the session, the role held, the module, success/failure and an error code.
  - **Server-side timeout**: `has_permission()` and `require_permission()` now also require a live session (sign-in
    present in `auth.sessions`, not ended, last server-recorded interaction within the timeout + 20 s, within the
    12-hour maximum). An idle, revoked or ended session can read and change nothing. Ending a session also deletes its
    refresh token. Ended sessions are never revived.
  - Interaction is recorded only by `staff_activity_ping()` from real clicks, keys, scrolls, touches, form input and
    navigation; the server uses its own clock. Status checks, page loads and background requests never extend a session.
    Active time is counted per minute with interaction, once per sign-in across tabs.
  - Business actions are counted where they are committed (`write_audit()`, plus stock movements and batch status
    changes that had no audit call), once per transaction.
  - Refused actions are logged by the app's server (`staff_log_failure`), including requests after a timeout.
  - Settings (Business settings → monitoring): timeout minutes (default **5**), warning seconds (30), maximum session hours (12),
    retention days (365), notice version.
  - New permission `staff_monitoring` (administrators only by default).
- App
  - `src/components/staff/session-guard.tsx`: shared inactivity clock for all tabs, 30-second warning with *Continue
    working*, sign-out at exactly the timeout after saving drafts, background checks that notice server-side endings.
  - `src/lib/staff/autosave.tsx`: draft autosave with *Saving / Saved hh:mm / not saved to the server — kept on this
    device*; drafts are flushed (8-second deadline) before any sign-out, and the result is recorded honestly.
    Every full `OpsForm` (production, inventory, purchases, expenses, payroll, dispatch entry, customers…) autosaves and
    offers *Restore* afterwards; the Sales order builder, visit notes and new-customer form do too. Drafts never post or approve.
  - `src/app/auth/session-ended`: clears the browser sign-in and shows why (inactivity, revoked, switched off…).
  - `/ops/admin/activity`: **Staff activity & audit** — live sessions (with *End session*), employee report, daily timeline,
    inactivity report (custom thresholds), session history, attendance (with department / shift), role history, CSV exports
    (permission-checked, logged, session references only).
  - `/ops/policy`: the monitoring notice (must be acknowledged before first use of each version) and the person's own sessions.
  - `/sales/login`: the salesperson sign-in page.

## Tests
- `supabase/tests/95_staff_activity.sql` — the 16 required scenarios on the database (78 assertions). The whole suite:
  `supabase/tests/run-tests.sh`.
- `tests/browser/session-guard.mjs` — browser checks on the real component: timeout at exactly the limit, warning,
  scroll / typing / *Continue working* reset it, background polling does not, multiple tabs share one clock and all sign
  out, a failed draft save is reported as failed and kept on the device (14 checks, all passing).

## Deploying
1. Back up the database. Apply `20261013100000_b2b_sales_wholesale.sql` (if not yet applied) and then
   `20261014100000_staff_activity_monitoring.sql` on a staging copy, run the tests, then apply to live.
2. Deploy the app. Everyone signed in gets a session record on their next page load and sees the monitoring notice once.
3. Optional: schedule `select public.staff_reconcile_sessions();` every few minutes (Supabase → Database → Cron) so
   abandoned sessions are closed even when nobody opens the Activity Center (it also runs on every staff page load).
4. Have the monitoring notice and retention period reviewed against Indian data-protection (DPDP Act 2023) and employment
   requirements before rollout.

## Rollback
The app keeps working if the migration is rolled back by restoring the previous `has_permission`, `require_permission`,
`write_audit`, `ops_set_user_roles` and `handle_new_user` definitions (from `20261010100000_ops_foundation.sql` and
`20261013100000_b2b_sales_wholesale.sql`) and redeploying the previous app build. The new tables can stay (they are
only read by the new screens); do not delete the audit records.

## Not covered / needs outside access
- Failed sign-in attempts (wrong codes) are logged by Supabase Auth (Dashboard → Auth logs), not in these tables.
- The old `/admin` page uses the server key and is outside these checks; staff should use `/ops`.
- Phone OTP for staff needs an SMS provider in Supabase Auth.
