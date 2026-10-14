import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assignmentSchema, assignMemberOrganization, getAssignmentScope, OnboardingError } from "./central-onboarding";

export const bulkPreviewSchema = z.object({ rows: z.array(z.object({ email: z.string().trim().email().max(254), organizationId: z.string().trim().min(1).max(200) })).min(1).max(200) });
export const bulkCommitSchema = z.object({ rows: z.array(assignmentSchema.extend({ memberId: z.string().trim().min(1).max(200) })).min(1).max(200) });
type PreviewRow = { email: string; organizationId: string; error?: string; memberId?: string; memberName?: string; currentOrganizationId?: string; currentOrganizationName?: string; targetOrganizationName?: string; expectedAssignmentVersion?: number };
const memberSelect = { id: true, name: true, organizationId: true, organizationAssignmentStatus: true, organizationAssignmentVersion: true, organization: { select: { id: true, name: true } } } as const;

/** Preserve exact legacy identity; insensitive fallback must have exactly one match. */
export async function resolveBulkMemberByEmail(prisma: PrismaClient, email: string) {
  const normalized = email.trim();
  const exact = await prisma.member.findFirst({ where: { email: normalized, status: "ACTIVE", deletedAt: null }, select: memberSelect });
  if (exact) return exact;
  const matches = await prisma.member.findMany({ where: { email: { equals: normalized, mode: "insensitive" }, status: "ACTIVE", deletedAt: null }, select: memberSelect, take: 2 });
  if (matches.length > 1) throw new OnboardingError(409, "此 Email 對應多個大小寫帳號，請先人工確認，不會自動挑選");
  return matches[0] ?? null;
}

export async function previewBulkAssignments(prisma: PrismaClient, actorId: string, rows: z.infer<typeof bulkPreviewSchema>["rows"]) {
  const scope = await getAssignmentScope(prisma, actorId);
  const results: PreviewRow[] = [];
  // Bounded sequential reads, not 200 simultaneous requests exhausting the DB pool.
  for (const row of rows) {
    try {
      const member = await resolveBulkMemberByEmail(prisma, row.email);
      if (!member) { results.push({ ...row, error: "找不到此 Email 對應的啟用會員" }); continue; }
      if (member.id === actorId) { results.push({ ...row, error: "不能透過此功能更改自己的分會" }); continue; }
      if (scope && !scope.includes(member.organizationId)) { results.push({ ...row, error: "此會員的目前分會超出您的管理範圍" }); continue; }
      if (scope && !scope.includes(row.organizationId)) { results.push({ ...row, error: "目標分會超出您的管理範圍" }); continue; }
      const target = await prisma.organization.findFirst({ where: { id: row.organizationId, level: "club", isActive: true }, select: { id: true, name: true } });
      if (!target) { results.push({ ...row, error: "目標分會不存在或未啟用" }); continue; }
      if (member.organizationId === target.id && member.organizationAssignmentStatus === "ASSIGNED") { results.push({ ...row, error: "已是目前分會，無須異動" }); continue; }
      results.push({ ...row, memberId: member.id, memberName: member.name, currentOrganizationId: member.organization.id, currentOrganizationName: member.organization.name, targetOrganizationName: target.name, expectedAssignmentVersion: member.organizationAssignmentVersion });
    } catch (error) {
      if (!(error instanceof OnboardingError)) throw error;
      results.push({ ...row, error: error.message });
    }
  }
  const counts = new Map<string, number>();
  for (const row of results) if (row.memberId) counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + 1);
  return { rows: results.map(row => row.memberId && (counts.get(row.memberId) ?? 0) > 1 ? { ...row, error: "同一會員在此名單重複出現，請整理為一筆後重新預覽" } : row) };
}

type Assigner = (prisma: PrismaClient, actorId: string, memberId: string, input: z.infer<typeof assignmentSchema>) => Promise<{ organization: { id: string; name: string } }>;
/** Each row reuses the real scope/CAS/transaction/audit path; partial results are explicit. */
export async function commitBulkAssignments(prisma: PrismaClient, actorId: string, rows: z.infer<typeof bulkCommitSchema>["rows"], assign: Assigner = assignMemberOrganization) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + 1);
  const results: { memberId: string; ok: boolean; status: number; error?: string; organization?: { id: string; name: string } }[] = [];
  for (const row of rows) {
    if ((counts.get(row.memberId) ?? 0) > 1) { results.push({ memberId: row.memberId, ok: false, status: 400, error: "同批名單含重複會員，未執行此筆" }); continue; }
    try {
      const result = await assign(prisma, actorId, row.memberId, { organizationId: row.organizationId, expectedOrganizationId: row.expectedOrganizationId, expectedAssignmentVersion: row.expectedAssignmentVersion, reason: row.reason });
      results.push({ memberId: row.memberId, ok: true, status: 200, organization: result.organization });
    } catch (error) {
      results.push({ memberId: row.memberId, ok: false, status: error instanceof OnboardingError ? error.status : 500, error: error instanceof OnboardingError ? error.message : "分派失敗，請重新載入核對後再試" });
    }
  }
  return { results };
}
