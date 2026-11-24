// The admin second factor: asked only of a session that began with a password,
// only while ADMIN_MFA is on, and satisfied only by the TOTP challenge.

import { describe, expect, it } from "vitest";
import { adminSessionRefused, needsSecondFactor, usedPassword } from "./mfa";

const ON = { ADMIN_MFA: "1" };
const claims = (aal: string, ...methods: string[]) => ({ sub: "u1", aal, amr: methods.map((method) => ({ method })) });

describe("needsSecondFactor", () => {
  it("is never asked while the flag is off, so nobody is locked out before enrolling", () => {
    expect(needsSecondFactor(claims("aal1", "password"), {})).toBe(false);
    expect(needsSecondFactor(claims("aal1", "password"), { ADMIN_MFA: "0" })).toBe(false);
  });

  it("asks a password session that has not passed the challenge", () => {
    expect(needsSecondFactor(claims("aal1", "password"), ON)).toBe(true);
  });

  it("lets a password session through once the TOTP challenge raised it to aal2", () => {
    expect(needsSecondFactor(claims("aal2", "password", "totp"), ON)).toBe(false);
  });

  it("does not ask a session that has no password in its history: a phone code, or the smoke check's own link", () => {
    expect(needsSecondFactor(claims("aal1", "otp"), ON)).toBe(false);
    expect(needsSecondFactor(claims("aal1", "magiclink"), ON)).toBe(false);
    expect(needsSecondFactor(claims("aal1"), ON)).toBe(false);
  });

  it("does not ask when there is no session to ask about", () => {
    expect(needsSecondFactor(undefined, ON)).toBe(false);
    expect(needsSecondFactor(null, ON)).toBe(false);
    expect(needsSecondFactor({ sub: "u1" }, ON)).toBe(false);
  });

  it("reads the real environment by default", () => {
    expect(needsSecondFactor(claims("aal1", "password"))).toBe(false);
  });
});

describe("adminSessionRefused: admins do not sign in by phone code", () => {
  const withEmail = (email: string, ...methods: string[]) => ({ ...claims("aal1", ...methods), email });

  it("refuses a session that began with a phone code or a link, whatever the flag says", () => {
    for (const env of [{}, ON]) {
      expect(adminSessionRefused(claims("aal1", "otp"), env)).toBe(true);
      expect(adminSessionRefused(claims("aal1", "magiclink"), env)).toBe(true);
      expect(adminSessionRefused(claims("aal1"), env)).toBe(true);
    }
  });

  it("refuses when there is no session to look at", () => {
    expect(adminSessionRefused(undefined, ON)).toBe(true);
    expect(adminSessionRefused(null, {})).toBe(true);
  });

  it("lets a password session through, and asks it for the code only while the flag is on", () => {
    expect(adminSessionRefused(claims("aal1", "password"), {})).toBe(false);
    expect(adminSessionRefused(claims("aal1", "password"), ON)).toBe(true);
    expect(adminSessionRefused(claims("aal2", "password", "totp"), ON)).toBe(false);
  });

  it("lets the smoke check's own sign-in through: the CI account, matched by its email", () => {
    const env = { CI_LOGIN_EMAIL: "ci@jerusalem-doctors.invalid" };
    expect(adminSessionRefused(withEmail("CI@jerusalem-doctors.invalid", "otp"), { ...env, ...ON })).toBe(false);
    expect(adminSessionRefused(withEmail("someone@example.test", "otp"), env)).toBe(true);
    expect(adminSessionRefused(claims("aal1", "otp"), env)).toBe(true);
    // Not configured: no account is the CI account, even with an empty email.
    expect(adminSessionRefused(withEmail("", "otp"), {})).toBe(true);
  });

  it("has a break-glass: ADMIN_ALLOW_OTP=1 lifts the rule for a lockout", () => {
    expect(adminSessionRefused(claims("aal1", "otp"), { ADMIN_ALLOW_OTP: "1" })).toBe(false);
    expect(adminSessionRefused(claims("aal1", "otp"), { ADMIN_ALLOW_OTP: "0" })).toBe(true);
  });

  it("reads the real environment by default", () => {
    expect(adminSessionRefused(claims("aal1", "otp"))).toBe(true);
  });
});

describe("usedPassword", () => {
  it("says whether a password is in the session's history", () => {
    expect(usedPassword(claims("aal2", "password", "totp"))).toBe(true);
    expect(usedPassword(claims("aal1", "otp"))).toBe(false);
    expect(usedPassword(undefined)).toBe(false);
  });
});
