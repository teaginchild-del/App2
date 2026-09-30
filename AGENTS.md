# AGENTS.md

## Running the app (Base44 dev environment)

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

- Single Vite dev server on host port **3000** (container port 5173), running from the
  bind-mounted source so edits hot-reload. Dependency install runs on container start
  (`npm install`) into a Docker volume, so a lockfile change needs a container restart
  (or `docker compose ... up -d --build`), not an image rebuild of app code.
- `node_modules` lives in the `node_modules` named volume, not on the host bind mount.

## Supabase is required to boot

`src/lib/supabase.ts` **throws at module load** when `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` are missing, and `src/App.tsx` eagerly imports every page, so the
whole bundle fails without them. It is not a per-page concern.

- `VITE_SUPABASE_*` are supplied as placeholders in `.env.base44-defaults` (listed FIRST in
  `env_file:`) so the app boots; real values from `/run/base44/app.env` override them.
- With placeholders the app renders and the **mock-data** pages work: Home (`/`) and
  Customers (`/customers`). These read `src/data/customers.ts`, no network.
- Every Supabase-backed page (products, subscriptions, sales orders, contracts, invoices,
  payments, billing run, receivables, banking, revenue) needs a real Supabase project with
  `supabase/migrations/*.sql` applied in order (`0005_order_to_cash.sql` is the billing engine).
  Until then those pages load but their data queries fail.

## Verifying a boot

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/          # expect 200
curl -s http://localhost:3000/src/main.tsx | head -5                     # expect unhashed dev source
docker compose -f docker-compose.base44.yml logs --tail=30 web           # expect "VITE ... ready"
```

## Tests / lint (host or container)

```bash
npm test    # vitest — billing engine + order-to-cash
npm run lint
npm run build   # tsc -b && vite build
```
