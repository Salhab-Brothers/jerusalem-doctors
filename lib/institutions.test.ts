import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { WorkplaceType } from "@/lib/workplace";
import { db } from "@/test/fakeSupabase";
import { type Institution, institutionsMatching, matchInstitution, matchKey, withHmoIds } from "./institutions";
import { INSTITUTIONS_SEED } from "./institutionsSeed";

const LIST: Institution[] = INSTITUTIONS_SEED.map((s) => ({ id: s.name_ar, ...s }));
const m = (name: string, type: "hospital" | "clinic" | "hmo") => matchInstitution(LIST, name, type);

// Every workplace name in production on 2026-10-19, with what it should link to.
const REAL: [string, "hospital" | "clinic" | "hmo", string | null][] = [
  ["טרם", "clinic", "تيريم"],
  ["כללית", "clinic", "كلاليت"],
  ["לב ביתר", "clinic", null],
  ["קופת חולים כללית كوبات حوليم كلاليت", "clinic", "كلاليت"],
  ["רמות ,פסגת זאב", "clinic", null],
  ["القدس", "clinic", null],
  ["تيريم", "clinic", "تيريم"],
  ["صناديق المرضى مؤوحيدت", "clinic", "مئوحيدت"],
  ["صناديق المضى كلاليت", "clinic", "كلاليت"],
  ["عيادات كلاليت السكري الضيخ جراح والموشافاه", "clinic", "كلاليت"],
  ["عيادة خاصة", "clinic", null],
  ["عيادة كلاليت التفسية كريات يوفيل وبيت حنينا", "clinic", "كلاليت"],
  ["عيادة كلاليت بيت صفافا", "clinic", "كلاليت"],
  ["كلاليت -القدس", "clinic", "كلاليت"],
  ["كوبات حوليم كلاليت", "clinic", "كلاليت"],
  ["لؤميت صورباهر", "clinic", "لئوميت"],
  ["لؤوميت و مكابي", "clinic", null],
  ["لئوميت", "clinic", "لئوميت"],
  ["مؤحيدت", "clinic", "مئوحيدت"],
  ["مكابي", "clinic", "مكابي"],
  ["מרפאת יפת השמש", "hmo", null],
  ["مقاصد", "hmo", "المقاصد"],
  ["המרכז הירושלמי לבריאות הנפש-مركز القدس للصحة النفسية- كفار شؤول", "hospital", "مركز القدس للصحة النفسية (كفار شاؤول)"],
  ["משגב לדך", "hospital", "مسغاف لداخ"],
  ["القدس", "hospital", null],
  ["شعري تسيدك- שערי צדק", "hospital", "شعاري تسيدك"],
  ["شعري تصيدق", "hospital", "شعاري تسيدك"],
  ["شعري تصيديق", "hospital", "شعاري تسيدك"],
  ["شعريه تسيدك", "hospital", "شعاري تسيدك"],
  ["طبيبة مقيمة في هداسا العيسوية", "hospital", "هداسا جبل المشارف"],
  ["عيادات كلاليت", "hospital", "كلاليت"],
  ["مستشفى أسوتا", "hospital", "أسوتا"],
  ["مستشفى برزلاي", "hospital", "برزلاي"],
  ["مستشفى جرياتريا בית בלב", "hospital", "بيت بالب"],
  ["مستشفى شعري تسيدك", "hospital", "شعاري تسيدك"],
  ["مستشفى هداسا عين كارم", "hospital", "هداسا عين كارم"],
  ["مستشفى هشارون", "hospital", "هشارون"],
  ["مستشفى وولفسون", "hospital", "وولفسون"],
  ["مسجات لداخ موحيدت", "hospital", "مسغاف لداخ"],
  ["مشتشفى اساف هروفا/ شمير", "hospital", "أساف هروفيه (شمير)"],
  ["هداسا العيسوية", "hospital", "هداسا جبل المشارف"],
  ["هداسا عين كارم", "hospital", "هداسا عين كارم"],
  ["هداسا هار هتسوفيم", "hospital", "هداسا جبل المشارف"],
  ["هداسا", "hospital", "هداسا (الفرعان)"],
];

