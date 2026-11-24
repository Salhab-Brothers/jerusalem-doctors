"use client";

// A colleague's number, WhatsApp and email, behind a tap (#16). The card
// carries only that there is something to show; the details come from
// POST /api/doctors/[id]/contact, which counts the doctor against the day's
// budget. Once shown they stay for as long as the card does. When the admins
// turned on «contacts_without_tap» the card arrives with them
// (SearchHit.contact) and shows them at once.

import { useEffect, useState } from "react";
import { ContactButtons } from "@/components/ContactButtons";
import type { SearchHit } from "@/lib/directory";
import { forgetRevealed, pendingReveal, revealContact, revealedContact, type RevealResult } from "@/lib/revealStore";
import { clinicTelHref } from "@/lib/workplace";

type Doctor = Pick<
  SearchHit,
  "id" | "arabic_first_name" | "arabic_family_name" | "has_contact" | "contact" | "specialties" | "workplaces"
>;

type State = { kind: "hidden" } | { kind: "loading" } | RevealResult;

/** On sign-out: the next account in this tab starts with nothing revealed. */
export { forgetRevealed };

export function RevealContact({ doctor, compact = false }: { doctor: Doctor; compact?: boolean }) {
  const [state, setState] = useState<State>(() => {
    const contact = revealedContact(doctor.id);
    if (contact) return { kind: "shown", contact };
    return pendingReveal(doctor.id) ? { kind: "loading" } : { kind: "hidden" };
  });

  // A tap that was on its way when this card replaced the one that was tapped
  // (the search swaps cards for a "searching" line and back) finishes here.
  useEffect(() => {
    const inFlight = pendingReveal(doctor.id);
    if (!inFlight) return;
    let live = true;
    void inFlight.then((result) => {
      if (live) setState(result);
    });
    return () => {
      live = false;
    };
  }, [doctor.id]);

  if (!doctor.has_contact) return null;

  // Sent with the card, or fetched by tap: either way it is what is shown.
  const contact = doctor.contact ?? (state.kind === "shown" ? state.contact : undefined);
  if (!contact) {
    return (
      <div className={compact ? "flex shrink-0 flex-col items-start gap-1" : "flex flex-col items-start gap-1"}>
        <button
          type="button"
          disabled={state.kind === "loading"}
          onClick={() => {
            setState({ kind: "loading" });
            void revealContact(doctor.id).then(setState);
          }}
          className={`inline-flex items-center justify-center rounded-md border border-line bg-surface font-medium hover:bg-foreground/5 disabled:opacity-60 ${compact ? "px-3 py-2 text-sm" : "px-4 py-2.5"}`}
        >
          {state.kind === "loading" ? "جارٍ الإظهار…" : "إظهار الهاتف والبريد"}
        </button>
        {state.kind === "refused" && (
          <p role="alert" className="max-w-xs text-sm text-danger">
            {state.message}
          </p>
        )}
      </div>
    );
  }

  const full = { ...doctor, ...contact };
  return (
    <div className="flex flex-col gap-2">
      {(contact.phone_display || contact.email) && (
        <dl className="flex flex-col gap-1 text-sm">
          {contact.phone_display && (
            <div className="flex items-baseline gap-2">
              <dt className="text-foreground/65">الهاتف:</dt>
              <dd dir="ltr">
                <a href={clinicTelHref(contact.phone_display) ?? undefined} className="hover:underline">
                  {contact.phone_display}
                </a>
              </dd>
            </div>
          )}
          {contact.email && (
            <div className="flex items-baseline gap-2">
              <dt className="text-foreground/65">البريد:</dt>
              <dd dir="ltr" className="break-all">
                {contact.email}
              </dd>
            </div>
          )}
        </dl>
      )}
      <ContactButtons doctor={full} compact={compact} />
    </div>
  );
}
