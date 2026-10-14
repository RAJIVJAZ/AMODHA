# B2B wholesale: Sales app, Wholesale app and central operations

Anuradha Enterprises (Mithai Wallah), Prayagraj. This extends the existing platform: the same Next.js app,
the same Supabase database, the same orders, stock, dispatch and ledger. Nothing was rebuilt.

## What exists

| Who | Where | What they do |
| --- | --- | --- |
| Salespeople | `/sales` — **Mithai Wallah Sales** (installable PWA) | Dashboard, assigned shops, ADD NEW B2B CUSTOMER, CREATE CUSTOMER ORDER, reorder, visits / follow-ups, special-price requests, consent, order tracking |
| Sweet shops | `/trade` — **Mithai Wallah Wholesale** (installable PWA) | Register (OTP sign-in), approved catalogue at their own prices, quick order, CSV import, drafts, reorder, tracking, confirm salesperson orders, invoices, statement, preferences |
| Operations | `/ops/b2b` — **B2B and retail order operations** | One queue for every order (website, staff, salesperson, Wholesale app), accept, amend, cancel, packing checklist, packing slip, then the existing allocate / dispatch / delivery screens |
| Admin / sales manager | `/ops/b2b/customers`, `/pricing`, `/team`, `/reports`, `/marketing` | Customer master and approvals, logins, credit terms, prices and approvals, salespeople, territories, targets, incentives, segments, consent, campaigns |
| Production planner | `/ops/b2b/planning` | Shortage report from accepted orders vs free stock |
| Finance | `/ops/b2b/customers/[id]` + existing finance screens | Customer ledger and statement, receipts, credit terms; the ledger stays the source of truth |

## One system, not three

- **Customers**: `b2b_customers` is the single master (stable code `MW-C-00001`). Sales, Wholesale, admin, finance
  and operations all read it through the same functions. Duplicates are refused on mobile number and GSTIN; a
  same-name shop in the same city must be confirmed as a different business. Records are never auto-merged.
- **Orders**: every B2B order is a row in the existing `orders` table with `source` = `sales_rep`
  (SALES_REP) or `b2b_app` (B2B_CUSTOMER_APP), next to `website`/`app` (STOREFRONT) and `staff` (ADMIN_ENTRY).
  `salesperson_id` is the employee who entered it; `account_salesperson_id` is the shop's salesperson for CRM. A
  direct order keeps the account salesperson but is never counted as the salesperson's entry.
  Order numbers: `MW-B2B-2026-00001`.
- **Prices**: `wholesale_prices` rules — standard, price category, customer-specific, promotion, with quantity
  breaks and validity dates. `_b2b_price()` picks the lowest applicable rule on the server; the apps never send a
  price. Salespeople can only *request* a special price; a pricing approver decides, and the approver and time are
  stored on the rule. Prices are whole rupees, GST included (same as the rest of the system).
- **Stock**: nothing is reserved or deducted when an order is placed. Operations accept the order, the existing
  FEFO allocation reserves lots, packing is recorded, and the existing dispatch takes stock out of those exact lots —
  so every dispatch line keeps its manufacturing batch. Cancelling releases reservations; dispatched goods go
  through the existing return / credit-note flow.
- **Money**: B2B orders are invoiced when goods are first dispatched (GST time of supply), which posts the sale once
  through the existing posting key (`sale:<order>`). Each customer has its own receivable party (`b2b:<id>`).
  Credit orders post no receipt. Receipts (`b2b_receive_payment`) settle the oldest invoices. Outstanding and
  overdue amounts are always derived from the ledger.

## Android apps

Both apps are also Android apps (Trusted Web Activities that open the website full screen):
**MW Sales** (`shop.mithaiwallah.sales`, `/downloads/mw-sales.apk`, project `android/sales`) and
**MW Wholesale** (`shop.mithaiwallah.wholesale`, `/downloads/mw-wholesale.apk`, project `android/trade`).
Download links are on the Sales and Wholesale sign-in pages, the Sales app menu and the wholesale page.
They are signed with their own key (not the MW Ops key); see `android/sales/README.md`.

## Order workflow

1. Shop (Wholesale app) or salesperson (Sales app) submits → `b2b_place_order` validates customer status, product
   availability for that customer, minimum / multiple quantities, prices, delivery date, payment terms, and checks
   stock and credit. Same idempotency key → same order (a double tap never creates two).
2. Status `submitted` (or `awaiting_confirmation` if the setting *Salesperson orders need customer confirmation* is on;
   the shop confirms in the app, or staff record a phone confirmation with a note).
