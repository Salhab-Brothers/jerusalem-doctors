import { afterEach, describe, expect, it, vi } from "vitest";
import { hardenCookie } from "./cookies";

describe("hardenCookie", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hides the session from page scripts and keeps Supabase's other options", () => {
    expect(hardenCookie({ path: "/", sameSite: "lax", maxAge: 60, httpOnly: false })).toEqual({
      path: "/",
      sameSite: "lax",
      maxAge: 60,
      httpOnly: true,
      secure: false,
    });
  });

  it("is https-only where the caller asks for it, and plain http otherwise", () => {
    expect(hardenCookie({ secure: true }).secure).toBe(true);
    expect(hardenCookie({ secure: false }).secure).toBe(false);
    expect(hardenCookie().secure).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(hardenCookie({ secure: false }).secure).toBe(true);
  });

  it("is https-only on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(hardenCookie({}).secure).toBe(true);
  });
});