describe("matchInstitution on every production workplace name", () => {
  it.each(REAL)("%s (%s) -> %s", (name, type, expected) => {
    expect(m(name, type)).toBe(expected);
  });

  it("prefers the most specific institution", () => {
    expect(m("مستشفى هداسا عين كارم", "hospital")).toBe("هداسا عين كارم");
    expect(m("هداسا العيسوية", "hospital")).toBe("هداسا جبل المشارف");
    expect(m("هداسا الفرعين", "hospital")).toBe("هداسا (الفرعان)");
    expect(m("לאומית ומכבי", "clinic")).toBeNull();
  });

  it("links a name that is exactly a spelling, whatever type was picked", () => {
    expect(m("مقاصد", "hmo")).toBe("المقاصد");
    expect(m("المقاصد", "clinic")).toBe("المقاصد");
  });

  it("keeps hospitals to workplaces entered as hospitals", () => {
    expect(m("عيادة العيون في المقاصد", "clinic")).toBeNull();
    expect(m("مستشفى المقاصد", "hospital")).toBe("المقاصد");
  });
});

describe("matchKey", () => {
  it("folds hamza forms, punctuation and Hebrew marks", () => {
    expect(matchKey("لؤوميت-القدس")).toBe(matchKey("لووميت القدس"));
    expect(matchKey("שַׁעֲרֵי צֶדֶק")).toBe("שערי צדק");
  });
});

describe("institutionsMatching (search)", () => {
  it("finds an institution by any spelling, or by part of its name", () => {
    expect(institutionsMatching(LIST, "شعري")).toContain("شعاري تسيدك");
    expect(institutionsMatching(LIST, "כללית")).toEqual(["كلاليت"]);
    expect(institutionsMatching(LIST, "x")).toEqual([]);
  });
});

describe("relinkWorkplaces", () => {
  it("writes only rows whose institution changes, and reports unclaimed names", async () => {
    const { db } = await import("@/test/fakeSupabase");
    const { relinkWorkplaces } = await import("./institutions");
    db.reset();
    db.queue("institutions", {
      data: [
        { id: "szmc", name_ar: "شعاري تسيدك", name_he: "שערי צדק", kind: "hospital", aliases: ["شعري تسيدك"] },
        { id: "clalit", name_ar: "كلاليت", name_he: "כללית", kind: "hmo", aliases: [] },
      ],
    });
    db.queue("doctor_workplaces", {
      data: [
        { id: "w1", name: "مستشفى شعري تسيدك", workplace_type: "hospital", institution_id: null },
        { id: "w2", name: "كلاليت الشيخ جراح", workplace_type: "clinic", institution_id: "clalit" },
        { id: "w3", name: "هداسا", workplace_type: "hospital", institution_id: null },
        { id: "w4", name: "عيادة خاصة", workplace_type: "clinic", institution_id: null },
      ],
    });
    const result = await relinkWorkplaces(db.client as never);
    expect(result).toEqual({ changed: 1, unmatched: [{ name: "هداسا", count: 1 }] });
    expect(db.argsOf("doctor_workplaces", "update")).toEqual([[{ institution_id: "szmc" }]]);
    expect(db.argsOf("doctor_workplaces", "in")).toEqual([["id", ["w1"]]]);
  });
});

describe("institutionUsage", () => {
  it("lists each institution's doctors by name (staff accounts left out), and the unlinked names with who typed them", async () => {
    const { db } = await import("@/test/fakeSupabase");
    const { institutionUsage } = await import("./institutions");
    db.reset();
    db.queue("doctor_workplaces", {
      data: [
        { doctor_id: "d1", name: "كلاليت", workplace_type: "clinic", institution_id: "clalit" },
        { doctor_id: "d2", name: "كلاليت الشيخ جراح", workplace_type: "clinic", institution_id: "clalit" },
        { doctor_id: "d1", name: "كلاليت بيت حنينا", workplace_type: "clinic", institution_id: "clalit" },
        { doctor_id: "staff", name: "كلاليت", workplace_type: "clinic", institution_id: "clalit" },
        { doctor_id: "d3", name: "القدس", workplace_type: "hospital", institution_id: null },
        { doctor_id: "d2", name: "القدس", workplace_type: "hospital", institution_id: null },
        // The same doctor twice: the count is doctors, not rows.
        { doctor_id: "d2", name: "القدس", workplace_type: "hmo", institution_id: null },
        // A staff account is still named under an unlinked name: the point
        // there is to reach whoever typed it.
        { doctor_id: "staff", name: "ايخيلوف", workplace_type: "hospital", institution_id: null },
        { doctor_id: "d3", name: "عيادة خاصة", workplace_type: "clinic", institution_id: null },
      ],
    });
    db.queue("doctors", {
      data: [
        { id: "d1", arabic_first_name: "ليلى", arabic_family_name: "الخطيب" },
        { id: "d2", arabic_first_name: "أحمد", arabic_family_name: "سلهب" },
        { id: "d3", arabic_first_name: "رنا", arabic_family_name: "حدّاد" },
        { id: "staff", arabic_first_name: "إدارة", arabic_family_name: "الموقع", is_admin: true, is_visible: false },
      ],
    });
    const usage = await institutionUsage(db.client as never);
    expect(usage.doctors.clalit!.map((d) => d.name)).toEqual(["أحمد سلهب", "ليلى الخطيب"]);
    expect(usage.unmatched).toEqual([
      {
        name: "القدس",
        count: 2,
        doctors: [
          { id: "d2", name: "أحمد سلهب" },
          { id: "d3", name: "رنا حدّاد" },
        ],
      },
      { name: "ايخيلوف", count: 1, doctors: [{ id: "staff", name: "إدارة الموقع" }] },
    ]);
  });
});

