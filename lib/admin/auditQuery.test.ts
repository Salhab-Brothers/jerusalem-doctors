import { describe, expect, it } from "vitest";
import { auditHref, parseAuditParams } from "./auditQuery";

describe("parseAuditParams", () => {
  it("takes a page only when it is a whole number from 1", () => {
    expect(parseAuditParams({ page: "4" }).page).toBe(4);
    for (const bad of ["4.5", "0", "-1", "x", "", "1e1", "0x10", "+4"]) expect(parseAuditParams({ page: bad }).page, JSON.stringify(bad)).toBe(1);
  });

  it("keeps only what it understands", () => {
    expect(parseAuditParams({ action: "x", from: "2026-13-01", to: "yesterday", people: "yes", page: "0" })).toEqual({
      action: "",
      q: "",
      from: "",
      to: "",
      people: false,
      page: 1,
    });
  });

  it("round-trips through the URL", () => {
    const p = parseAuditParams({ action: "signup_verified", q: " ليلى ", from: "2026-10-01", to: "2026-10-19", people: "1", page: "3" });
    expect(p.q).toBe("ليلى");
    expect(parseAuditParams(Object.fromEntries(new URL(auditHref(p), "http://x").searchParams))).toEqual(p);
  });

  it("leaves the plain log at its plain address", () => {
    expect(auditHref(parseAuditParams({}))).toBe("/admin/audit");
  });
});
