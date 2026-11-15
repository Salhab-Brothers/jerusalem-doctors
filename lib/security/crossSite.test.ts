import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./crossSite";

const HOST = "jerusalem-doctors.vercel.app";

describe("isCrossSiteWrite", () => {
  it("lets a page on our own site post", () => {
    expect(isCrossSiteWrite("POST", `https://${HOST}`, HOST, "same-origin")).toBe(false);
    expect(isCrossSiteWrite("DELETE", `https://${HOST}`, HOST, null)).toBe(false);
  });

  it("refuses a form posted from another site, a sibling subdomain and an opaque origin", () => {
    expect(isCrossSiteWrite("POST", "https://evil.example", HOST, "cross-site")).toBe(true);
    expect(isCrossSiteWrite("POST", "https://other.vercel.app", HOST, "same-site")).toBe(true);
    expect(isCrossSiteWrite("POST", "null", HOST, "cross-site")).toBe(true);
    expect(isCrossSiteWrite("PATCH", "not a url", HOST, null)).toBe(true);
  });

  it("goes by the port as well as the name", () => {
    expect(isCrossSiteWrite("POST", "http://127.0.0.1:3123", "127.0.0.1:3123", null)).toBe(false);
    expect(isCrossSiteWrite("POST", "http://127.0.0.1:9999", "127.0.0.1:3123", null)).toBe(true);
  });

  it("never blocks a read", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(isCrossSiteWrite(m, "https://evil.example", HOST, "cross-site")).toBe(false);
    }
  });

  it("leaves a caller with no Origin alone, unless the browser says cross-site", () => {
    // A webhook, a cron job, a script: they authenticate with their own secret.
    expect(isCrossSiteWrite("POST", null, HOST, null)).toBe(false);
    expect(isCrossSiteWrite("POST", null, HOST, "none")).toBe(false);
    // A browser that sent Fetch Metadata but no Origin still tells on itself.
    expect(isCrossSiteWrite("POST", null, HOST, "cross-site")).toBe(true);
  });
});
