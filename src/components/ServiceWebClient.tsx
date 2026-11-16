"use client";
import Link from "next/link";
import { useMemo } from "react";
import ServiceHub from "./ServiceHub";
import TermsConsentPrompt from "./TermsConsentPrompt";
import { createServiceTransport } from "../lib/service-client";
import "./service-hub.css";
export default function ServiceWebClient({ memberId, needId }: { memberId: string; needId?: string }) {
  const transport = useMemo(() => createServiceTransport(memberId, async (method, query, body, expected) => {
    const response = await fetch(`/api/services${query ? `?${query}` : ""}`, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "x-lionclubs-member": expected }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json().catch(() => null) };
  }), [memberId]);
  return <ServiceHub transport={transport} initialNeedId={needId} renderMember={member => <Link className="text-lion-gold underline" href={`/members/${member.id}`}>{member.name}</Link>} renderTerms={done => <TermsConsentPrompt expectedMemberId={memberId} onAccepted={done} />} />;
}
