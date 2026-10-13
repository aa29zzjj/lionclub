import { NextResponse } from "next/server";
import { OnboardingError } from "./central-onboarding";

export function onboardingErrorResponse(error: unknown) {
  if (error instanceof OnboardingError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  console.error("Central onboarding operation failed", { code });
  return NextResponse.json({ error: "服務暫時無法使用，請稍後重試或聯絡管理者" }, { status: 503 });
}
