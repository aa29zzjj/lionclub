import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import NextPhaseWeb from "@/components/NextPhaseWeb";
import { getCurrentMember } from "@/lib/current-member";
import { nextPhaseEnabled } from "@/lib/next-phase-contract";

export const dynamic = "force-dynamic";
export default async function MeetupsPage({ searchParams }: { searchParams: Promise<{ meetupId?: string | string[] }> }) {
  if (!nextPhaseEnabled) notFound();
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  const { meetupId } = await searchParams;
  const id = typeof meetupId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(meetupId) ? meetupId : undefined;
  return <AppShell><main className="px-5 pt-6 pb-8"><NextPhaseWeb key={id ?? "list"} memberId={member.id} view="meetups" meetupId={id} /></main></AppShell>;
}
