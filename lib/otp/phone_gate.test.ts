// A number we cannot send a code to is refused on the phone field, before
// Supabase is asked to issue a code, with the message that helps.

import { tel } from "@/test/phone";
import { describe, expect, it } from "vitest";
import { rejectUndeliverablePhone } from "./phone_gate";

describe("rejectUndeliverablePhone", () => {
  it("lets an Israeli mobile number through", () => {
    expect(rejectUndeliverablePhone(tel("+972501234567"))).toBeNull();
  });

  it("tells a foreign number that only +972 works, and a landline to use a mobile", async () => {
    const foreign = rejectUndeliverablePhone(tel("+12025550123"));
    const landline = rejectUndeliverablePhone(tel("+97221234567"));
    for (const res of [foreign, landline]) expect(res?.status).toBe(400);
    const a = await foreign!.json();
    const b = await landline!.json();
    expect(a).toMatchObject({ error: "phone_unsupported", code: "phone_unsupported" });
    expect(a.fields.phone).toContain("+972");
    expect(b.fields.phone).toContain("محمول");
    expect(a.fields.phone).not.toBe(b.fields.phone);
  });

  it("does not swallow an error that is not about the number", () => {
    expect(() => rejectUndeliverablePhone(undefined as never)).toThrow(TypeError);
  });
});
