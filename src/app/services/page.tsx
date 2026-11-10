import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ServiceWebClient from "@/components/ServiceWebClient";
import { getCurrentMember } from "@/lib/current-member";
export const dynamic = "force-dynamic";
export default async function ServicesPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return <AppShell><main className="px-5 pt-6 pb-8"><Link href="/profile" className="mb-4 inline-flex min-h-12 items-center text-lion-gold">‹ 返回我的</Link><ServiceWebClient key={member.id} memberId={member.id} /></main></AppShell>;
}
