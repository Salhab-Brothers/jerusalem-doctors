// The smoke check's sign-in token (lib/auth/githubOidc.ts): only GitHub's
// signature, for this repository's smoke workflow, fresh, is accepted.

import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CI_AUDIENCE, GITHUB_ISSUER, REPOSITORY, verifySmokeToken } from "./githubOidc";

const NOW = 1_800_000_000;
const github = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...github.publicKey.export({ format: "jwk" }), kid: "k1" };
const keyOf = async (kid: string) => (kid === "k1" ? jwk : undefined);

const CLAIMS = {
  iss: GITHUB_ISSUER,
  aud: CI_AUDIENCE,
  iat: NOW - 30,
  exp: NOW + 270,
  jti: "a7c1",
  repository: REPOSITORY,
  workflow_ref: `${REPOSITORY}/.github/workflows/smoke.yml@refs/heads/main`,
  event_name: "deployment_status",
  run_id: "123",
  runner_environment: "github-hosted",
};

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims: object, key = github.privateKey, header: object = { alg: "RS256", kid: "k1" }) {
  const body = `${b64(header)}.${b64(claims)}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
}
const SHA = "a".repeat(40);
const merged = new Set([SHA]);
const onMain = async (sha: string) => merged.has(sha);
const check = (t: string) => verifySmokeToken(t, keyOf, NOW, onMain);
const at = (ref: string, event_name = "deployment_status") => ({
  workflow_ref: `${REPOSITORY}/.github/workflows/smoke.yml@${ref}`,
  event_name,
});

describe("verifySmokeToken", () => {
  it("accepts GitHub's token for this repository's smoke workflow", async () => {
    expect(await check(token(CLAIMS))).toMatchObject({ jti: "a7c1", run_id: "123" });
  });

  it("accepts a production deploy's commit when it is on main", async () => {
    expect(await check(token({ ...CLAIMS, ...at(SHA) }))).not.toBeNull();
  });

  it("accepts the workflow run by a push to main, and nothing else about a push", async () => {
    expect(await check(token({ ...CLAIMS, ...at("refs/heads/main", "push") }))).not.toBeNull();
    // A push to another branch runs that branch's file.
    expect(await check(token({ ...CLAIMS, ...at("refs/heads/evil", "push") }))).toBeNull();
    // A push names a branch, never a bare commit.
    expect(await check(token({ ...CLAIMS, ...at(SHA, "push") }))).toBeNull();
  });

  it("refuses a commit that is not on main, and a sha on any other event", async () => {
    expect(await check(token({ ...CLAIMS, ...at("b".repeat(40)) }))).toBeNull();
    expect(await check(token({ ...CLAIMS, ...at(SHA, "workflow_dispatch") }))).toBeNull();
    expect(await check(token({ ...CLAIMS, ...at(SHA.slice(0, 7)) }))).toBeNull();
  });

  it("refuses a token signed by anyone else, or with an unknown key", async () => {
    expect(await check(token(CLAIMS, other.privateKey))).toBeNull();
    expect(await check(token(CLAIMS, github.privateKey, { alg: "RS256", kid: "nope" }))).toBeNull();
    expect(await check(token(CLAIMS, github.privateKey, { alg: "none", kid: "k1" }))).toBeNull();
  });

  it("is pinned to this repository, issuer and audience by value, not by the constants the tests share with it", async () => {
    // The tests above build their tokens from the exported constants, so a changed
    // constant would change both sides and stay green. These are the real values.
    expect(GITHUB_ISSUER).toBe("https://token.actions.githubusercontent.com");
    expect(CI_AUDIENCE).toBe("jerusalem-doctors-smoke");
    expect(REPOSITORY).toBe("Salhab-Brothers/jerusalem-doctors");
    const literal = {
      iss: "https://token.actions.githubusercontent.com",
      aud: "jerusalem-doctors-smoke",
      repository: "Salhab-Brothers/jerusalem-doctors",
      workflow_ref: "Salhab-Brothers/jerusalem-doctors/.github/workflows/smoke.yml@refs/heads/main",
    };
    expect(await check(token({ ...CLAIMS, ...literal }))).not.toBeNull();
    expect(await check(token({ ...CLAIMS, ...literal, repository: "Salhab-Brothers/other" }))).toBeNull();
    expect(await check(token({ ...CLAIMS, ...literal, workflow_ref: "Salhab-Brothers/other/.github/workflows/smoke.yml@refs/heads/main" }))).toBeNull();
  });

  it.each(["push", "deployment_status", "schedule", "workflow_dispatch"])(
    "accepts the smoke workflow's own trigger %s, on main",
    async (event) => {
      expect(await check(token({ ...CLAIMS, ...at("refs/heads/main", event) }))).not.toBeNull();
    },
  );

  it("refuses the triggers the smoke workflow does not have, even on main", async () => {
    for (const event of ["pull_request", "pull_request_target", "workflow_run", "issue_comment", ""]) {
      expect(await check(token({ ...CLAIMS, ...at("refs/heads/main", event) }))).toBeNull();
    }
  });

  it("accepts a token up to ten minutes old and one minute ahead of our clock, and no more", async () => {
    expect(await check(token({ ...CLAIMS, iat: NOW - 600, exp: NOW + 60 }))).not.toBeNull();
    expect(await check(token({ ...CLAIMS, iat: NOW - 601, exp: NOW + 60 }))).toBeNull();
    expect(await check(token({ ...CLAIMS, iat: NOW + 60 }))).not.toBeNull();
    expect(await check(token({ ...CLAIMS, iat: NOW + 61 }))).toBeNull();
    expect(await check(token({ ...CLAIMS, iat: "recent" }))).toBeNull();
  });

  it("needs a key id that is a string, even from a lookup that would hand out a key for anything", async () => {
    const anyKey = async () => jwk;
    const signed = (header: object) => verifySmokeToken(token(CLAIMS, github.privateKey, header), anyKey, NOW, onMain);
    expect(await signed({ alg: "RS256", kid: "whatever" })).not.toBeNull();
    expect(await signed({ alg: "RS256" })).toBeNull();
    expect(await signed({ alg: "RS256", kid: 5 })).toBeNull();
    expect(await signed({ alg: "RS256", kid: null })).toBeNull();
  });

  it("takes times only as numbers: a numeric string is not a time", async () => {
    expect(await check(token({ ...CLAIMS, iat: String(NOW - 30) }))).toBeNull();
    expect(await check(token({ ...CLAIMS, exp: String(NOW + 270) }))).toBeNull();
    expect(await check(token({ ...CLAIMS, jti: ["a7c1"] }))).toBeNull();
  });

  it("checks the commit's shape itself, whatever the branch lookup would say", async () => {
    const yes = async () => true;
    const run = (ref: string) => verifySmokeToken(token({ ...CLAIMS, ...at(ref) }), keyOf, NOW, yes);
    expect(await run(SHA)).not.toBeNull();
    for (const ref of [`${SHA}ff`, `ff${SHA}`, `${SHA}\n`, SHA.slice(0, 39), SHA.toUpperCase()]) {
      expect(await run(ref)).toBeNull();
    }
  });

  it("reads the real clock, in seconds, when none is given", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW * 1000);
    try {
      expect(await verifySmokeToken(token(CLAIMS), keyOf, undefined, onMain)).not.toBeNull();
      vi.setSystemTime((NOW + 601) * 1000);
      expect(await verifySmokeToken(token(CLAIMS), keyOf, undefined, onMain)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a token that expires this second, and one with no expiry", async () => {
    expect(await check(token({ ...CLAIMS, exp: NOW }))).toBeNull();
    expect(await check(token({ ...CLAIMS, exp: NOW + 1 }))).not.toBeNull();
    expect(await check(token({ ...CLAIMS, exp: undefined }))).toBeNull();
  });

  it("refuses a tampered token", async () => {
    const [h, , s] = token(CLAIMS).split(".");
    expect(await check(`${h}.${b64({ ...CLAIMS, repository: "someone/else" })}.${s}`)).toBeNull();
  });

  it.each([
    ["another repository", { repository: "someone/jerusalem-doctors" }],
    ["another workflow", { workflow_ref: `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/main` }],
    ["a branch's copy of the smoke workflow", { workflow_ref: `${REPOSITORY}/.github/workflows/smoke.yml@refs/heads/evil` }],
    ["a tag's copy of the smoke workflow", { workflow_ref: `${REPOSITORY}/.github/workflows/smoke.yml@refs/tags/v1` }],
    ["a pull request", { event_name: "pull_request" }],
    ["a self-hosted runner", { runner_environment: "self-hosted" }],
    ["another audience", { aud: "https://github.com/Salhab-Brothers" }],
    ["another issuer", { iss: "https://example.com" }],
    ["an expired token", { exp: NOW - 1 }],
    ["an old token", { iat: NOW - 11 * 60 }],
    ["no jti", { jti: "" }],
  ])("refuses %s", async (_, change) => {
    expect(await check(token({ ...CLAIMS, ...change }))).toBeNull();
  });

  it("never throws on garbage", async () => {
    for (const t of ["", "a.b", "a.b.c", "....", token(CLAIMS).replace(/\./, "")]) {
      expect(await check(t)).toBeNull();
    }
  });
});

describe("githubKey", () => {
  const keys = (...kids: string[]) => ({ keys: kids.map((kid) => ({ ...jwk, kid })) });

  it("fetches GitHub's keys once, and again only for a key it has not seen", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(keys("k1"))));
    vi.stubGlobal("fetch", fetchMock);
    const { githubKey } = await import("./githubOidc");

    expect((await githubKey("k1"))?.kid).toBe("k1");
    expect((await githubKey("k1"))?.kid).toBe("k1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${GITHUB_ISSUER}/.well-known/jwks`);

    // A rotated key: fetched again, still unknown.
    expect(await githubKey("k2")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("keeps the keys for an hour, to the millisecond, and serves any key it holds from one fetch", async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(keys("k1", "k2"))));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { githubKey } = await import("./githubOidc");
      expect((await githubKey("k1"))?.kid).toBe("k1");
      expect((await githubKey("k2"))?.kid).toBe("k2");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(1_000_000 + 3_600_000);
      await githubKey("k1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(1_000_000 + 3_600_001);
      await githubKey("k1");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("gives GitHub five seconds to answer, and asks the address in GITHUB_OIDC_JWKS_URL when it is set", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(keys("k1"))));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_OIDC_JWKS_URL", "http://127.0.0.1:1/jwks");
    try {
      const { githubKey } = await import("./githubOidc");
      await githubKey("k1");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { signal: AbortSignal }];
      expect(url).toBe("http://127.0.0.1:1/jwks");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("fails loudly when GitHub does not answer", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { githubKey } = await import("./githubOidc");
    await expect(githubKey("k1")).rejects.toThrow("GitHub JWKS: 503");
    vi.unstubAllGlobals();
  });
});

