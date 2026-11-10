"use client";
import { useMemo } from "react";
import ServiceHub from "./ServiceHub";
import TermsConsentPrompt from "./TermsConsentPrompt";
import { createServiceTransport } from "../lib/service-client";
import "./service-hub.css";
export default function ServiceWebClient({ memberId }: { memberId: string }) {
  const transport = useMemo(() => createServiceTransport(memberId, async (method, query, body, expected) => {
    const response = await fetch(`/api/services${query ? `?${query}` : ""}`, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "x-lionclubs-member": expected }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json().catch(() => null) };
  }), [memberId]);
  return <ServiceHub transport={transport} renderTerms={done => <TermsConsentPrompt expectedMemberId={memberId} onAccepted={done} />} />;
}
