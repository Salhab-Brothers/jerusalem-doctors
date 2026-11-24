import { describe, expect, it } from "vitest";
import { failureText } from "./failureText";

describe("failureText", () => {
  it("says what to do about an empty balance", () => {
    expect(failureText("sms4free_status_-4")).toContain("اشحنه");
  });
  it("names Supabase's own limit and any other Supabase refusal", () => {
    expect(failureText("supabase_over_sms_send_rate_limit")).toContain("Supabase");
    expect(failureText("supabase_hook_timeout")).toContain("hook_timeout");
  });
  it("keeps an unknown status and an unrecorded reason readable", () => {
    expect(failureText("sms4free_status_-9")).toContain("-9");
    expect(failureText("unknown")).toBe("سبب غير مسجّل");
  });
  const UNRECORDED = "سبب غير مسجّل";

  it("gives every reason its own wording, none of them the fallback", () => {
    const reasons = [
      "daily_cap", "our_rate_limit", "turnstile_failed", "sms4free_timeout", "sms4free_unreadable",
      "number_not_deliverable", "provider_config", "supabase_over_sms_send_rate_limit",
      "sms4free_status_0", "sms4free_status_-1", "sms4free_status_-2", "sms4free_status_-3",
      "sms4free_status_-4", "sms4free_status_-5", "sms4free_status_-6", "sms4free_http_503", "supabase_hook_timeout",
    ];
    const texts = reasons.map(failureText);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(texts).not.toContain(UNRECORDED);
    // The rate-limit reason has its own sentence, not the generic Supabase refusal's.
    expect(failureText("supabase_over_sms_send_rate_limit")).not.toContain("رفضت الطلب");
    // A documented status never reads as the unknown-status sentence.
    for (const s of ["0", "-1", "-2", "-3", "-4", "-5", "-6"]) expect(failureText(`sms4free_status_${s}`)).not.toContain(`(${s})`);
  });

  it("reads any status number, positive or long, and any HTTP status", () => {
    expect(failureText("sms4free_status_4")).toContain("(4)");
    expect(failureText("sms4free_status_-12")).toContain("(-12)");
    expect(failureText("sms4free_http_503")).toContain("503");
    expect(failureText("sms4free_http_404")).toContain("404");
  });

  it("matches a whole reason only: a longer or prefixed one is unrecorded", () => {
    for (const r of [
      "xsms4free_status_-4", "sms4free_status_-4x", "sms4free_status_", "sms4free_status_--4",
      "xsms4free_http_500", "sms4free_http_500x", "sms4free_http_", "sms4free_http_-1",
      "xsupabase_hook", "supabase_", "supabase_a\nb", "",
    ]) {
      expect(failureText(r), r).toBe(UNRECORDED);
    }
  });

  it("names the two ways our own checks stop a request", () => {
    expect(failureText("our_rate_limit")).toContain("حدّنا");
    expect(failureText("turnstile_failed")).toContain("Turnstile");
  });
});
