-- Authentication and access control.
--
-- Everything in the app now requires a signed-in Supabase Auth user whose
-- app_users row is active. The rules are enforced here in the database (Row
-- Level Security + triggers), not just in the UI, so they also hold for
-- anyone calling the API directly with the public anon key.
--
--   - The first account to sign up becomes an active admin automatically.
--   - Later sign-ups start as `pending` and can't read or write any data
--     until an admin approves them.
--   - There is always at least one active admin: demoting or removing the
--     last admin is refused. To remove the last admin, a successor must be
--     named, who is promoted in the same transaction.
--
-- Supabase must have email sign-ups enabled (Authentication > Providers >
-- Email). With "Confirm email" on, users confirm their address before they
-- can sign in.

-- =========================================================================
-- app_users — one row per Supabase Auth user
-- =========================================================================
create table if not exists app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint app_users_admin_is_active check (role <> 'admin' or status = 'active')
);

create index if not exists app_users_role_idx on app_users (role, status);

-- Helpers used by every RLS policy. security definer so a policy can read
-- app_users without recursing through app_users' own policy.
create or replace function is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_users where id = auth.uid() and status = 'active')
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_users where id = auth.uid() and status = 'active' and role = 'admin')
$$;

-- =========================================================================
-- Sign-up: create the app_users row; the first account becomes the admin.
-- =========================================================================
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  -- Serialize concurrent sign-ups so two "first" users can't both become admin.
  perform pg_advisory_xact_lock(hashtext('app_users:first_admin'));
  v_first := not exists (select 1 from app_users where role = 'admin');

  insert into app_users (id, email, role, status, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    case when v_first then 'admin' else 'member' end,
    case when v_first then 'active' else 'pending' end,
    case when v_first then now() end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

create or replace function handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update app_users set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function handle_auth_user_email_change();

-- Accounts that existed before this migration: the earliest becomes the
-- admin, the rest are active members (they already had access).
insert into app_users (id, email, role, status, created_at, approved_at)
select
  u.id,
  coalesce(u.email, ''),
  case when row_number() over (order by u.created_at, u.id) = 1 then 'admin' else 'member' end,
  'active',
  u.created_at,
  now()
from auth.users u
where not exists (select 1 from app_users a where a.id = u.id);

-- =========================================================================
-- Invariant: while any account exists, at least one active admin exists.
-- Deferred to commit so an admin hand-over can happen in either order
-- inside one transaction. Also covers deleting users from the Supabase
-- dashboard (the auth.users delete cascades here).
-- =========================================================================
create or replace function assert_admin_exists()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from app_users)
     and not exists (select 1 from app_users where role = 'admin' and status = 'active') then
    raise exception 'There must always be an admin. Assign a new admin before removing or demoting the last one.';
  end if;
  return null;
end;
$$;

drop trigger if exists app_users_keep_an_admin on app_users;
create constraint trigger app_users_keep_an_admin
  after update or delete on app_users
  deferrable initially deferred
  for each row execute function assert_admin_exists();

-- =========================================================================
-- Admin actions (the only way app_users rows change)
-- =========================================================================
create or replace function approve_app_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Only an admin can approve users'; end if;
  update app_users set status = 'active', approved_at = now() where id = p_user_id and status = 'pending';
  if not found then raise exception 'No pending user with that id'; end if;
end;
$$;

create or replace function set_app_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Only an admin can change roles'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Unknown role %', p_role; end if;
  update app_users
  set role = p_role,
      status = 'active',
      approved_at = coalesce(approved_at, now())
  where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  -- Demoting the last admin is refused by app_users_keep_an_admin at commit.
end;
$$;

-- Removes a user's account entirely. Removing the last admin requires
-- p_new_admin_id: that user is promoted (and approved if pending) first.
create or replace function remove_app_user(p_user_id uuid, p_new_admin_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target app_users%rowtype;
  v_other_admins integer;
begin
  if not is_admin() then raise exception 'Only an admin can remove users'; end if;

  -- Serialize admin changes so two admins can't remove each other at once.
  perform pg_advisory_xact_lock(hashtext('app_users:first_admin'));

  select * into v_target from app_users where id = p_user_id;
  if not found then raise exception 'User not found'; end if;

  if v_target.role = 'admin' then
    select count(*) into v_other_admins
    from app_users where role = 'admin' and status = 'active' and id <> p_user_id;

    if v_other_admins = 0 then
      if p_new_admin_id is null then
        raise exception 'This is the only admin. Choose a new admin before removing them.';
      end if;
      if p_new_admin_id = p_user_id then
        raise exception 'The new admin must be a different user';
      end if;
      update app_users
      set role = 'admin', status = 'active', approved_at = coalesce(approved_at, now())
      where id = p_new_admin_id;
      if not found then raise exception 'The new admin must be an existing user'; end if;
    end if;
  end if;

  delete from auth.users where id = p_user_id; -- cascades to app_users
end;
$$;

-- =========================================================================
-- Row Level Security: signed-in, approved users only.
-- =========================================================================
alter table app_users enable row level security;

drop policy if exists "users see themselves and the team" on app_users;
create policy "users see themselves and the team" on app_users
  for select to authenticated
  using (id = auth.uid() or is_active_user());
-- No insert/update/delete policies: rows change only through the trigger
-- and the admin functions above.

-- Replace every earlier "public read/write" policy with one that requires
-- an approved user.
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_policies
    where schemaname = 'public' and policyname = 'public read/write'
  loop
    execute format('drop policy "public read/write" on %I.%I', t.schemaname, t.tablename);
    execute format(
      'create policy "approved users" on %I.%I for all to authenticated using (is_active_user()) with check (is_active_user())',
      t.schemaname, t.tablename
    );
  end loop;
end;
$$;

-- Integration credentials can be read by the team but changed by admins only.
drop policy if exists "approved users" on integrations;
create policy "approved users read" on integrations
  for select to authenticated using (is_active_user());
create policy "admins write" on integrations
  for all to authenticated using (is_admin()) with check (is_admin());

-- The anon (signed-out) role gets nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke insert, update, delete, truncate on app_users from anon, authenticated;
grant select on app_users to authenticated;
