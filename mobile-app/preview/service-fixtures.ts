import type { ServiceHubData } from "../../src/lib/service-contract";
/** Synthetic, network-free visual fixtures. Never imported by the real mobile build. */
export function servicePreviewData(viewerId: string): ServiceHubData {
  const entry = { id: "preview-service-entry", memberId: viewerId, memberName: "合成獅友", organizationName: "預覽分會", eventId: null, title: "社區環境整理服務", date: "2026-10-18", category: "環境服務", minutes: 120, note: "合成資料：清理社區周邊環境，並協助物資整理。", status: "PENDING" as const, version: 1, reviewReason: null, reviewedAt: null };
  return {
    viewerId, year: 2026, memberName: "合成獅友", organizationName: "預覽分會", canReview: true,
    needs: [{ id: "preview-need", kind: "NEED", owner: { id: "preview-partner", name: "合成夥伴", organizationName: "預覽分會" }, title: "一起為社區募集活動空間", category: "場地支援", description: "合成需求：尋找可容納二十人的場地，讓志工一起進行服務交流。", targetDate: "2026-12-10", quantity: 1, quantityUnit: "處", status: "OPEN", version: 1, canManage: false, canRespond: true, completionNote: null, myResponse: null, responses: [] }],
    entries: [entry, { ...entry, id: "preview-confirmed", title: "長者關懷與物資整理", minutes: 240, status: "CONFIRMED", reviewedAt: "2026-10-20T02:00:00Z", reviewReason: "合成幹部已核對紀錄" }],
    reviewEntries: [{ ...entry, id: "preview-other-entry", memberId: "preview-other", memberName: "合成申請人" }],
    totals: { confirmedMinutes: 240, pendingMinutes: 120, confirmedCount: 1, pendingCount: 1 },
    events: [{ id: "preview-service-event", title: "社區同行・秋日服務", location: "合成活動中心", startAt: "2026-10-18T01:00:00Z", registeredCount: 20, checkedInCount: 18, canManage: true, canLinkService: true, outcome: { endAt: "2026-10-18T05:00:00Z", beneficiaryCount: 40, quantity: 40, quantityUnit: "份", totalServiceMinutes: 4320, summary: "合成活動成果：獅友共同完成物資整理與社區關懷。", version: 1 } }],
    nextCursors: { needs: null, entries: null, events: null, review: null },
  };
}
