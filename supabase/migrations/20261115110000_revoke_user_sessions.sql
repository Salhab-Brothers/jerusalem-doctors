-- revoke_user_sessions(user_id): ends every login of one user.
--
-- Supabase's admin API has no "sign this user out" call: signOut takes the
-- user's own token. So when an admin moves a doctor's phone number, or
-- suspends an account, the logins that already exist went on working (refresh
-- tokens do not expire by time on this plan), and whoever still held the old
-- phone kept the account. The auth schema is not reachable through the API,
-- so the app asks for it through this function, with the service role.
--
-- Deleting the user's rows in auth.sessions ends their refresh tokens (they
-- cascade); an access token already issued lasts until it expires, at most
-- an hour. Nothing else about the user changes.
--
-- security definer with a pinned search_path; callable by the service role
-- only, like the other server functions (nobody can end someone else's
-- login with the public key).
--
-- Apply in the Supabase SQL editor. Safe to run more than once.

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ended integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics ended = row_count;
  -- Refresh tokens that belong to no session, if any survive. Compared as
  -- text: the column's type has differed between Auth versions.
  delete from auth.refresh_tokens where user_id::text = p_user_id::text;
  return ended;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

insert into public.applied_migrations (name) values ('20261115110000_revoke_user_sessions') on conflict do nothing;