3. Flags that need a decision are stored on the order: `stock_shortage`, `credit_limit`, `overdue_invoices`,
   `advance_payment`.
4. Operations accept (`b2b_accept_order`, dispatch-approve permission; over-limit credit also needs finance
   approval with a reason; advance orders need the payment recorded). Accepting sets the delivery date operations
   can meet and reserves stock. Unreserved quantities show as *Pending stock or production* and appear on the
   production requirements report.
5. Picking → packing (`ops_record_packing`: packed quantity per line, checklist; any difference needs a written
   exception) → existing dispatch (batch-linked) → delivery update (POD / cash collected) → delivered.
6. Every step is an `order_events` row; the customer and salesperson see it immediately (status text is derived
   from the central order, never copied). Each event also creates an in-app notification for the shop.
7. Amendments (`b2b_amend_order`): before operations accept — the salesperson who entered it or staff; after
   acceptance / during picking — operations approval; never after dispatch. Original and revised lines, totals,
   reason, person and time are kept in `order_amendments` (append-only) and the audit log, and the order goes back
   to operations to accept again.

## Roles and permissions

New permission modules: `b2b_customers`, `field_sales`, `pricing`, `sales_team`, `marketing` (editable in Users &
roles). New roles: **Salesperson** (field sales only) and **Sales manager**. Finance officer gets customer view /
credit terms; operations roles get customer view. Every action is checked in the database
(`SECURITY DEFINER` functions + row-level security) and written to the audit log.

- Salespeople see only their assigned shops; outstanding balances and credit limits only if switched on for them.
- Shops see only their own orders, prices, invoices and statement (tested: another shop's requests are rejected).
- Nobody outside pricing sees price rules; nobody in the apps sees cost, recipes or margins.

## Marketing consent

Off by default. Consent is recorded only from the shop itself (Wholesale app, registration form) or by staff /
salesperson with a stated source; every change is kept in `b2b_consent_log`. Campaigns are approved by a marketing
approver; recipients are only shops that agreed to that channel and have not opted out, and consent is checked
again when the recipient list is exported, so later opt-outs are always respected. There is no bulk-send button:
messages go out through an approved WhatsApp / SMS / email provider.

## Settings (Business settings → b2b)

Required fields for new customers, salesperson-order confirmation, minimum order value, delivery charge and
free-delivery threshold, earliest delivery (days), segment rules (new / not recent / inactive days, high-volume
value, frequent-buyer orders, festive months), support contact shown in the Wholesale app.

## Tests

`supabase/tests/90_b2b_sales_wholesale.sql` covers the 12 required scenarios (salesperson order, direct order,
shared customer database, customer-specific pricing, stock shortage, operations processing, batch traceability,
finance with part payment and no duplicate postings, customer permissions, marketing consent, sales attribution,
amendment audit trail) plus confirmation, special-price approval, reorder and idempotency — 136 assertions, run
with the whole suite: `supabase/tests/run-tests.sh` (all 391 assertions pass on a fresh database).

## Deploying

1. Back up the live database (Supabase dashboard → Database → Backups, or `pg_dump`).
2. Apply `supabase/migrations/20261013100000_b2b_sales_wholesale.sql` to a staging copy first and run the tests
   against it; then apply it to live (SQL editor or `supabase db push`). It only adds tables, columns, functions,
   policies and widens three check constraints on `orders`; existing data is untouched.
3. Deploy the app as usual. `/sales` and `/trade` become available; nothing is visible to shops until a customer
   is approved and given a login.
4. Set up: Products → Wholesale pricing (switch SKUs on for B2B, set standard wholesale prices, categories),
   Sales team (territories, salespeople by email — each person signs in with their own account, targets), then
   approve customers and give them logins.

## Needs outside access (not done here)

- **Phone OTP for shops**: the site currently signs in by email code (`siteConfig.loginMethod`). SMS OTP needs an SMS
  provider (e.g. MSG91 / Twilio) configured in Supabase Auth; then set `loginMethod: "phone"`. OTP rate limits are set
  in Supabase Auth → Rate limits.
- **WhatsApp / SMS / email delivery** of order updates and campaigns: notifications are queued in
  `b2b_notifications` (channel whatsapp / sms / email, status `queued`); a sender needs a provider account
  (WhatsApp Business API, SMS gateway; email can reuse the existing SMTP settings).
- **Online payment for B2B** (Razorpay) is not wired to wholesale orders; B2B uses credit, pay-on-delivery or advance
  by bank transfer / UPI recorded by finance.
- **Shop photographs** need a Supabase Storage bucket.
- **Shopify**: not used — the storefront is this Next.js site, so no Shopify B2B evaluation was needed.
