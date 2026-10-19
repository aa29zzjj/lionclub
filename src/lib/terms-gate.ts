import { NextResponse } from "next/server";
import { TERMS_VERSION } from "./terms";

export function hasAcceptedCurrentTerms(member: { termsVersion: string | null; termsAcceptedAt: Date | null }) {
  return member.termsAcceptedAt !== null && member.termsVersion === TERMS_VERSION;
}

/** Content-posting endpoints call this so no one publishes before agreeing to the content rules. */
export function termsRequiredResponse() {
  return NextResponse.json({ error: "發布內容前，請先閱讀並同意使用條款。", code: "TERMS_REQUIRED" }, { status: 403 });
}
