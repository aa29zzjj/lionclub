import { useMemo } from "react";
import { createApiClient } from "./contract";
import TermsConsentPrompt from "./TermsConsentPrompt";
import ServiceHub from "../../src/components/ServiceHub";
import { createServiceTransport } from "../../src/lib/service-client";
import { shareServiceFile } from "./service-export";
declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

export default function ServiceScreen({ memberId }: { memberId: string }) {
  const transport = useMemo(() => createServiceTransport(memberId, api.serviceRequest, api.captureSessionGuard()), [memberId]);
  return <ServiceHub transport={transport} onExport={file => shareServiceFile(file, transport.isCurrent)} renderTerms={done => <TermsConsentPrompt memberId={memberId} onAccepted={done} />} />;
}
