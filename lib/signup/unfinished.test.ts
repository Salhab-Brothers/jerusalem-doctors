import { describe, expect, it } from "vitest";
import { INITIAL } from "./formState";
import { hashResumeToken, keepCutoff, newResumeToken, purgeUnfinished, readResumeForm, toFormState } from "./unfinished";

describe("toFormState", () => {
  it("restores what the doctor typed, and asks for consent again", () => {
    const form = toFormState({
      ...INITIAL,
      phone: "0521234567",
      arabic_first_name: "سارة",
      stage: "specialist",
      specialty_ids: ["a", "b"],
      seeking_work: true,
      consent: true,
      pledge: true,
      workplaces: [{ name: "المقاصد", workplace_type: "hospital", details: "", address: "", hours: "", phone: "", is_primary: true }],
    });
    expect(form).toMatchObject({ phone: "0521234567", arabic_first_name: "سارة", stage: "specialist", specialty_ids: ["a", "b"], seeking_work: true, consent: false, pledge: false });
    expect(form.workplaces[0].name).toBe("المقاصد");
    // Saved before clinics had a fund.
    expect(form.workplaces[0].hmo).toBe("");
  });

  it("falls back to the empty form for anything of the wrong shape", () => {
    const form = toFormState({ phone: 5, stage: "surgeon", specialty_ids: [1], workplaces: [{ name: "x" }], extra: "ignored" });
    expect(form).toEqual(INITIAL);
    expect(toFormState(null)).toEqual(INITIAL);
    expect(toFormState("nope")).toEqual(INITIAL);
  });
});

describe("resume tokens", () => {
  it("are long, unguessable and stored only as a hash", () => {
    const a = newResumeToken();
    expect(a).toMatch(/^[\w-]{32}$/);
    expect(newResumeToken()).not.toBe(a);
    expect(hashResumeToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResumeToken(a)).toBe(hashResumeToken(a));
  });

  it("keep 30 days of signups", () => {
    expect(keepCutoff(Date.parse("2026-10-31T00:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("readResumeForm and purgeUnfinished", () => {
  const client = (result: { data?: unknown; error?: unknown; count?: number | null }) => {
    const c: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: null, ...result }).then(ok) };
    for (const m of ["select", "eq", "gte", "lt", "delete", "maybeSingle"]) c[m] = () => c;
    return { from: () => c } as never;
  };
  const TOKEN = "a".repeat(32);

  it("returns the saved form for a known link", async () => {
    const form = await readResumeForm(client({ data: { payload: { resume_form: { phone: "0521234567" } } } }), TOKEN);
    expect(form).toMatchObject({ phone: "0521234567", consent: false });
  });

  it("returns nothing for a malformed link, an unknown one, or a signup with no saved form", async () => {
    expect(await readResumeForm(client({}), "short")).toBeNull();
    expect(await readResumeForm(client({ data: null }), TOKEN)).toBeNull();
    expect(await readResumeForm(client({ data: { payload: {} } }), TOKEN)).toBeNull();
  });

  it("throws on a failed read, so the page does not pretend the link is unknown", async () => {
    await expect(readResumeForm(client({ error: { message: "boom" } }), TOKEN)).rejects.toThrow("pending_signups read failed: boom");
  });

  it("accepts a link of 20 to 64 URL-safe characters and nothing else, whole", async () => {
    const saved = client({ data: { payload: { resume_form: { phone: "0521234567" } } } });
    for (const ok of ["a".repeat(20), "a".repeat(64), "Ab-_9".repeat(6)]) expect(await readResumeForm(saved, ok), ok).not.toBeNull();
    for (const bad of ["a".repeat(19), "a".repeat(65), `!${"a".repeat(32)}`, `${"a".repeat(32)}!`, `${"a".repeat(32)}\n`, `${"a".repeat(31)} a`]) {
      expect(await readResumeForm(saved, bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("asks the database for the count, which is how it knows how many it deleted", async () => {
    const asked: unknown[][] = [];
    const c: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null, count: 2 }).then(ok) };
    c.delete = (...args: unknown[]) => (asked.push(args), c);
    c.lt = () => c;
    expect(await purgeUnfinished({ from: () => c } as never)).toBe(2);
    expect(asked).toEqual([[{ count: "exact" }]]);
  });

  it("counts what the purge deleted, and throws on a failure", async () => {
    expect(await purgeUnfinished(client({ count: 4 }))).toBe(4);
    expect(await purgeUnfinished(client({ count: null }))).toBe(0);
    await expect(purgeUnfinished(client({ error: { message: "boom" } }))).rejects.toThrow("purge failed");
  });
});

describe("toFormState only takes what has the right type", () => {
  it("takes a list of strings only when every item is one, and never reads workplaces as such a list", () => {
    expect(toFormState({ specialty_ids: ["a", 1] }).specialty_ids).toEqual([]);
    expect(toFormState({ specialty_ids: ["a", "b"] }).specialty_ids).toEqual(["a", "b"]);
    expect(toFormState({ workplaces: ["a", "b"] }).workplaces).toEqual(INITIAL.workplaces);
  });

  const wp = { name: "ج", workplace_type: "hospital", details: "d", address: "a", hours: "h", phone: "p", is_primary: true };

  it("drops a workplace missing any field, or with one of the wrong type", () => {
    for (const k of ["name", "details", "address", "hours", "phone"] as const) {
      expect(toFormState({ workplaces: [{ ...wp, [k]: 5 }] }).workplaces, `${k} wrong type`).toEqual(INITIAL.workplaces);
      const without: Partial<typeof wp> = { ...wp };
      delete without[k];
      expect(toFormState({ workplaces: [without] }).workplaces, `${k} missing`).toEqual(INITIAL.workplaces);
    }
    expect(toFormState({ workplaces: [{ ...wp, is_primary: "yes" }] }).workplaces).toEqual(INITIAL.workplaces);
    expect(toFormState({ workplaces: [{ workplace_type: "clinic", is_primary: true }] }).workplaces).toEqual(INITIAL.workplaces);
    expect(toFormState({ workplaces: [wp] }).workplaces).toEqual([{ ...wp, hmo: "" }]);
  });
});

describe("toFormState with odd workplaces", () => {
  it("drops a workplace that is not an object or has a wrong type", () => {
    const wp = { name: "ج", workplace_type: "hospital", details: "", address: "", hours: "", phone: "", is_primary: true };
    const form = toFormState({ workplaces: [null, "x", { ...wp, workplace_type: "moon" }, { ...wp, hmo: "كلاليت" }] });
    expect(form.workplaces).toHaveLength(1);
    expect(form.workplaces[0].hmo).toBe("كلاليت");
  });
});
