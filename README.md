# App2

Front end for a fintech app. Combines customer data patterns from billing
(Maxio), CRM (HubSpot), and accounting (QuickBooks) into a single customer
profile view.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- TanStack Table (data tables — sorting, search, pagination)
- React Router

## Structure

- `src/components/layout` — app shell: icon sidebar nav, page header
- `src/components/data-table` — generic, reusable `DataTable`
- `src/components/customers` — customer-specific table columns, status badges, detail panel
- `src/pages` — routed pages (`Home`, `Customers`, billing and accounting screens)
- `src/data/customers.ts` — seeded mock customer data
- `src/types/customer.ts` — `Customer` data model
- `src/lib/billing-engine` — order-to-cash billing engine core (pure TypeScript, integer cents, no I/O)
- `src/lib/api` — Supabase data access; order-to-cash modules: `sales-orders`, `invoicing`, `cash`,
  `banking`, `receivables`, `contracts`, `billing-run`
- `src/components/order-to-cash` — shared order-to-cash UI (line editor, payment/deposit dialogs, badges)
- `supabase/migrations` — schema; `0005_order_to_cash.sql` adds the billing engine tables and `o2c_*` functions

## Current features

- Home dashboard: portfolio stats, recently added customers, accounts needing attention
- Customer profiles: searchable/sortable data table with a slide-over detail
  panel (contact info, billing/subscription, lifecycle stage)
- Sidebar navigation with Billing and Accounting menus (Reports and some
  Configure pages are still placeholders)

## Sign-in and access control

Every page requires signing in with an email and password (Supabase Auth). Visiting any URL while
signed out goes to `/login` and returns you to that URL afterwards.

- **The first account to sign up becomes the admin** automatically.
- **Later sign-ups wait for approval**: they see a "Waiting for approval" screen until an admin approves
  them under Configure › Users.
- **There is always an admin.** The last admin can't be demoted or removed on their own; removing them
  asks who takes over, and that person is promoted (and approved, if pending) in the same step. This
  also holds if someone deletes the user from the Supabase dashboard.
- **Inactivity timeout**: after 2 minutes with no mouse, keyboard, scroll or touch activity, people are
  signed out and returned to the login page (and back to where they were after signing in), with a
  20-second warning first. Activity in any tab keeps all tabs signed in, time away with the browser
  closed or the computer asleep counts, and a timeout signs out only that browser. Change the limits in
  `src/lib/idle.ts`.
- Admins can approve or reject sign-ups, make others admins or members, and remove accounts. Only admins
  can change integration credentials.

These rules live in the database (`supabase/migrations/0006_auth.sql`: Row Level Security on every
table, plus triggers and admin-only functions), so they also apply to anyone calling the Supabase API
directly with the public anon key; the screens are a convenience on top.

### Supabase setup

1. Apply the migrations in order, including `0006_auth.sql`.
2. Authentication › Providers: enable **Email**. Leaving "Confirm email" on is recommended: new users
   then confirm their address before they can sign in.
3. Authentication › URL Configuration: set the **Site URL** to where the app is deployed and add
   `<your-app-url>/login` to the redirect URLs, so confirmation links come back to the app.

4. Authentication › Emails › Templates › **Confirm signup**: set the subject to "Confirm your email
   address" and paste `supabase/templates/confirm-signup.html` as the message body (add your logo and
   company name where its top comment says).
5. Authentication › Emails › **SMTP Settings**: connect your own email provider (e.g. Resend, Postmark,
   SendGrid, Amazon SES) with a sender address on your domain. Supabase's built-in sender is for testing
   only: it sends a few emails per hour and may only deliver to your Supabase team's addresses, so
   confirmation emails to anyone else can silently never arrive.

The sign-up screen lets people resend the confirmation email after 30 seconds (and again 30 seconds after
each resend); signing in before confirming offers to send it again.

If people already had accounts before `0006_auth.sql`, the earliest becomes the admin and the rest stay
active members.

## Order-to-cash billing engine

Ported from App1's NetSuite-style engine. The flow is:
sales order → fulfillment → invoice → customer payment / deposit → bank deposit → bank reconciliation,
plus contracts and revenue recognition.

- **Sales orders** (Billing › Sales Orders): approval, derived status (pending approval / fulfillment /
  billing, partially billed, billed), inventory lines that bill as they ship, services that bill on
  approval, up-front deposit requests, cancel (nothing billed) vs. close (stop further billing).
