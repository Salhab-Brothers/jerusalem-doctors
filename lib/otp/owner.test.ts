// Who a text's number belongs to: the doctor, else the newest unfinished signup.

import { tel } from "@/test/phone";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/test/fakeSupabase";
import { textOwner } from "./owner";

const service = db.client as unknown as SupabaseClient;

describe("textOwner", () => {
  beforeEach(() => db.reset());

  it("is the doctor with that number, before any signup", async () => {
    db.queue("doctors", { data: { id: "d1" } });
    db.queue("pending_signups", { data: { id: "s1" } });
    expect(await textOwner(service, tel("+972501234567"))).toEqual({ doctorId: "d1" });
  });

  it("is the newest signup when no doctor has the number, and nobody when nothing does", async () => {
    db.queue("pending_signups", { data: { id: "s1" } });
    expect(await textOwner(service, tel("+972501234567"))).toEqual({ signupId: "s1" });
    db.reset();
    expect(await textOwner(service, tel("+972501234567"))).toEqual({});
    expect(db.argsOf("pending_signups", "order")).toEqual([["created_at", { ascending: false }]]);
  });
});
