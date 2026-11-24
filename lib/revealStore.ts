// What this tab has revealed of colleagues' contact details, and the requests
// still on their way (#16). The dashboard swaps its cards for a "searching"
// line and back whenever a search runs, which remounts every card. A card that
// asks this store, instead of keeping the answer in its own state, shows the
// number a doctor tapped even when the tap came just before the swap: the
// request is shared, so the card that replaces the tapped one picks it up.
// Memory only, gone with the tab.

import type { ContactDetails } from "@/lib/directory";

export type RevealResult = { kind: "shown"; contact: ContactDetails } | { kind: "refused"; message: string };

export const LIMIT_MESSAGE = "بلغت حد اليوم من إظهار أرقام الزملاء. يتجدّد غدًا، وإن احتجت رقمًا الآن فراسل الإدارة.";
export const FAILED_MESSAGE = "تعذّر إظهار البيانات. حاول مرة أخرى.";

const revealed = new Map<string, ContactDetails>();
const pending = new Map<string, Promise<RevealResult>>();
// Bumped on sign-out: an answer to a request made by the account that left
// must not reach the next one in this tab.
let generation = 0;

const text = (v: unknown) => v === null || typeof v === "string";

/** What the server answered, checked: each field is text or null, as the card expects. */
export function isContactDetails(value: unknown): value is ContactDetails {
  if (typeof value !== "object" || value === null) return false;
  return (
    "phone_display" in value && text(value.phone_display) &&
    "whatsapp_url" in value && text(value.whatsapp_url) &&
    "phone_e164" in value && text(value.phone_e164) &&
    "email" in value && text(value.email)
  );
}

async function request(id: string): Promise<RevealResult> {
  try {
    const res = await fetch(`/api/doctors/${id}/contact`, { method: "POST" });
    if (res.ok) {
      const body: unknown = await res.json();
      // An answer the card cannot show is a failure, not a card with nothing on it.
      return isContactDetails(body) ? { kind: "shown", contact: body } : { kind: "refused", message: FAILED_MESSAGE };
    }
    return { kind: "refused", message: res.status === 429 ? LIMIT_MESSAGE : FAILED_MESSAGE };
  } catch {
    return { kind: "refused", message: FAILED_MESSAGE };
  }
}

/** The details already revealed for this doctor, if any. */
export const revealedContact = (id: string): ContactDetails | undefined => revealed.get(id);

/** The request for this doctor that has not answered yet, if any. */
export const pendingReveal = (id: string): Promise<RevealResult> | undefined => pending.get(id);

/** Reveals one doctor's details. Asking again while a request is on its way
 *  joins it instead of sending another. Only a shown result is kept. */
export function revealContact(id: string): Promise<RevealResult> {
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const mine = generation;
  const started = request(id).then((result) => {
    if (mine === generation) {
      pending.delete(id);
      if (result.kind === "shown") revealed.set(id, result.contact);
    }
    return result;
  });
  pending.set(id, started);
  return started;
}

/** On sign-out: the next account in this tab starts with nothing revealed and nothing on its way. */
export function forgetRevealed(): void {
  generation += 1;
  revealed.clear();
  pending.clear();
}
