import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import NextPhaseWeb from "@/components/NextPhaseWeb";
import { getCurrentMember } from "@/lib/current-member";
import { nextPhaseEnabled } from "@/lib/next-phase-contract";

export const dynamic = "force-dynamic";
export default async function BusinessCardPage() {
  if (!nextPhaseEnabled) notFound();
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return <AppShell><main className="px-5 pt-6 pb-8">
    <Link href="/profile" className="mb-4 inline-flex min-h-12 items-center text-lion-gold">‹ 返回我的</Link>
    <NextPhaseWeb memberId={member.id} view="card" />
  </main></AppShell>;
}
