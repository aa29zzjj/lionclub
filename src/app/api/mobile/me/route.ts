import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { sendVerificationEmail } from "@/lib/email-verification";
import { updateOwnProfile } from "@/lib/member-profile";
import { getAuthAppOrigin } from "@/lib/auth-origin";

type SerializableMember = {
  id: string; name: string; nickname: string | null; email: string | null; title: string | null;
  bio: string | null; phone: string | null; photoUrl: string | null; memberNo: string | null;
  joinYear: number | null; joinMonth: number | null; birthday: Date | null; status: string;
  organization: unknown; tags: unknown; adminRoles: unknown; emailVerifiedAt?: Date | null;
};

function serializeMember(member: SerializableMember) {
  return {
    id: member.id,
    name: member.name,
    nickname: member.nickname,
    email: member.email,
    title: member.title,
    bio: member.bio,
    phone: member.phone,
    photoUrl: member.photoUrl,
    memberNo: member.memberNo,
    joinYear: member.joinYear,
    joinMonth: member.joinMonth,
    birthday: member.birthday,
    status: member.status,
    organization: member.organization,
    tags: member.tags,
    adminRoles: member.adminRoles,
    emailVerifiedAt: member.emailVerifiedAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  return NextResponse.json(serializeMember(auth.member));
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  nickname: z.union([z.string().trim().min(1).max(50), z.literal("")]).optional(),
  title: z.string().optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  tags: z.array(z.string()).optional(),
  photoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  birthday: z.union([z.string().date(), z.literal("")]).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });

  let member;
  try {
    const result = await updateOwnProfile(auth.prisma, auth.session, parsed.data);
    member = result.member;
    if (result.emailChanged) {
      try { await sendVerificationEmail(auth.prisma, { userId: auth.session.userId, appOrigin: getAuthAppOrigin(req.nextUrl.origin) }); }
      catch { console.error("Verification email failed"); }
    }
  } catch (err) {
    if (err instanceof Error && err.message === "PROFILE_SESSION_INVALID") return NextResponse.json({ error: "登入狀態已失效，請重新登入" }, { status: 401 });
    if (err instanceof Error && err.message === "PROFILE_EMAIL_CONFLICT") return NextResponse.json({ error: "此 Email 已被使用" }, { status: 409 });
    if (err && typeof err === "object" && "code" in err && err.code === "P2034") return NextResponse.json({ error: "資料同時更新，請重新載入後再試" }, { status: 409 });
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "此 Email 已被使用" }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json(serializeMember(member));
}
