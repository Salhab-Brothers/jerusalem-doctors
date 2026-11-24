// A phone number in a test, typed as the E164 that production code asks for.

import { type E164, parseE164 } from "@/lib/normalize/phone";

/** A valid E.164 number; throws on anything else, so a typo in a test is loud. */
export const tel = (value: string): E164 => parseE164(value);

/** A string typed as E164 without being checked: only for a test of what the
 *  code does with a value that is NOT one (the type cannot be breached in
 *  production, but the data can be bad). */
export const unchecked = (value: string): E164 => value as E164;
