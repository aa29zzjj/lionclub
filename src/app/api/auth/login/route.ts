import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "請輸入帳號與密碼" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { member: true },
  });
  if (!user) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  if (!user.member) {
    return NextResponse.json({ error: "此帳號尚未綁定會員資料" }, { status: 403 });
  }

  if (user.member.status === "PENDING") {
    return NextResponse.json({ error: "您的入會申請尚待審核" }, { status: 403 });
  }
  if (user.member.status === "SUSPENDED") {
    return NextResponse.json({ error: "此帳號已被停權" }, { status: 403 });
  }

  await createSession({ userId: user.id, memberId: user.member.id, email: user.email });

  return NextResponse.json({ ok: true, memberId: user.member.id });
}
