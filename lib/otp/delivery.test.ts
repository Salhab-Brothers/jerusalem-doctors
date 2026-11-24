import { describe, expect, it } from "vitest";
import { deliveryDelaySeconds, deliveryKey, deliveryUrl, newMessageId, validDeliveryKey } from "./delivery";

describe("delivery reports", () => {
  it("accepts only the key made from the hook's secret", () => {
    expect(validDeliveryKey(deliveryKey("s"), "s")).toBe(true);
    expect(validDeliveryKey(deliveryKey("other"), "s")).toBe(false);
    expect(validDeliveryKey(null, "s")).toBe(false);
    expect(validDeliveryKey(deliveryKey("s"), undefined)).toBe(false);
    expect(deliveryKey("s")).not.toContain("s".repeat(2));
  });

  it("reads the send time from our own message id only, whole, and never from the future", () => {
    const now = 1_800_000_000_000;
    expect(deliveryDelaySeconds(`${now}-deadbeef`, now)).toBe(0);
    expect(deliveryDelaySeconds(`${now - 5_000}-deadbeef`, now)).toBe(5);
    for (const bad of [
      `x${now - 5_000}-deadbeef`, `${now - 5_000}-deadbeef0`, `${now - 5_000}-deadbee`, `${now - 5_000}-DEADBEEF`,
      `${now + 1}-deadbeef`, "0000000000000-deadbeef", `${now - 5_000}-deadbeef\n`,
    ]) {
      expect(deliveryDelaySeconds(bad, now), bad).toBeNull();
    }
  });

  it("asks for reports in production, or where a base is given, never without the secret", () => {
    const secret = { SEND_SMS_HOOK_SECRET: "s" };
    expect(deliveryUrl({ ...secret, VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "jd.example" })).toBe(
      `https://jd.example/api/sms/delivery?k=${deliveryKey("s")}`,
    );
    expect(deliveryUrl({ ...secret, VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "jd.example" })).toBeNull();
    expect(deliveryUrl({ ...secret, SMS_DELIVERY_BASE_URL: "http://localhost:3123" })).toMatch(/^http:\/\/localhost:3123\/api\/sms\/delivery\?k=/);
    expect(deliveryUrl({ SMS_DELIVERY_BASE_URL: "http://localhost:3123" })).toBeNull();
  });

  it("reads the delay back from our message id", () => {
    const now = 1_800_000_000_000;
    expect(deliveryDelaySeconds(newMessageId(now - 42_400), now)).toBe(42);
    expect(deliveryDelaySeconds("not-ours", now)).toBeNull();
    expect(deliveryDelaySeconds(null, now)).toBeNull();
    // A send time in the future isn't ours either.
    expect(deliveryDelaySeconds(newMessageId(now + 5_000), now)).toBeNull();
  });
});
