-- Configure > Integrations: third-party connections (QuickBooks, HubSpot, ...).
--
-- Two ways to connect:
--   - "connected" via OAuth-style login (auth_method = 'oauth'), tracked with
--     access_token / refresh_token once a backend token exchange is wired up.
--   - "connected" via the developer panel (auth_method = 'api_key'), where an
--     admin pastes an API key/secret (and optional refresh token) issued from
--     the provider's developer console.
--
-- SECURITY NOTE: per 0001_billing_schema.sql this app has no auth yet, so RLS
-- here is intentionally permissive (anon key can read/write). Credential
-- columns should move behind a server-side secret store (not a client-writable
-- table) before this ships to real users.

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  provider text not null unique
    check (provider in ('quickbooks', 'hubspot')),
  display_name text not null,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  auth_method text
    check (auth_method in ('oauth', 'api_key')),

  -- OAuth-style login
  account_email text,
  access_token text,
  refresh_token text,

  -- Developer panel (manual API credentials)
  api_key text,
  api_secret text,

  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger integrations_set_updated_at
  before update on integrations
  for each row execute function set_updated_at();

alter table integrations enable row level security;
create policy "public read/write" on integrations for all using (true) with check (true);

insert into integrations (provider, display_name, status)
values
  ('quickbooks', 'QuickBooks', 'disconnected'),
  ('hubspot', 'HubSpot', 'disconnected')
on conflict (provider) do nothing;