describe("withHmoIds", () => {
  const service = db.client as unknown as SupabaseClient;
  const FUNDS = [
    { id: "f1", name_ar: "كلاليت", name_he: "כללית", kind: "hmo", aliases: [] },
    { id: "h1", name_ar: "كلاليت", name_he: "x", kind: "hospital", aliases: [] },
  ];

  it("turns a clinic's fund name into the fund's id, ignoring other kinds and unknown names", async () => {
    db.reset();
    db.queue("institutions", { data: FUNDS });
    const rows = await withHmoIds(service, [
      { name: "عيادة", hmo: "كلاليت" },
      { name: "عيادة أخرى", hmo: "صندوق لا وجود له" },
      { name: "هداسا", hmo: null },
    ]);
    expect(rows).toEqual([
      { name: "عيادة", hmo_id: "f1" },
      { name: "عيادة أخرى", hmo_id: null },
      { name: "هداسا", hmo_id: null },
    ]);
  });

  it("does not query when no row names a fund", async () => {
    db.reset();
    expect(await withHmoIds(service, [{ name: "هداسا", hmo: null }])).toEqual([{ name: "هداسا", hmo_id: null }]);
    expect(db.calls).toHaveLength(0);
  });
});

describe("Sheba and Assaf Harofeh are different hospitals", () => {
  it.each([
    ["تل هشومير شيبا", "شيبا تل هشومير"],
    ["شيبا تل هشومير", "شيبا تل هشومير"],
    ["مستشفى شيبا", "شيبا تل هشومير"],
    ["שיבא", "شيبا تل هشومير"],
    ["مستشفى اساف هروفا", "أساف هروفيه (شمير)"],
  ])("%s -> %s", (name, expected) => {
    expect(m(name, "hospital")).toBe(expected);
  });

  it("keeps the two hospitals' spellings apart", () => {
    const assaf = INSTITUTIONS_SEED.find((i) => i.name_ar === "أساف هروفيه (شمير)")!;
    const sheba = INSTITUTIONS_SEED.find((i) => i.name_ar === "شيبا تل هشومير")!;
    const shared = assaf.aliases.filter((a) => sheba.aliases.includes(a));
    expect(shared).toEqual([]);
  });
});

// The matching as it was before the institutions' keys were cached: each key
// worked out again on every call. The cached version must answer exactly as this does.
const keysFresh = (i: Institution) => [i.name_ar, i.name_he ?? "", ...i.aliases].map(matchKey).filter((k) => k.length >= 3);
function matchReference(institutions: readonly Institution[], name: string, workplaceType: WorkplaceType): string | null {
  const exact = matchKey(name);
  const exactHits = institutions.filter((i) => keysFresh(i).includes(exact));
  if (exactHits.length === 1) return exactHits[0]?.id ?? null;
  const key = ` ${exact} `;
  const matched = institutions
    .filter((i) => i.kind !== "hospital" || workplaceType === "hospital")
    .map((i) => ({ i, all: keysFresh(i), keys: keysFresh(i).filter((k) => key.includes(k)) }))
    .filter((x) => x.keys.length > 0);
  const hits = matched
    .filter((x) => !matched.some((o) => o !== x && x.keys.every((k) => o.all.some((ok) => ok !== k && ok.includes(k)))))
    .map((x) => x.i);
  if (hits.length === 1) return hits[0]?.id ?? null;
  const hospitals = hits.filter((i) => i.kind === "hospital");
  return workplaceType === "hospital" && hospitals.length === 1 ? (hospitals[0]?.id ?? null) : null;
}

const TYPES: WorkplaceType[] = ["hospital", "clinic", "hmo"];

