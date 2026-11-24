import { describe, expect, it } from "vitest";
import { withoutUndefined } from "./withoutUndefined";

describe("withoutUndefined", () => {
  it("drops keys that are undefined and keeps every other value, null, 0, false and empty included", () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: null, d: 0, e: false, f: "", g: [] })).toEqual({ a: 1, c: null, d: 0, e: false, f: "", g: [] });
    expect("b" in withoutUndefined({ b: undefined })).toBe(false);
  });

  it("does not change its input", () => {
    const input = { a: undefined, b: 2 };
    withoutUndefined(input);
    expect(input).toEqual({ a: undefined, b: 2 });
  });
});