- **Billing schedules** per line: one-time on a date, installments (uneven weights supported),
  milestones billed when marked complete, and recurring monthly/quarterly/semi-annual/annual billing in
  advance or in arrears with prorated partial periods.
- **Invoicing**: one-click "Bill now" on an order, standalone invoices, and issuing the Subscription
  wizard's draft invoices. Due dates come from payment terms (`Net 30`, `EOM 15`, `2% 10 Net 30`, …),
  tax is estimated per line, order deposits are applied automatically, and each invoice stores its
  journal entry (A/R, revenue, deferred revenue, sales tax, customer deposits).
- **Revenue recognition** (Accounting › Revenue Recognition): ratable lines defer revenue and release it
  month by month, day-weighted; deferred revenue waterfall.
- **Cash application** (Billing › Payments): one payment split across several invoices (oldest-due-first
  or a manual split), partial payments, unapplied credit, customer deposits and deposit refunds.
- **Receivables** (Accounting › Receivables): A/R aging, consolidated customer statements, and dunning
  with forward-only reminder levels (queued, then sent from your mail client).
- **Banking** (Accounting › Banking): suggested bank deposits (one per Stripe payout, one per day of
  checks, one per ACH/wire), statement CSV import (re-import is a no-op), auto-reconciliation by
  reference or unique amount + date, receipt-grouping suggestions for unmatched lines, manual match/ignore.
- **Contracts** (Billing › Contracts): per-item recurring billing through a contract-owned sales order,
  termination, and auto-renewal with price uplift (renewal order waits for approval).
- **Related records**: every billing object (contract, sales order, subscription, invoice, payment,
  deposit, bank deposit) has a card splitting linked records into **upstream** (origin — customer,
  contract, order, subscription, deposits applied, invoices paid, receipts deposited) and **downstream**
  (impact — orders, invoices, renewals, shipments, payments, refunds, unapplied credit, bank deposits,
  statement matches, reminders), each linking to its own page.
- **Billing Run** (Billing › Billing Run): the daily sweep — renewals, scheduled billing, revenue
  recognition, dunning. Every step is idempotent, so it is safe to re-run or catch up with a past date.

### How writes stay consistent

The engine computes invoices and payment applications in the browser; the `o2c_*` Postgres functions in
`0005_order_to_cash.sql` then write every row in one transaction and re-check what the computation
relied on (billing event still pending, line quantities unchanged, deposit balance still available,
invoice still open). A stale or concurrent request fails with a "refresh and try again" error instead of
double-billing, and idempotency keys make retried requests return the original invoice or payment.

### Not ported yet (needs a backend)

App1 ran on a Node server; App2 is a browser app on Supabase, so these App1 pieces still need a server
side (e.g. Supabase Edge Functions) before they can be added:

- Posting invoices, payments, deposits, bank deposits and revenue journals to QuickBooks Online
  (`invoices.qbo_invoice_id` is reserved for that sync).
- Stripe: portal deposit payments, webhooks, and recording Stripe payouts as bank deposits
  (receipts can already carry a Stripe payout ID and are grouped by it).
- Sending reminder and statement emails automatically (reminders are queued in the app today).
- Running the billing run on a schedule (it is triggered from the Billing Run screen today).

## Development

```bash
npm install
npm run dev
```

```bash
npm run build   # type-check + production build
npm run lint    # oxlint
npm test        # billing engine unit tests
```

Apply `supabase/migrations` in order to your Supabase project (`0005_order_to_cash.sql` is the billing
engine).

### Integration tests

These run against a plain local Postgres (no Supabase project needed). Prepare a scratch database with
`scripts/local-supabase-stub.sql` (stand-ins for Supabase's roles and `auth` schema), then every file in
`supabase/migrations`, in order.

Access-control rules (first admin, approvals, "always an admin", what signed-out and pending users can
reach), on a database where no one has signed up yet:

```bash
psql -v ON_ERROR_STOP=1 -d <db> -f scripts/test-auth.sql
```

Order-to-cash API, through PostgREST: serve the database with a `jwt-secret`, insert an
`auth.users` row (the first one becomes an approved admin), and mint a token for it:

```bash
O2C_TEST_JWT=$(node scripts/mint-test-jwt.mjs <jwt-secret> <user-id>) \
O2C_TEST_POSTGREST_URL=http://localhost:3000 npm test
```

Without `O2C_TEST_POSTGREST_URL` the integration test is skipped.
