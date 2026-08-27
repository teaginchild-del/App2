-- Configure > Integrations: third-party connections (QuickBooks, HubSpot, ...).
--
-- Two ways to connect:
--   - "connected" via OAuth login (auth_method = 'oauth') — the
--     integrations-oauth-start / integrations-oauth-callback Edge Functions
--     (supabase/functions/) perform the authorization-code exchange
--     server-side, using each provider's client secret. The secret is a
--     Supabase secret available only to Edge Functions and is never sent to
--     the browser.
--   - "connected" via the developer panel (auth_method = 'api_key') — an
--     admin pastes an API key/secret (and optional refresh token) issued
--     from the provider's developer console, submitted to the
--     integrations-connect-credentials Edge Function.
--
-- Credentials never live in a client-writable table: `integration_credentials`
-- and `oauth_states` below have RLS enabled with NO policies at all, so only
-- the service-role key (used exclusively by the Edge Functions) can read or
-- write them — the anon/publishable key has zero access. `integrations`
-- itself is anon-readable (so the UI can show connection status) but anon
-- has no write access; every mutation goes through an Edge Function.
--
-- SECURITY NOTE: per 0001_billing_schema.sql this app has no end-user auth
-- yet, so anyone holding the anon key can see *that* an integration is
-- connected and its non-secret metadata (account email, provider account id).
-- That's an acceptable trade-off pre-auth — the part that must never be
-- client-readable is the secrets themselves, which this schema guarantees.

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
  account_email text,
  provider_account_id text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger integrations_set_updated_at
  before update on integrations
  for each row execute function set_updated_at();

alter table integrations enable row level security;
create policy "public read" on integrations for select using (true);
-- Intentionally no insert/update/delete policy: anon can only read. All
-- writes come from Edge Functions using the service-role key, which
-- bypasses RLS entirely.

insert into integrations (provider, display_name, status)
values
  ('quickbooks', 'QuickBooks', 'disconnected'),
  ('hubspot', 'HubSpot', 'disconnected')
on conflict (provider) do nothing;

-- =========================================================================
-- integration_credentials — secrets, Edge-Functions-only (service role)
-- =========================================================================
create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations (id) on delete cascade,
  api_key text,
  api_secret text,
  access_token text,
  refresh_token text,
  updated_at timestamptz not null default now(),
  constraint integration_credentials_integration_id_unique unique (integration_id)
);

create trigger integration_credentials_set_updated_at
  before update on integration_credentials
  for each row execute function set_updated_at();

alter table integration_credentials enable row level security;
-- No policies at all: RLS with zero policies denies anon/authenticated
-- entirely. Only the service-role key (used by Edge Functions) bypasses RLS.

-- =========================================================================
-- oauth_states — short-lived, single-use CSRF state for the OAuth redirect
-- =========================================================================
create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('quickbooks', 'hubspot')),
  state text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_created_at_idx on oauth_states (created_at);

alter table oauth_states enable row level security;
-- No policies: Edge-Functions-only, same reasoning as integration_credentials.
