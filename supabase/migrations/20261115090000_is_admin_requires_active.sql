-- private.is_admin() also requires an active account.
--
-- The app counts an admin as one only while doctors.is_active is true
-- (getCurrentAdmin, lib/auth/session.ts). The database's own test did not:
-- is_admin() returned doctors.is_admin whatever the account's state. The
-- policies that call it ("admin reads audit logs" on audit_logs, and the admin
-- writes on specialties) are reachable from outside the app with a user's JWT
-- and the public key, so an admin who had been suspended kept, through
-- PostgREST, the activity log and the specialties list until someone cleared
-- is_admin by hand.
--
-- Same function, same schema, same security definer and pinned search_path;
-- only the predicate changes, so the existing grants stay. The second factor
-- is a separate matter (the database does not see the assurance level).
--
-- Apply in the Supabase SQL editor. Safe to run more than once.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select d.is_admin and d.is_active
    from public.doctors d
    where d.auth_user_id = auth.uid()
    limit 1
  ), false);
$$;

insert into public.applied_migrations (name) values ('20261115090000_is_admin_requires_active') on conflict do nothing;
