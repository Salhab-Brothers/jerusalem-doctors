import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, isPublic, proxy } from "./proxy";

// The Supabase session client is replaced: what it answers to getClaims is the
// one thing these tests vary, and the cookies it asks the proxy to set.
const supa = vi.hoisted(() => ({
  claims: null as unknown,
  cookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
  opts: undefined as undefined | { cookies: { getAll: () => unknown; setAll: (c: unknown[]) => void } },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: NonNullable<typeof supa.opts>) => {
    supa.opts = opts;
    return {
      auth: {
        getClaims: async () => {
          opts.cookies.setAll(supa.cookies);
          return { data: supa.claims };
        },
      },
    };
  },
}));

describe("isPublic", () => {
  it.each([
    "/",
    "/login",
    "/signup",
    "/verify",
    "/privacy",
    "/report",
    "/health",
    "/api/search",
    "/_next/data/x",
    "/favicon.ico",
    "/robots.txt",
    "/manifest.webmanifest",
    "/sw.js",
    "/offline.html",
    // The team's password sign-in. Public here because nobody has a session
    // yet when they reach it; the route and page gate themselves on
    // DEV_LOGIN (see lib/auth/devLogin.ts).
    "/login/dev",
    "/api/login/password",
    // Files, existing or not: their content or "not found", never the login
    // page, which crawlers and agents read as the file (#172).
    "/llms.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/.well-known/ai-catalog.json",
    "/nonexistent.php",
    // The whole tree, not only names with an extension.
    "/.well-known/acme-challenge/token",
  ])("%s is public", (p) => expect(isPublic(p)).toBe(true));

  it.each([
    "/dashboard",
    "/profile",
    "/admin",
    "/admin/audit",
    "/anything",
    // Prefixes only count as whole path segments.
    "/loginx",
    "/signup-admin",
    "/privacy2",
    "/healthz",
    "/favicon-admin",
    // A dot only counts as the file's extension, at the end.
    "/admin.v2/doctors",
    "/.well-knownx",
    "/admin/.well-known/x",
  ])(
    "%s needs a session",
    (p) => expect(isPublic(p)).toBe(false),
  );
});

describe("proxy: cross-site writes to the API", () => {
  const post = (path: string, headers: Record<string, string>, method = "POST") =>
    proxy(new NextRequest(`https://x.test${path}`, { method, headers: { host: "x.test", ...headers } }));

  it("answers 403 before anything else runs", async () => {
    for (const [path, headers] of [
      ["/api/login/verify", { origin: "https://evil.example" }],
      ["/api/profile", { origin: "null" }],
      ["/api/admin/doctors/x", { "sec-fetch-site": "cross-site" }],
    ] as const) {
      const res = await post(path, { ...headers });
      expect(res.status, path).toBe(403);
      expect(await res.json()).toEqual({ error: "cross_site", code: "cross_site" });
    }
  });
});

describe("proxy: the session gate and the security headers", () => {
  const get = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(url, init));
  const signedIn = { claims: { sub: "u1" } };
  const csp = (res: Response) => res.headers.get("content-security-policy") ?? "";

  beforeEach(() => {
    supa.claims = signedIn;
    supa.cookies = [];
    supa.opts = undefined;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends a visitor with no session to /login, remembering the page they asked for", async () => {
    for (const claims of [null, undefined, { claims: {} }, { claims: { sub: "" } }]) {
      supa.claims = claims;
      const res = await get("https://x.test/dashboard");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://x.test/login?next=%2Fdashboard");
    }
    supa.claims = null;
    expect((await get("https://x.test/admin/audit")).headers.get("location")).toBe("https://x.test/login?next=%2Fadmin%2Faudit");
  });

  it("lets a signed-in user through, and a public path through with or without a session", async () => {
    const res = await get("https://x.test/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    supa.claims = null;
    for (const path of ["/", "/login", "/login/dev", "/signup", "/api/search", "/llms.txt", "/.well-known/acme-challenge/t"]) {
      const open = await get(`https://x.test${path}`);
      expect(open.status, path).toBe(200);
      expect(open.headers.get("location"), path).toBeNull();
    }
  });

  it("gives every response a policy with a fresh nonce, and the same nonce to the page's own request", async () => {
    const a = await get("https://x.test/dashboard");
    const b = await get("https://x.test/dashboard");
    const nonceOf = (res: Response) => /'nonce-([^']+)'/.exec(csp(res))?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    // How Next passes the changed request headers on to the page and layout.
    expect(a.headers.get("x-middleware-override-headers")).toContain("x-nonce");
    expect(a.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(a));
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp(a));
  });

  it("upgrades insecure requests only on https, allows eval only in development, and names the project's images", async () => {
    expect(csp(await get("https://x.test/dashboard"))).toContain("upgrade-insecure-requests");
    expect(csp(await get("http://x.test/dashboard"))).not.toContain("upgrade-insecure-requests");
    expect(csp(await get("https://x.test/dashboard"))).not.toContain("'unsafe-eval'");
    vi.stubEnv("NODE_ENV", "development");
    expect(csp(await get("https://x.test/dashboard"))).toContain("'unsafe-eval'");
    expect(csp(await get("https://x.test/dashboard"))).toContain("img-src 'self' data: blob: https://proj.supabase.co");
  });

  it("hands the request's cookies to Supabase and sets the refreshed ones httpOnly, secure on Vercel", async () => {
    supa.cookies = [{ name: "sb-x-auth-token", value: "tok", options: { path: "/", maxAge: 100 } }];
    const res = await get("https://x.test/dashboard", { headers: { cookie: "a=1; b=2" } });
    expect(supa.opts?.cookies.getAll()).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
    expect(res.cookies.get("sb-x-auth-token")).toMatchObject({ value: "tok", httpOnly: true, secure: false, path: "/", maxAge: 100 });
    vi.stubEnv("VERCEL", "1");
    expect((await get("https://x.test/dashboard")).cookies.get("sb-x-auth-token")).toMatchObject({ secure: true });
  });

  it("refuses a cross-site write to the API only: not a page, not a read, not the site's own form", async () => {
    const evil = { host: "x.test", origin: "https://evil.example" };
    expect((await get("https://x.test/signup", { method: "POST", headers: evil })).status).toBe(200);
    expect((await get("https://x.test/api/health", { method: "GET", headers: evil })).status).toBe(200);
    expect((await get("https://x.test/api/health", { method: "POST", headers: { host: "x.test", origin: "https://x.test" } })).status).toBe(200);
    expect((await get("https://x.test/api/health", { method: "POST", headers: evil })).status).toBe(403);
  });
});

describe("proxy: which requests it runs on", () => {
  it("runs on pages and API routes, and not on build assets, images or the icon", () => {
    expect(config.matcher).toHaveLength(1);
    const matches = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/", "/dashboard", "/api/search", "/admin/audit", "/login/dev", "/llms.txt", "/manifest.webmanifest"]) {
      expect(matches.test(path), path).toBe(true);
    }
    for (const path of ["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/logo.svg", "/a/b.png", "/x.jpg", "/x.jpeg", "/x.gif", "/x.webp", "/x.ico"]) {
      expect(matches.test(path), path).toBe(false);
    }
  });
});
