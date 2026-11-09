-- Local-testing stand-in for the parts of Supabase that the migrations rely
-- on: the anon/authenticated roles, auth.users, auth.uid(), and Supabase's
-- default grants. Run it on an empty Postgres database BEFORE the files in
-- supabase/migrations, then serve the database with PostgREST using a JWT
-- secret (see README "Integration tests"). Never run this on Supabase itself.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end
$$;
grant anon, authenticated to authenticator;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Same contract as Supabase: the `sub` claim of the request's JWT.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