describe("matchInstitution with its keys cached", () => {
  // Every production name, every spelling of every institution, two institutions
  // named together, a spelling with a word added, and names that are nothing.
  const names = [
    ...REAL.map(([name]) => name),
    ...LIST.flatMap((i) => [i.name_ar, i.name_he ?? "", ...i.aliases]),
    ...LIST.flatMap((a, n) => [`${a.name_ar} و ${LIST[(n * 7 + 3) % LIST.length]!.name_ar}`, `${a.name_ar} فرع ${n}`, `${a.aliases[0] ?? a.name_ar} القدس`]),
    "", "  ", "عيادة خاصة", "xyz", "123456", "مستشفى", "مركز", "القدس", "בית חולים",
  ];

  it("answers as the uncached matching does, for every name and every workplace type", () => {
    let none = 0;
    let some = 0;
    for (const name of names) {
      for (const type of TYPES) {
        expect(matchInstitution(LIST, name, type), `${name} / ${type}`).toBe(matchReference(LIST, name, type));
        if (matchInstitution(LIST, name, type)) some++;
        else none++;
      }
    }
    // The comparison is only worth something if it saw both kinds of answer.
    expect(some).toBeGreaterThan(100);
    expect(none).toBeGreaterThan(100);
  });

  it("answers the same the second time, and the same with a fresh copy of the list", () => {
    const copy: Institution[] = LIST.map((i) => ({ ...i, aliases: [...i.aliases] }));
    for (const name of names.slice(0, 120)) {
      const first = matchInstitution(LIST, name, "hospital");
      expect(matchInstitution(LIST, name, "hospital"), name).toBe(first);
      expect(matchInstitution(copy, name, "hospital"), name).toBe(first);
    }
  });

  it("picks up a changed institution when the next fetch hands out new objects", () => {
    const before: Institution[] = [{ id: "x", name_ar: "مستشفى الأمل", name_he: null, kind: "hospital", aliases: [] }];
    expect(matchInstitution(before, "دار الشفاء", "hospital")).toBeNull();
    const after: Institution[] = [{ ...before[0]!, aliases: ["دار الشفاء"] }];
    expect(matchInstitution(after, "دار الشفاء", "hospital")).toBe("x");
    // The old objects still answer as they did: nothing was shared between the two lists.
    expect(matchInstitution(before, "دار الشفاء", "hospital")).toBeNull();
    const renamed: Institution[] = [{ ...after[0]!, name_ar: "مستشفى النور", aliases: [] }];
    expect(matchInstitution(renamed, "مستشفى الأمل", "hospital")).toBeNull();
    expect(matchInstitution(renamed, "مستشفى النور", "hospital")).toBe("x");
  });

  it("stays fast: 1,000 workplaces against 150 institutions in well under a second (it took about 2 s before keys were cached)", () => {
    const many: Institution[] = Array.from({ length: 150 }, (_, i) => ({
      id: `i${i}`, name_ar: `${LIST[i % LIST.length]!.name_ar} فرع ${i}`, name_he: i % 2 ? `כהן${i}` : null,
      kind: (["hospital", "hmo", "clinic_network"] as const)[i % 3]!, aliases: [`alias ${i}a`, `نسخة ${i}`, `فرع ${i} الشمالي`],
    }));
    const started = performance.now();
    for (let n = 0; n < 1_000; n++) matchInstitution(many, `${LIST[n % LIST.length]!.name_ar} ${n % 40}`, TYPES[n % 3]!);
    expect(performance.now() - started).toBeLessThan(600);
  });
});

describe("relinkWorkplaces with many rows going to one institution", () => {
  it("moves them all, in order, in chunks of 150", async () => {
    const { db } = await import("@/test/fakeSupabase");
    const { relinkWorkplaces } = await import("./institutions");
    db.reset();
    db.queue("institutions", { data: [{ id: "clalit", name_ar: "كلاليت", name_he: "כללית", kind: "hmo", aliases: [] }] });
    db.queue("doctor_workplaces", {
      data: Array.from({ length: 400 }, (_, i) => ({ id: `w${i}`, name: "كلاليت", workplace_type: "clinic", institution_id: null })),
    });
    const result = await relinkWorkplaces(db.client as never);
    expect(result).toEqual({ changed: 400, unmatched: [] });
    const chunks = db.argsOf("doctor_workplaces", "in").map(([, ids]) => ids as string[]);
    expect(chunks.map((c) => c.length)).toEqual([150, 150, 100]);
    expect(chunks.flat()).toEqual(Array.from({ length: 400 }, (_, i) => `w${i}`));
  });
});

