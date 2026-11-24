// With Redis configured: the same answers, and what a Redis failure means for
// each (a retry may send twice; a delivery report is counted rather than lost).

import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ exists: vi.fn(), set: vi.fn(), incr: vi.fn(), ctor: vi.fn() }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    exists = redis.exists;
    set = redis.set;
    incr = redis.incr;
    constructor(opts: unknown) {
      redis.ctor(opts);
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
});

describe("with Redis", () => {
  it("uses a Redis that makes no retries and abandons a slow call: the hook has about 5 seconds in all", async () => {
    const { alreadySent } = await import("./sentOnce");
    redis.exists.mockResolvedValue(0);
    await alreadySent("k");
    const opts = redis.ctor.mock.calls[0]![0];
    expect(opts.retry).toBe(false);
    expect(opts.signal()).toBeInstanceOf(AbortSignal);
  });

  it("asks Redis whether a code's text already went out, and records it with a lifetime", async () => {
    const { alreadySent, markSent } = await import("./sentOnce");
    redis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await alreadySent("k")).toBe(true);
    expect(await alreadySent("k")).toBe(false);
    await markSent("k");
    expect(redis.set).toHaveBeenCalledWith("k", 1, { ex: 600 });
  });

  it("treats a Redis failure as not sent yet, and carries on after a failed record", async () => {
    const { alreadySent, markSent } = await import("./sentOnce");
    redis.exists.mockRejectedValueOnce(new Error("down"));
    expect(await alreadySent("k")).toBe(false);
    redis.set.mockRejectedValueOnce(new Error("down"));
    await expect(markSent("k")).resolves.toBeUndefined();
  });

  it("claims a key once, and counts it when Redis fails", async () => {
    const { claimOnce } = await import("./sentOnce");
    redis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("down"));
    expect(await claimOnce("c", 30)).toBe(true);
    expect(await claimOnce("c", 30)).toBe(false);
    expect(await claimOnce("c", 30)).toBe(true);
    expect(redis.set).toHaveBeenCalledWith("c", 1, { nx: true, ex: 30 });
  });
});

describe("Redis needs both its address and its token", () => {
  it("falls back to local memory when either is missing", async () => {
    const { alreadySent } = await import("./sentOnce");
    for (const [url, token] of [["https://redis.example", ""], ["", "t"]]) {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
      expect(await alreadySent(`only-one-${url}`)).toBe(false);
    }
    expect(redis.ctor).not.toHaveBeenCalled();
    expect(redis.exists).not.toHaveBeenCalled();
  });
});

describe("taking turns with Redis", () => {
  it("uses the shared counter, and a random turn when Redis fails", async () => {
    const { nextTurn } = await import("./sentOnce");
    redis.incr.mockResolvedValueOnce(7);
    expect(await nextTurn("turn")).toBe(7);
    expect(redis.incr).toHaveBeenCalledWith("turn");
    redis.incr.mockRejectedValueOnce(new Error("down"));
    const spin = vi.spyOn(Math, "random").mockReturnValue(0.25);
    expect(await nextTurn("turn")).toBe(2 ** 29);
    spin.mockRestore();
  });
});
