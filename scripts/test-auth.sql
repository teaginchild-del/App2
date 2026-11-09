-- Access-control tests for supabase/migrations/0006_auth.sql.
-- Run against a scratch database prepared with scripts/local-supabase-stub.sql
-- and all migrations, on which no one has signed up yet:
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f scripts/test-auth.sql
--
-- Everything runs in one transaction that is rolled back at the end.
-- A failed check raises an exception and stops the script.

begin;

-- Fire the "always an admin" check per statement instead of at commit, so
-- each refused change can be caught right where it happens.
set constraints app_users_keep_an_admin immediate;

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception 'Expected error like "%" from: % — got: %', p_like, p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected an error like "%" from: %', p_like, p_sql;
end $$;

do $$ begin
  if exists (select 1 from app_users) then raise exception 'Run on a database with no users'; end if;
end $$;

-- 1. The first sign-up becomes an active admin; later ones are pending members.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'first@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'second@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'third@example.com');

do $$ begin
  if (select role || '/' || status from app_users where email = 'first@example.com') <> 'admin/active' then
    raise exception 'first sign-up should be an active admin';
  end if;
  if (select count(*) from app_users where role = 'member' and status = 'pending') <> 2 then
    raise exception 'later sign-ups should be pending members';
  end if;
end $$;

-- 2. Signed-out (anon) callers can't read anything.
set local role anon;
select pg_temp.expect_error('select count(*) from customers', 'permission denied%');
select pg_temp.expect_error('select approve_app_user(''00000000-0000-0000-0000-00000000000b'')', 'permission denied%');
select pg_temp.as_postgres();

-- 3. A pending user sees no business data and can't call admin actions.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from customers) <> 0 then raise exception 'pending user should see no customers'; end if;
  if (select count(*) from app_users) <> 1 then raise exception 'pending user should see only their own row'; end if;
end $$;
select pg_temp.expect_error($q$insert into customers (company_name) values ('x')$q$, '%row-level security%');
select pg_temp.expect_error('select approve_app_user(''00000000-0000-0000-0000-00000000000c'')', 'Only an admin%');
select pg_temp.expect_error($q$update app_users set role = 'admin'$q$, 'permission denied%');
select pg_temp.as_postgres();

-- 4. The admin sees data and approves the second user, who then has access
--    but still can't do admin actions.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from customers) = 0 then raise exception 'admin should see customers'; end if;
end $$;
select approve_app_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from customers) = 0 then raise exception 'approved user should see customers'; end if;
  if (select count(*) from app_users) <> 3 then raise exception 'approved user should see the team'; end if;
end $$;
insert into customers (company_name) values ('Created by member');
select pg_temp.expect_error($q$select set_app_user_role('00000000-0000-0000-0000-00000000000b', 'admin')$q$, 'Only an admin%');
do $$ begin
  -- Members can read integrations, but writes are filtered out by RLS (0 rows).
  update integrations set status = 'error';
  if exists (select 1 from integrations where status = 'error') then raise exception 'member changed integrations'; end if;
end $$;

-- 5. There must always be an admin.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($q$select set_app_user_role('00000000-0000-0000-0000-00000000000a', 'member')$q$, 'There must always be an admin%');
select pg_temp.expect_error($q$select remove_app_user('00000000-0000-0000-0000-00000000000a')$q$, 'This is the only admin%');
select pg_temp.expect_error($q$select remove_app_user('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$q$, 'The new admin must be a different user%');

--    Deleting the last admin outside the app (e.g. the Supabase dashboard) is refused too.
select pg_temp.as_postgres();
select pg_temp.expect_error($q$delete from auth.users where id = '00000000-0000-0000-0000-00000000000a'$q$, 'There must always be an admin%');

-- 6. Removing the only admin while naming a successor hands over in one step;
--    a pending successor is approved as part of it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select remove_app_user('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');
select pg_temp.as_postgres();
do $$ begin
  if exists (select 1 from auth.users where email = 'first@example.com') then raise exception 'first admin not removed'; end if;
  if (select role || '/' || status from app_users where email = 'third@example.com') <> 'admin/active' then
    raise exception 'successor should be an active admin';
  end if;
end $$;

-- 7. With two admins, either can be demoted or removed without a successor.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select set_app_user_role('00000000-0000-0000-0000-00000000000b', 'admin');
select set_app_user_role('00000000-0000-0000-0000-00000000000b', 'member');
select set_app_user_role('00000000-0000-0000-0000-00000000000b', 'admin');
select remove_app_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.as_postgres();
do $$ begin
  if (select count(*) from app_users where role = 'admin') <> 1 then raise exception 'expected one admin left'; end if;
end $$;

-- 8. Once everyone is gone, the next sign-up becomes the admin again.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($q$select remove_app_user('00000000-0000-0000-0000-00000000000c')$q$, 'This is the only admin%');
select pg_temp.as_postgres();

\echo 'auth tests passed'
rollback;
