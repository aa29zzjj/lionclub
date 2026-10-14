import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作登出" }, { status: 403 });
  await destroySession();
  return NextResponse.json({ ok: true });
}
