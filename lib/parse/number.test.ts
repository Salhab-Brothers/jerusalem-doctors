import { describe, expect, it } from "vitest";
import { jsonNumber, parseDecimal, parseInteger } from "./number";

describe("jsonNumber", () => {
  it("takes a finite number and nothing that only looks like one", () => {
    for (const n of [0, 1, -4, 2.5, 1_800_000_000, Number.MAX_SAFE_INTEGER]) expect(jsonNumber(n)).toBe(n);
    for (const v of ["5", "", " 5", "1e3", NaN, Infinity, -Infinity, null, undefined, true, [], [5], {}]) {
      expect(jsonNumber(v), String(v)).toBeNull();
    }
  });
});

describe("parseInteger", () => {
  it("takes plain decimal digits with an optional minus", () => {
    expect(parseInteger("42")).toBe(42);
    expect(parseInteger("-7")).toBe(-7);
    expect(parseInteger("007")).toBe(7);
    expect(parseInteger("0")).toBe(0);
    expect(parseInteger("999999999999999")).toBe(999_999_999_999_999);
    expect(Object.is(parseInteger("-0"), 0)).toBe(true);
  });

  it("refuses everything JavaScript's Number() would let through", () => {
    for (const bad of ["", " ", " 4", "4 ", "4\n", "+4", "4.0", "4.", ".4", "1e3", "0x10", "0b1", "Infinity", "NaN", "--4", "4-", "١٢", "1_000", "9999999999999999"]) {
      expect(parseInteger(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseInteger(null)).toBeNull();
    expect(parseInteger(undefined)).toBeNull();
    expect(parseInteger(5 as never)).toBeNull();
  });
});

describe("parseDecimal", () => {
  it("takes plain decimals", () => {
    expect(parseDecimal("10")).toBe(10);
    expect(parseDecimal("2.5")).toBe(2.5);
    expect(parseDecimal("-0.5")).toBe(-0.5);
    expect(parseDecimal("0.25")).toBe(0.25);
    // A minus on zero is not a number worth keeping.
    expect(Object.is(parseDecimal("-0"), 0)).toBe(true);
    expect(Object.is(parseDecimal("-0.0"), 0)).toBe(true);
  });

  it("refuses the rest", () => {
    for (const bad of ["", " 1", "1 ", ".5", "5.", "1e3", "1.2.3", "+1", "0x1", "NaN", "1,5", "1234567890123456"]) {
      expect(parseDecimal(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
});
