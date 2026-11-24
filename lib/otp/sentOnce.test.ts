import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sentKey } from "./sentOnce";

describe("sentKey", () => {
  it("is the same for the same phone and code, and holds neither", () => {
    const key = sentKey("+972501234567", "482913", "secret");
    expect(key).toBe(sentKey("+972501234567", "482913", "secret"));
    expect(key).not.toContain("482913");
    expect(key).not.toContain("501234567");
  });

  it("differs for another code, phone or secret", () => {
    const key = sentKey("+972501234567", "482913", "secret");
    expect(sentKey("+972501234567", "482914", "secret")).not.toBe(key);
    expect(sentKey("+972501234568", "482913", "secret")).not.toBe(key);
    expect(sentKey("+972501234567", "482913", "other")).not.toBe(key);
  });
});

describe("without Redis (local memory)", () => {
  const START = 1_000_000;
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("remembers a sent code for ten minutes, to the millisecond", async () => {
    const { alreadySent, markSent } = await import("./sentOnce");
    expect(await alreadySent("local-a")).toBe(false);
    await markSent("local-a");
    expect(await alreadySent("local-a")).toBe(true);
    vi.setSystemTime(START + 600_000 - 1);
    expect(await alreadySent("local-a")).toBe(true);
    vi.setSystemTime(START + 600_000);
    expect(await alreadySent("local-a")).toBe(false);
  });

  it("claims a key once per lifetime, counted in seconds", async () => {
    const { claimOnce } = await import("./sentOnce");
    expect(await claimOnce("local-c", 60)).toBe(true);
    expect(await claimOnce("local-c", 60)).toBe(false);
    vi.setSystemTime(START + 59_999);
    expect(await claimOnce("local-c", 60)).toBe(false);
    vi.setSystemTime(START + 60_000);
    expect(await claimOnce("local-c", 60)).toBe(true);
  });

  it("takes turns at random across the whole range when there is no counter", async () => {
    const { nextTurn } = await import("./sentOnce");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(await nextTurn("t")).toBe(2 ** 30);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(await nextTurn("t")).toBe(0);
  });
});
