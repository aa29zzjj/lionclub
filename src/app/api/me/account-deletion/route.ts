// Retired by product decision. Do not inspect the request, session, proof or DB.
// Existing, previously committed cleanup jobs remain a separate operator concern.
export async function POST() {
  return Response.json({
    code: "ACCOUNT_DELETION_REMOVED",
    error: "自助刪除帳號功能已移除；此操作不會刪除資料，也不會建立申請。",
    accountDeleted: false,
    requestCreated: false,
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
