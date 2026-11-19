import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";

export const dynamic = "force-dynamic";

const tools = [
  { href: "/admin/pending-members", title: "審核新會員", description: "查看各分會申請，協助核准入會。" },
  { href: "/admin/member-assignment", title: "會員分會分派", description: "處理原暫存分會的會員，核對正式所屬分會。" },
  { href: "/admin/roles", title: "管理幹部權限", description: "授予與撤銷分會幹部權限。" },
  { href: "/admin/invites", title: "入會邀請", description: "建立新會員註冊邀請。" },
  { href: "/admin/pending-experiences", title: "審核會員資歷", description: "核對會員提交的任職紀錄。" },
  { href: "/admin/reports", title: "檢舉管理", description: "處理會員與內容檢舉。" },
];

export default async function AdminPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  const prisma = await getPrisma();
  const role = await prisma.adminRole.findFirst({
    where: { memberId: member.id, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null, ...activeAdminRoleWhere() },
    select: { id: true },
  });

  return <AppShell>
    <div className="px-5 py-6">
      <h1 className="text-xl font-bold">全站管理後台</h1>
      {role ? <>
        <p className="mt-2 text-sm text-lion-muted">可協助各分會處理會員申請及會籍管理。</p>
        <div className="mt-6 grid gap-3">
          {tools.map(tool => <Link key={tool.href} href={tool.href} className="block rounded-xl border border-lion-border bg-lion-card p-4">
            <h2 className="font-semibold">{tool.title}</h2>
            <p className="mt-1 text-sm text-lion-muted">{tool.description}</p>
          </Link>)}
        </div>
      </> : <p role="alert" className="mt-6 text-sm text-lion-muted">您的帳號尚未取得全站管理權限，請聯絡系統管理者。</p>}
      <Link href="/profile" className="mt-6 inline-flex min-h-12 items-center text-lion-gold">返回我的檔案</Link>
    </div>
  </AppShell>;
}
