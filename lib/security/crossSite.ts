// Refuses a cross-site request that would change something (login CSRF, #audit).
//
// The session cookies are SameSite=Lax, which keeps them from being SENT on a
// cross-site POST but not from being SET by its response: a page on another
// site can auto-submit a form to /api/login/verify (Content-Type text/plain
// still parses as JSON) and, with the attacker's own code, sign the visitor's
// browser into the attacker's account. A browser always sends Origin on a
// cross-origin POST, so a mismatch is enough to refuse it.
//
// Server-to-server callers (the SMS hook, the delivery report, cron, tests
// using Playwright's request context) send no Origin and are left alone;
// they authenticate with their own secret.

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Whether this request is a state-changing one from another site.
 *  `host` is the Host header: the address the browser was sent to. */
export function isCrossSiteWrite(method: string, origin: string | null, host: string | null, fetchSite: string | null): boolean {
  if (SAFE.has(method.toUpperCase())) return false;
  if (origin !== null) {
    // "null" (a sandboxed frame, a privacy redirect) does not parse: refused.
    try {
      return new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  return fetchSite === "cross-site";
}
