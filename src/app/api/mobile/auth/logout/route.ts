import { NextResponse } from "next/server";

/** Tokens are stateless JWTs with no server-side allowlist, so this cannot revoke
 * this one device early — it only documents the client's intent to discard its
 * local tokens. Real cross-device revocation still goes through the existing
 * sessionVersion bump ("登出其他裝置"), which invalidates mobile tokens too. */
export async function POST() {
  return NextResponse.json({ ok: true, note: "請在裝置本機清除 accessToken／refreshToken；此端點不做伺服器端單一裝置撤銷。" });
}
