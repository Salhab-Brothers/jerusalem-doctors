// A reveal that is still on its way when the dashboard swaps its cards must reach
// the card that replaces the tapped one (the e2e tap-target test lost it).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAILED_MESSAGE,
  LIMIT_MESSAGE,
  forgetRevealed,
  pendingReveal,
  revealContact,
  revealedContact,
} from "./revealStore";

const CONTACT = { phone_display: "050-123-4567", phone_e164: "+972501234567", email: "a@b.test", whatsapp_url: "https://wa.me/972501234567" };

/** A fetch whose answer the test releases when it chooses. */
function slowFetch() {
  let release!: (res: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, answer: (res: Response) => release(res) };
}

beforeEach(() => forgetRevealed());
afterEach(() => vi.unstubAllGlobals());

describe("revealContact", () => {
  it("asks for the doctor once, even when two cards ask while it is on its way", async () => {
    const { fetchMock, answer } = slowFetch();
    const first = revealContact("d1");
    expect(pendingReveal("d1")).toBe(first);
    const second = revealContact("d1");
    expect(second).toBe(first);
    answer(Response.json(CONTACT));
    expect(await first).toEqual({ kind: "shown", contact: CONTACT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/doctors/d1/contact", { method: "POST" });
  });

  it("is on its way until it answers, then it is revealed and no longer pending", async () => {
    const { answer } = slowFetch();
    const asked = revealContact("d1");
    expect(pendingReveal("d1")).toBeDefined();
    expect(revealedContact("d1")).toBeUndefined();
    answer(Response.json(CONTACT));
    await asked;
    expect(pendingReveal("d1")).toBeUndefined();
    expect(revealedContact("d1")).toEqual(CONTACT);
  });

  it("treats an answer that is not contact details as a failure, not an empty card", async () => {
    for (const body of [null, [], "x", 5, {}, { phone_display: 5, whatsapp_url: null, phone_e164: null, email: null }, { phone_display: null, whatsapp_url: null, phone_e164: null }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
      expect(await revealContact("d1"), JSON.stringify(body)).toEqual({ kind: "refused", message: FAILED_MESSAGE });
      expect(revealedContact("d1")).toBeUndefined();
    }
    // Nulls are details too: a doctor with no email or no number on the card.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ phone_display: null, whatsapp_url: null, phone_e164: null, email: null })));
    expect((await revealContact("d1")).kind).toBe("shown");
  });

  it("keeps different doctors apart", async () => {
    const fetchMock = vi.fn(async () => Response.json(CONTACT));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([revealContact("d1"), revealContact("d2")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(revealedContact("d1")).toEqual(CONTACT);
    expect(revealedContact("d2")).toEqual(CONTACT);
    expect(revealedContact("d3")).toBeUndefined();
  });

  it("refuses with the limit's words for 429 and a general failure for the rest, and keeps neither", async () => {
    for (const [status, message] of [[429, LIMIT_MESSAGE], [403, FAILED_MESSAGE], [500, FAILED_MESSAGE]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      expect(await revealContact("d1"), String(status)).toEqual({ kind: "refused", message });
      expect(revealedContact("d1")).toBeUndefined();
      expect(pendingReveal("d1")).toBeUndefined();
    }
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await revealContact("d1")).toEqual({ kind: "refused", message: FAILED_MESSAGE });
  });

  it("lets a refused doctor be asked for again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await revealContact("d1");
    const fetchMock = vi.fn(async () => Response.json(CONTACT));
    vi.stubGlobal("fetch", fetchMock);
    expect(await revealContact("d1")).toEqual({ kind: "shown", contact: CONTACT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("forgetRevealed (sign-out)", () => {
  it("clears what was revealed and what was on its way", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(CONTACT)));
    await revealContact("d1");
    const { answer } = slowFetch();
    void revealContact("d2");
    forgetRevealed();
    expect(revealedContact("d1")).toBeUndefined();
    expect(pendingReveal("d2")).toBeUndefined();
    answer(Response.json(CONTACT));
  });

  it("does not let the answer to the account that left reach the next one", async () => {
    const { answer } = slowFetch();
    const before = revealContact("d1");
    forgetRevealed();
    answer(Response.json(CONTACT));
    await before;
    expect(revealedContact("d1")).toBeUndefined();
    expect(pendingReveal("d1")).toBeUndefined();
    // The next account asks for itself.
    const fetchMock = vi.fn(async () => Response.json({ ...CONTACT, email: "next@b.test" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await revealContact("d1")).toEqual({ kind: "shown", contact: { ...CONTACT, email: "next@b.test" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
