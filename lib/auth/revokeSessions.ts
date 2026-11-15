// Ends every login of one user (supabase/migrations/20261115110000_revoke_user_sessions.sql).
//
// Used when an admin moves a doctor's phone number and when they suspend an
// account: the old logins must not outlive the change. It never throws and
// never undoes what the admin did: a phone fix someone is waiting for must
// not fail because the cleanup did. A failure is logged and reported to Sentry
// (and returned, so the activity log can say it).

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the user's sessions are gone (or there was no login to end). */
export async function revokeSessions(service: SupabaseClient, authUserId: string | null, why: string): Promise<boolean> {
  if (!authUserId) return true;
  const { error } = await service.rpc("revoke_user_sessions", { p_user_id: authUserId });
  if (!error) return true;
  console.error(`[revokeSessions] ${why} failed`, error);
  Sentry.captureException(error, { extra: { action: `revoke_sessions.${why}` } });
  return false;
}
