import { describe, expect, it } from "vitest";
import { withoutUndefined } from "./withoutUndefined";

describe("withoutUndefined", () => {
  it("drops keys that are undefined and keeps every other value, null, 0, false and empty included", () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: null, d: 0, e: false, f: "", g: [] })).toEqual({ a: 1, c: null, d: 0, e: false, f: "", g: [] });
    expect("b" in withoutUndefined({ b: undefined })).toBe(false);
  });

  it("keeps a key named __proto__ as data and never touches the prototype", () => {
    const hostile: object = JSON.parse('{"__proto__": {"polluted": true}, "a": 1, "b": null}');
    const out = withoutUndefined(hostile);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.keys(out)).toEqual(["__proto__", "a", "b"]);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    // As sent to the database: the key travels as data, like the input's own.
    expect(JSON.parse(JSON.stringify(out))).toEqual(JSON.parse(JSON.stringify(hostile)));
  });

  it("gives back an ordinary object: its keys can be changed, deleted and listed", () => {
    const out: { a?: number; b?: number } = withoutUndefined({ a: 1, b: 2 });
    out.a = 10;
    expect(out.a).toBe(10);
    delete out.b;
    expect(Object.keys(out)).toEqual(["a"]);
    expect(Object.getOwnPropertyDescriptor(out, "a")).toEqual({ value: 10, writable: true, enumerable: true, configurable: true });
    expect({ ...withoutUndefined({ c: 3 }) }).toEqual({ c: 3 });
  });

  it("does not change its input", () => {
    const input = { a: undefined, b: 2 };
    withoutUndefined(input);
    expect(input).toEqual({ a: undefined, b: 2 });
  });
});
