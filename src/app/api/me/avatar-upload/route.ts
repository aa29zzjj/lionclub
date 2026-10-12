import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/current-member";
import { createS3UploadUrl } from "@/lib/aws-http";

const inputSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
});

const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "圖片需為 JPG、PNG 或 WebP，且不可超過 5 MB" }, { status: 400 });

  const bucket = process.env.AVATAR_BUCKET_NAME;
  const publicBaseUrl = process.env.AVATAR_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";
  if (!bucket || !publicBaseUrl) {
    return NextResponse.json({ error: "大頭貼儲存尚未完成 AWS 設定，請聯絡系統管理員" }, { status: 503 });
  }

  const key = `avatars/${me.id}/${crypto.randomUUID()}.${extensions[parsed.data.contentType]}`;
  const uploadUrl = await createS3UploadUrl({ bucket, region, key, contentType: parsed.data.contentType });
  return NextResponse.json({ uploadUrl, photoUrl: `${publicBaseUrl}/${key}`, expiresIn: 300 });
}
