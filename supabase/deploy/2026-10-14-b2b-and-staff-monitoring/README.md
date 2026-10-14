# Live database update — B2B wholesale + staff monitoring (14 October 2026)

Supabase project: https://supabase.com/dashboard/project/alinpnqhzxktalanjrwr

1. **Back up**: Database → Backups (or Project Settings → Database → download a backup).
2. Open **SQL Editor → New query**.
3. Open `part-1-of-5.sql`, copy everything, paste into the editor, press **Run**. Wait for "Success. No rows returned".
4. Repeat with a **new query** for `part-2-of-5.sql`, then 3, 4 and 5 — always in this order.
5. Reload mithaiwallah.shop/trade, /sales/login and /ops — they work as soon as part 5 has run.

The parts are exactly `supabase/migrations/20261013100000_b2b_sales_wholesale.sql` (parts 1–4) and
`supabase/migrations/20261014100000_staff_activity_monitoring.sql` (part 5), split so each fits the editor.
Checked on a fresh copy of the database: all five parts apply in order and every test passes afterwards.

If a part shows an error: stop, do not run the next part, and send the error message. Running a part a second time
after it succeeded stops at the first object that already exists and changes nothing.

After part 5, everyone signed in to /ops is asked to read the staff monitoring notice once, and staff apps sign out
after 5 minutes without activity (Business settings → monitoring to change it).
