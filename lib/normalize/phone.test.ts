import { tel } from "@/test/phone";
import { describe, expect, it } from "vitest";
import {
  InvalidPhoneError,
  PhoneNotSmsDeliverableError,
  assertSmsDeliverable,
  formatPhoneDisplay,
  isE164,
  isSmsDeliverable,
  normalizePhone,
  parseE164,
  toSmsRecipient,
} from "./phone";

describe("normalizePhone (Israeli default)", () => {
  it("normalizes Israeli local form 0501234567", () => {
    expect(normalizePhone("0501234567")).toBe("+972501234567");
  });

  it("normalizes plus-prefixed international", () => {
    expect(normalizePhone("+972501234567")).toBe("+972501234567");
  });

  it("normalizes 972 prefix without plus", () => {
    expect(normalizePhone("972501234567")).toBe("+972501234567");
  });

  it("accepts Arabic-Indic digits", () => {
    expect(normalizePhone("٠٥٠١٢٣٤٥٦٧")).toBe("+972501234567");
    expect(normalizePhone("۰۵۰-۱۲۳۴۵۶۷")).toBe("+972501234567");
  });

  it("strips internal hyphens", () => {
    expect(normalizePhone("050-123-4567")).toBe("+972501234567");
    expect(normalizePhone("+972-50-123-4567")).toBe("+972501234567");
  });

  it("strips internal whitespace", () => {
    expect(normalizePhone("050 123 4567")).toBe("+972501234567");
    expect(normalizePhone("  050-123-4567  ")).toBe("+972501234567");
  });

  it("strips parentheses and dots", () => {
    expect(normalizePhone("(050) 123.4567")).toBe("+972501234567");
  });

  it("accepts a different Israeli mobile prefix (053)", () => {
    expect(normalizePhone("0531234567")).toBe("+972531234567");
  });

  it("accepts a Palestinian mobile (+970)", () => {
    expect(normalizePhone("+970599123456")).toBe("+970599123456");
  });

  it("accepts a US number when fully qualified", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("rejects empty strings", () => {
    expect(() => normalizePhone("")).toThrow(InvalidPhoneError);
    expect(() => normalizePhone("   ")).toThrow(InvalidPhoneError);
  });

  it("rejects junk strings", () => {
    expect(() => normalizePhone("hello world")).toThrow(InvalidPhoneError);
  });

  it("rejects too-short numbers", () => {
    expect(() => normalizePhone("0501")).toThrow(InvalidPhoneError);
  });

  it("rejects non-string input gracefully", () => {
    // @ts-expect-error testing runtime behavior
    expect(() => normalizePhone(undefined)).toThrow(InvalidPhoneError);
    // @ts-expect-error testing runtime behavior
    expect(() => normalizePhone(null)).toThrow(InvalidPhoneError);
  });

  it("preserves equivalence: same number, many input forms", () => {
    const variants = [
      "0501234567",
      "+972501234567",
      "972501234567",
      "050-123-4567",
      "(050) 123-4567",
      "  +972 50 123 4567  ",
    ];
    const normalized = variants.map((v) => normalizePhone(v));
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("+972501234567");
  });

  it("is idempotent (normalize twice = normalize once)", () => {
    expect(normalizePhone(normalizePhone("0501234567"))).toBe("+972501234567");
  });
});

describe("formatPhoneDisplay", () => {
  it("formats E.164 to national readable form", () => {
    const out = formatPhoneDisplay("+972501234567");
    // libphonenumber emits "050-123-4567" for IL nationals
    expect(out).toMatch(/050[-\s]?123[-\s]?4567/);
  });

  it("falls back to input on unparseable strings", () => {
    expect(formatPhoneDisplay("not-a-number")).toBe("not-a-number");
  });
});

describe("SMS deliverability (Israeli mobiles only, for now)", () => {
  it("accepts Israeli mobiles across prefixes", () => {
    for (const p of ["+972501234567", "+972521234567", "+972531234567", "+972581234567"]) {
      expect(isSmsDeliverable(p)).toBe(true);
    }
  });

  it("rejects Palestinian +970 numbers", () => {
    expect(isSmsDeliverable("+970599123456")).toBe(false);
  });

  it("rejects Israeli landlines", () => {
    expect(isSmsDeliverable("+97221234567")).toBe(false);
    expect(isSmsDeliverable("+97231234567")).toBe(false);
  });

  it("rejects foreign numbers", () => {
    expect(isSmsDeliverable("+14155552671")).toBe(false);
  });

  it("distinguishes a foreign region from a landline", () => {
    expect(() => assertSmsDeliverable(tel("+970599123456"))).toThrowError(
      PhoneNotSmsDeliverableError,
    );
    try {
      assertSmsDeliverable(tel("+970599123456"));
    } catch (e) {
      expect((e as PhoneNotSmsDeliverableError).reason).toBe("foreign_region");
    }
    try {
      assertSmsDeliverable(tel("+97221234567"));
    } catch (e) {
      expect((e as PhoneNotSmsDeliverableError).reason).toBe("not_mobile");
    }
  });

  it("converts an Israeli mobile to the provider's local form", () => {
    expect(toSmsRecipient(tel("+972501234567"))).toBe("0501234567");
    expect(toSmsRecipient(tel("+972531234567"))).toBe("0531234567");
  });

  it("refuses to reshape a number it cannot deliver to", () => {
    expect(() => toSmsRecipient(tel("+970599123456"))).toThrowError(
      PhoneNotSmsDeliverableError,
    );
  });
});

describe("maskPhone", () => {
  it("keeps enough to recognise a change, not enough to ring it", async () => {
    const { maskPhone } = await import("./phone");
    expect(maskPhone("+972501234567")).toBe("+9725…4567");
    expect(maskPhone("+970599123456")).toBe("+9705…3456");
  });

  it("leaves something too short to mask alone", async () => {
    const { maskPhone } = await import("./phone");
    expect(maskPhone("+97250")).toBe("+97250");
  });
});

describe("E164", () => {
  it("is a plus, a country code that does not start with 0, and 7 to 15 digits in all", () => {
    for (const ok of ["+972501234567", "+14155552671", "+442071838750", "+1234567", "+123456789012345"]) {
      expect(isE164(ok), ok).toBe(true);
      expect(parseE164(ok)).toBe(ok);
    }
    for (const bad of ["", "972501234567", "0501234567", "+0501234567", "+972 50 123 4567", "+972-50-1234567", "+12345", "+1234567890123456", " +972501234567", "+972501234567\n", "+97250123456a", "+٩٧٢٥٠١٢٣٤٥٦٧"]) {
      expect(isE164(bad), JSON.stringify(bad)).toBe(false);
      expect(() => parseE164(bad), JSON.stringify(bad)).toThrow(InvalidPhoneError);
    }
  });

  it("is what normalizePhone returns, for every way a person writes it", () => {
    for (const typed of ["050-123-4567", "0501234567", "+972 50 123 4567", "972501234567", "(050) 123.4567"]) {
      expect(isE164(normalizePhone(typed)), typed).toBe(true);
    }
  });
});
