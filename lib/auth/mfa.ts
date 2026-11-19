// A second factor for the admin accounts that sign in with a password (#164).
//
// A password alone used to be enough to reach /admin: one leaked through a
// public CI artifact once (#162). With Supabase's TOTP (an authenticator app
// code), a session that began with a password only counts as an admin's once
// it has passed the code challenge, which raises its assurance level (`aal`)
// from aal1 to aal2.
//
// Admins do not sign in by phone code at all: a SIM swap on an admin's number
// would otherwise be a full admin session with no second factor. A session
// without a password in its history is no admin session (adminSessionRefused),
// whatever ADMIN_MFA says. The exception is the smoke check's own sign-in (a
// link the server makes for itself and uses at once, /api/login/ci), the CI
// account. ADMIN_ALLOW_OTP=1 lifts the rule: a break-glass for a lockout
// (docs/runbook.md), not a setting to leave on.
//
// The second factor itself is asked only of a password session, and only
// while ADMIN_MFA=1, which is set once every password account has enrolled
// (docs/runbook.md); until then nobody can be locked out.

/** What the session's verified token says about how it was made. */
export interface SessionClaims {
  sub?: string;
  /** "aal1" after one factor, "aal2" after the TOTP challenge too. */
  aal?: string;
  /** The methods used to get the session, newest last. */
  amr?: { method?: string }[];
  /** The account's email, when it has one. */
  email?: string;
}

/** True when this session may not use the admin panel yet: it came from a
 *  password and has not passed the second factor. */
export function needsSecondFactor(
  claims: SessionClaims | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.ADMIN_MFA !== "1") return false;
  return usedPassword(claims) && claims?.aal !== "aal2";
}

/** Whether this session came from a password. */
export function usedPassword(claims: SessionClaims | null | undefined): boolean {
  return Boolean(claims?.amr?.some((a) => a.method === "password"));
}

/** True when this session may not use the admin panel or the admin's reach
 *  into the directory: it did not begin with a password (an admin signs in by
 *  password, not by phone code) and is not the CI account, or it did begin
 *  with one and has not passed the second factor (needsSecondFactor). */
export function adminSessionRefused(
  claims: SessionClaims | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!claims) return true;
  if (!usedPassword(claims) && env.ADMIN_ALLOW_OTP !== "1" && !isCiAccount(claims, env)) return true;
  return needsSecondFactor(claims, env);
}

/** The smoke check's account: a link sign-in the server makes for itself,
 *  so it has no password to give. Matched by the email it is configured with. */
function isCiAccount(claims: SessionClaims, env: Record<string, string | undefined>): boolean {
  const ci = env.CI_LOGIN_EMAIL?.trim().toLowerCase();
  return Boolean(ci) && claims.email?.trim().toLowerCase() === ci;
}
