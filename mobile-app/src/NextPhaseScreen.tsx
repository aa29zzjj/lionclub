import { useMemo } from "react";
import { createApiClient } from "./contract";
import TermsConsentPrompt from "./TermsConsentPrompt";
import Meetups from "../../src/components/Meetups";
import PhaseInbox from "../../src/components/PhaseInbox";
import type { PhaseNoticeItem } from "../../src/lib/phase-notices";
import BusinessCard from "../../src/components/BusinessCard";
import { createNextPhaseTransport } from "../../src/lib/next-phase-client";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

function usePhaseTransport(memberId: string) {
  return useMemo(() => createNextPhaseTransport((method, query, body) => api.nextPhaseRequest(method, query, body, memberId)), [memberId]);
}
export function NativePhaseInbox({ memberId, open }: { memberId: string; open: (item: PhaseNoticeItem) => void }) {
  const send = usePhaseTransport(memberId);
  return <PhaseInbox send={send} open={open} />;
}
export default function NextPhaseScreen({ memberId, view, meetupId }: { memberId: string; view: "meetups" | "card"; meetupId?: string }) {
  const send = usePhaseTransport(memberId);
  const renderTerms = (done: () => void) => <TermsConsentPrompt memberId={memberId} onAccepted={done} />;
  return <div className="screen">{view === "meetups"
    ? <Meetups key={memberId} initialId={meetupId} send={send} renderTerms={renderTerms} />
    : <BusinessCard key={memberId} send={send} renderTerms={renderTerms} assetPath="./card-ocr/" />}</div>;
}
