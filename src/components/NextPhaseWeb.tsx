"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import Meetups from "./Meetups";
import PhaseInbox from "./PhaseInbox";
import BusinessCard from "./BusinessCard";
import TermsConsentPrompt from "./TermsConsentPrompt";
import { createNextPhaseTransport } from "../lib/next-phase-client";
import "./service-hub.css";
import "./next-phase.css";

function useNextPhaseWeb(memberId: string) {
  return useMemo(() => createNextPhaseTransport(async (method, query, body) => {
    const response = await fetch(`/api/next-phase${query ? `?${query}` : ""}`, {
      method, cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "x-lionclubs-member": memberId },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  }), [memberId]);
}
export function PhaseWebInbox({ memberId }: { memberId: string }) {
  const send = useNextPhaseWeb(memberId);
  const router = useRouter();
  return <PhaseInbox send={send} open={item => router.push(item.target === "meetup"
    ? `/meetups?meetupId=${encodeURIComponent(item.targetId)}`
    : `/services?needId=${encodeURIComponent(item.targetId)}`)} />;
}
export default function NextPhaseWeb({ memberId, view, meetupId }: { memberId: string; view: "meetups" | "card"; meetupId?: string }) {
  const send = useNextPhaseWeb(memberId);
  const renderTerms = (done: () => void) => <TermsConsentPrompt expectedMemberId={memberId} onAccepted={done} />;
  return view === "meetups" ? <Meetups key={memberId} send={send} renderTerms={renderTerms} initialId={meetupId} />
    : <BusinessCard key={memberId} send={send} renderTerms={renderTerms} />;
}
