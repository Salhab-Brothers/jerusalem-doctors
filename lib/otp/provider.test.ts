import { describe, expect, it } from "vitest";
import { OtpProviderError } from "./provider";

describe("OtpProviderError", () => {
  it("is retryable and 'provider_error' unless it says otherwise", () => {
    const e = new OtpProviderError("down");
    expect(e).toMatchObject({ permanent: false, reason: "provider_error", name: "OtpProviderError", message: "down" });
    expect(new OtpProviderError("bad config", true, undefined, "provider_config")).toMatchObject({ permanent: true, reason: "provider_config" });
  });
});
