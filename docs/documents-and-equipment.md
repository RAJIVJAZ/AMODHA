# Documents & licences, and Machinery & equipment

Two modules in the business app (`/ops`), with their own permissions (Users & roles → `compliance`, `equipment`).

## Documents & licences — `/ops/admin/documents`

- A checklist of the licences and certificates a food business in Prayagraj normally needs (FSSAI, GST, trade
  licence, fire NOC, pollution board consent, shop & establishment, weighing-scale verification, Udyam, water test,
  pest control, food handlers' medical certificates, fire extinguishers, insurance) is created on install. Add
  anything else (vehicle papers, rent agreement, boiler certificate…) with **+ Add document**. Documents the business
  does not need can be marked *not applicable* with a reason.
- For each document: number, issued by, for whom (vehicle, person, premises), issue and expiry dates, a link to the
  copy (Google Drive) and notes.
- **Reminders:** from 20 days before the expiry date (Settings → `compliance.remind_days`; each document can have its
  own number of days) the document shows at the top of **Today** and the **Dashboard**, and in the **daily email**,
  every day — also after it has expired — until someone records the renewal with the next expiry date
  (**Record renewal**). There is no snooze. Every renewal is kept in the document's history with the fee paid.

## Machinery & equipment — `/ops/equipment`

- **Register:** asset code (MW-EQ-0001…), type, location, make, model, serial number, purchase date, price, vendor
  and service contact, warranty dates and terms, maintenance contract (AMC), service interval and next service date,
  link to the bill / warranty card.
- **Daily checklist:** one tap for *working*, or report *needs attention* / *not working* with a note. Machines not
  working stay on the reminder list until a repair is recorded or they are replaced.
- **Services & repairs:** date, type, problem, work done, vendor, technician, parts / labour / other costs, hours out
  of action, bill number and link, and the machine's condition afterwards. Whether the work was **under warranty** is
  worked out from the warranty dates (can be overridden). Each machine shows the number of services and repairs and
  the total spent. With the expenses permission the cost can be posted as an expense (Repairs and maintenance) in the
  same step.
- **Replaced / retired:** a machine can be marked replaced by another machine in the register (both stay linked, with
  the history) or disposed of.
- Reminders also cover warranties and AMCs ending within 30 days and services due within 7 days.

## Daily email

`.github/workflows/daily-reminders.yml` runs at 08:00 India time and calls `/api/cron/reminders`, which emails the
list (Settings → `compliance.reminder_emails`, otherwise the business email) at most once a day. Set up once:

1. Choose a long random value for `CRON_SECRET`.
2. Add it as a repository secret in GitHub (Settings → Secrets and variables → Actions → `CRON_SECRET`).
3. Add the same value as the environment variable `CRON_SECRET` in the website's hosting settings and redeploy.

Email uses the existing SMTP settings (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`).

Tests: `supabase/tests/98_compliance_equipment.sql`.
