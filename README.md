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

## Integrations backend (QuickBooks / HubSpot OAuth)

Configure > Integrations connects to QuickBooks and HubSpot. The OAuth
token exchange runs server-side as Supabase Edge Functions
(`supabase/functions/`) so each provider's client secret never reaches the
browser; the "developer options" API-key path also goes through an Edge
Function so pasted keys land in a table the anon key can't read
(`integration_credentials`, `oauth_states` — RLS with zero policies).

**1. Apply the migration** (`supabase/migrations/0004_integrations.sql`)
against your Supabase project, the same way you've applied 0001-0003.

**2. Create OAuth apps** with QuickBooks (Intuit Developer) and HubSpot, and
register this redirect URI with both:

```
https://<your-project-ref>.supabase.co/functions/v1/integrations-oauth-callback
```

**3. Set Edge Function secrets:**

```bash
supabase secrets set --project-ref <your-project-ref> \
  QUICKBOOKS_CLIENT_ID=... \
  QUICKBOOKS_CLIENT_SECRET=... \
  QUICKBOOKS_ENVIRONMENT=sandbox \
  HUBSPOT_CLIENT_ID=... \
  HUBSPOT_CLIENT_SECRET=... \
  APP_URL=http://localhost:5173
```

`APP_URL` is where the browser gets sent back to after connecting (the
integrations-oauth-callback function redirects to `${APP_URL}/configure/integrations`)
— set it to your deployed frontend's origin in production.
`QUICKBOOKS_ENVIRONMENT` is `sandbox` or `production`; omit it to default to sandbox.

**4. Deploy the functions:**

```bash
supabase functions deploy integrations-oauth-start integrations-oauth-callback \
  integrations-connect-credentials integrations-disconnect integrations-refresh-token \
  --project-ref <your-project-ref>
```

No new frontend env vars are needed — the app builds the Edge Function URLs
from the existing `VITE_SUPABASE_URL`.
