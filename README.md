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
- `src/pages` — routed pages (`Home`, `Customers`)
- `src/data/customers.ts` — seeded mock customer data
- `src/types/customer.ts` — `Customer` data model

## Current features

- Home dashboard: portfolio stats, recently added customers, accounts needing attention
- Customer profiles: searchable/sortable data table with a slide-over detail
  panel (contact info, billing/subscription, lifecycle stage)
- Sidebar navigation with placeholders for Invoices, Subscriptions, Reports,
  and Settings

## Development

```bash
npm install
npm run dev
```

```bash
npm run build   # type-check + production build
npm run lint    # oxlint
```
