import { useMemo, useState } from "react";
import { createApiClient } from "./contract";
import MemberDetailScreen from "./MemberDetailScreen";
import TermsConsentPrompt from "./TermsConsentPrompt";
import ServiceHub from "../../src/components/ServiceHub";
import { createServiceTransport } from "../../src/lib/service-client";
import { shareServiceFile } from "./service-export";
declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

export default function ServiceScreen({ memberId, needId }: { memberId: string; needId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const transport = useMemo(() => createServiceTransport(memberId, api.serviceRequest, api.captureSessionGuard()), [memberId]);
  return <><div hidden={selected !== null} style={selected ? { display: "none" } : undefined}><ServiceHub initialNeedId={needId} transport={transport} renderMember={member => <button type="button" onClick={() => setSelected(member.id)}>{member.name}</button>} onExport={file => shareServiceFile(file, transport.isCurrent)} renderTerms={done => <TermsConsentPrompt memberId={memberId} onAccepted={done} />} /></div>{selected && <MemberDetailScreen memberId={selected} onBack={() => setSelected(null)} />}</>;
}
