// Numbers that arrive from outside: a JSON body, a header, an environment
// variable, a query string, another service's id. JavaScript's own conversions
// are lenient in ways that have let wrong input through: Number("") is 0,
// Number(" 5 ") is 5, Number("0x10") is 16, Number("1e3") is 1000, and the
// string "5" compares as a number in "5" <= 6. Each helper here accepts exactly
// one shape and answers null for everything else, so the caller must decide
// what a bad value means. Use these, not Number(), for anything not made here.

// 15 digits stay below Number.MAX_SAFE_INTEGER (9007199254740991).
const INTEGER = /^-?\d{1,15}$/;
const DECIMAL = /^-?\d{1,15}(?:\.\d{1,15})?$/;

/** A number a JSON document held as a number: finite, and never a numeric string. */
export function jsonNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A whole number written in plain decimal digits, with an optional minus: "42",
 *  "-7", "007". Not "", " 4", "4.0", "+4", "1e3", "0x10" or digits of another script. */
export function parseInteger(text: string | null | undefined): number | null {
  // + 0 turns -0 into 0.
  return typeof text === "string" && INTEGER.test(text) ? Number(text) + 0 : null;
}

/** A decimal number in plain digits: "10", "2.5", "-0.5". Not "", ".5", "5.", "1e3". */
export function parseDecimal(text: string | null | undefined): number | null {
  return typeof text === "string" && DECIMAL.test(text) ? Number(text) + 0 : null;
}