describe("githubOnMain", () => {
  const ask = async (status: number, body: object, sha = "c".repeat(40)) => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { githubOnMain } = await import("./githubOidc");
    const result = await githubOnMain(sha);
    vi.unstubAllGlobals();
    return { result, fetchMock };
  };

  it("is true for a commit main is ahead of or equal to,", async () => {
    expect((await ask(200, { status: "ahead" })).result).toBe(true);
    expect((await ask(200, { status: "identical" })).result).toBe(true);
  });

  it("is false for a diverged or behind commit, an error, or a rate limit, whatever an error's body says", async () => {
    expect((await ask(200, { status: "diverged" })).result).toBe(false);
    expect((await ask(200, { status: "behind" })).result).toBe(false);
    expect((await ask(404, {})).result).toBe(false);
    expect((await ask(403, {})).result).toBe(false);
    expect((await ask(404, { status: "ahead" })).result).toBe(false);
    expect((await ask(403, { status: "identical" })).result).toBe(false);
  });

  it("asks GitHub's public API, without a token, with a time limit, or the address in GITHUB_API_URL", async () => {
    const sha = "d".repeat(40);
    const { fetchMock } = await ask(200, { status: "ahead" }, sha);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; signal: AbortSignal }];
    expect(url).toBe(`https://api.github.com/repos/Salhab-Brothers/jerusalem-doctors/compare/${sha}...main`);
    expect(init.headers).toEqual({ Accept: "application/vnd.github+json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    vi.stubEnv("GITHUB_API_URL", "http://127.0.0.1:9");
    try {
      const stub = await ask(200, { status: "ahead" }, sha);
      expect(String((stub.fetchMock.mock.calls[0] as unknown as [string])[0])).toBe(`http://127.0.0.1:9/repos/Salhab-Brothers/jerusalem-doctors/compare/${sha}...main`);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("remembers a merged commit, and asks again about one that is not", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ status: String(_url).includes("aaaa") ? "ahead" : "diverged" })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { githubOnMain } = await import("./githubOidc");
      const merged = "a".repeat(40);
      const other = "b".repeat(40);
      expect(await githubOnMain(merged)).toBe(true);
      expect(await githubOnMain(merged)).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await githubOnMain(other)).toBe(false);
      expect(await githubOnMain(other)).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
