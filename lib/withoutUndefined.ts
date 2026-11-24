/**
 * The same object without the keys whose value is undefined.
 *
 * For options and database arguments typed `key?: T`: with
 * exactOptionalPropertyTypes a key may be absent but not present as undefined.
 * JSON drops an undefined value anyway, so on the wire nothing changes.
 */
export function withoutUndefined<T extends object>(source: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: { [K in keyof T]?: Exclude<T[K], undefined> } = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) Object.assign(out, { [key]: value });
  }
  return out;
}
