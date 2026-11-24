// The helpers every route shares: who is calling (for the rate limits), and the
// wrapper that turns an unexpected throw into JSON and tells Sentry.

import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { ipFromHeaders, withJsonErrors } from "./respond";

const req = (headers: Record<string, string> = {}, url = "https://x.test/api/thing") => new Request(url, { headers });

afterEach(() => vi.restoreAllMocks());

describe("ipFromHeaders", () => {
  it("takes the first address of the forwarded list, without the spaces around it", () => {
    expect(ipFromHeaders(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(ipFromHeaders(req({ "x-forwarded-for": "  9.9.9.9  ,5.6.7.8" }))).toBe("9.9.9.9");
    expect(ipFromHeaders(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(ipFromHeaders(req({ "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
    expect(ipFromHeaders(req({ "x-forwarded-for": "", "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
    expect(ipFromHeaders(req())).toBe("unknown");
  });
});

describe("withJsonErrors", () => {
  it("passes a handler's own response through untouched", async () => {
    const ok = new Response("fine", { status: 201 }) as never;
    const res = await withJsonErrors(async () => ok)(req());
    expect(res).toBe(ok);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("answers an unexpected throw as JSON 500, logs it with its route, and reports it to Sentry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("boom");
    const res = await withJsonErrors(async () => {
      throw boom;
    })(req({}, "https://x.test/api/admin/thing?id=1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error", code: "internal_error" });
    expect(log).toHaveBeenCalledWith("[/api/admin/thing] unhandled error", boom);
    expect(sentry.captureException).toHaveBeenCalledWith(boom, { tags: { route: "/api/admin/thing" } });
  });
});
