// A card shows a colleague's number at once only when it arrived with one
// (the admins' «contacts without tap» switch); otherwise it offers the tap.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevealContact } from "@/components/RevealContact";
import { forgetRevealed, revealContact } from "@/lib/revealStore";

const base = { id: "d1", arabic_first_name: "أحمد", arabic_family_name: "الخطيب", has_contact: true, specialties: [], workplaces: [] };
const html = (doctor: Parameters<typeof RevealContact>[0]["doctor"]) => renderToStaticMarkup(createElement(RevealContact, { doctor }));

describe("RevealContact", () => {
  it("offers the tap, and no number, for a card that came without one", () => {
    const out = html(base);
    expect(out).toContain("إظهار الهاتف والبريد");
    expect(out).not.toContain("050-123-4567");
  });

  it("shows the number and email straight away for a card that came with them", () => {
    const out = html({
      ...base,
      contact: { phone_display: "050-123-4567", phone_e164: "+972501234567", email: "a@b.test", whatsapp_url: "https://wa.me/972501234567" },
    });
    expect(out).toContain("050-123-4567");
    expect(out).toContain("a@b.test");
    expect(out).not.toContain("إظهار الهاتف والبريد");
  });

  it("renders nothing for a doctor with nothing to show", () => {
    expect(html({ ...base, has_contact: false })).toBe("");
  });
});

describe("RevealContact: a card that replaces one that was tapped", () => {
  const contact = { phone_display: "050-123-4567", phone_e164: "+972501234567", email: "a@b.test", whatsapp_url: "https://wa.me/972501234567" };
  afterEach(() => {
    forgetRevealed();
    vi.unstubAllGlobals();
  });

  it("shows 'revealing' while the tap that was made on its predecessor is still on its way, with no second request", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    void revealContact("d1");
    const out = html(base);
    expect(out).toContain("جارٍ الإظهار");
    expect(out).toContain("disabled");
    expect(out).not.toContain("050-123-4567");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the number straight away once the predecessor's tap has answered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(contact)));
    await revealContact("d1");
    const out = html(base);
    expect(out).toContain("050-123-4567");
    expect(out).not.toContain("إظهار الهاتف والبريد");
  });

  it("is the plain tap for a doctor nobody has asked about", () => {
    const out = html(base);
    expect(out).toContain("إظهار الهاتف والبريد");
    expect(out).not.toContain("جارٍ الإظهار");
  });
});

