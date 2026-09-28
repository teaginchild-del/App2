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

The order-to-cash integration test drives the real API modules against Postgres. It needs a PostgREST
serving a database with the migrations applied and an `anon` role, and is skipped otherwise:

```bash
O2C_TEST_POSTGREST_URL=http://localhost:3000 npm test
```
