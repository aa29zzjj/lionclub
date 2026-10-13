"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import BulkAssignmentImport from "@/components/BulkAssignmentImport";

type AssignmentStatus = "NEEDS_ASSIGNMENT" | "ASSIGNED";
type StatusFilter = AssignmentStatus | "ALL";
type Organization = { id: string; name: string; districtCode?: string | null };
type Member = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  declaredOrganizationName: string | null;
  organizationAssignmentStatus: AssignmentStatus;
  organizationAssignmentVersion: number;
  organization: { id: string; name: string };
  updatedAt: string;
};
type HistoryItem = {
  id: string;
  fromOrganizationName: string | null;
  toOrganizationName: string;
  reason: string;
  assignedAt: string;
  assignedBy: { name: string } | null;
  revokedRoleNames: string[];
  revokedInviteCount: number;
};
type Detail = { member: Member & { adminRoles: { role: string; scopeId: string | null }[] }; history: HistoryItem[] };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const roleLabels: Record<string, string> = {
  CLUB_OFFICER: "分會幹部",
  CLUB_FINANCE: "分會財務",
  CLUB_VICE_PRESIDENT: "分會副會長",
  CLUB_PRESIDENT: "分會會長",
  ZONE_ADMIN: "分區管理者",
  DISTRICT_ADMIN: "區管理者",
  MULTIDISTRICT_ADMIN: "複合區管理者",
  SUPER_ADMIN: "全域管理者",
};
const filterLabels: Record<StatusFilter, string> = { NEEDS_ASSIGNMENT: "待分派", ASSIGNED: "已確認", ALL: "全部" };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function readResponse(response: Response) {
  return response.json().catch(() => ({}));
}

export default function MemberAssignmentPage() {
  const router = useRouter();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<StatusFilter>("NEEDS_ASSIGNMENT");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<Member[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [canAssignAcrossAllClubs, setCanAssignAcrossAllClubs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictReviewed, setConflictReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const clearRestrictedData = useCallback(() => {
    listRequest.current += 1;
    detailRequest.current += 1;
    setMembers([]);
    setOrganizations([]);
    setDetail(null);
    setSelectedId(null);
    setReason("");
    setOrganizationId("");
    setNotice("");
    setLoading(false);
    setDetailLoading(false);
  }, []);

  const handleUnauthorized = useCallback((responseStatus: number) => {
    if (responseStatus !== 401 && responseStatus !== 403) return false;
    clearRestrictedData();
    if (responseStatus === 401) router.replace("/login");
    else setForbidden(true);
    return true;
  }, [clearRestrictedData, router]);

  const loadList = useCallback(async () => {
    const requestId = ++listRequest.current;
    setLoading(true);
    setListError("");
    try {
      const parameters = new URLSearchParams({ status, q: query, page: String(page) });
      const response = await fetch(`/api/admin/member-assignments?${parameters}`, { cache: "no-store" });
      const result = await readResponse(response);
      if (requestId !== listRequest.current) return;
      if (handleUnauthorized(response.status)) return;
      if (!response.ok) throw new Error(result.error ?? "無法載入會員名單，請重試");
      setForbidden(false);
      setMembers(result.members ?? []);
      setOrganizations(result.organizations ?? []);
      setPagination(result.pagination);
      setCanAssignAcrossAllClubs(Boolean(result.canAssignAcrossAllClubs));
    } catch (error) {
      if (requestId === listRequest.current) setListError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線暫時中斷，請重試");
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }, [handleUnauthorized, page, query, status]);

  const loadDetail = useCallback(async (memberId: string, preserveForm = false) => {
    const requestId = ++detailRequest.current;
    setSelectedId(memberId);
    setDetailLoading(true);
    setDetailError("");
    if (!preserveForm) {
      setDetail(null);
      setOrganizationId("");
      setReason("");
      setConfirmed(false);
      setConflict(false);
      setConflictReviewed(false);
      setNotice("");
    }
    try {
      const response = await fetch(`/api/admin/member-assignments/${encodeURIComponent(memberId)}`, { cache: "no-store" });
      const result = await readResponse(response);
      if (requestId !== detailRequest.current) return;
      if (handleUnauthorized(response.status)) return;
      if (!response.ok) throw new Error(result.error ?? "無法載入會員資料，請重試");
      setDetail(result);
      if (!preserveForm) setOrganizationId(result.member.organization.id);
      return result as Detail;
    } catch (error) {
      if (requestId === detailRequest.current) setDetailError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線暫時中斷，請重試");
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedId && !detailLoading && detail) {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [selectedId, detailLoading, detail]);

  const targetOrganization = organizations.find((organization) => organization.id === organizationId);
  const isTransfer = Boolean(detail && organizationId && detail.member.organization.id !== organizationId);
  const alreadyConfirmed = Boolean(detail && organizationId === detail.member.organization.id && detail.member.organizationAssignmentStatus === "ASSIGNED");
  const validReason = reason.trim().length >= 2 && reason.trim().length <= 1000;
  const readyToSubmit = Boolean(detail && targetOrganization && validReason && confirmed && !alreadyConfirmed && !detailLoading && !detailError && (!conflict || conflictReviewed));

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !readyToSubmit || !detail || !targetOrganization) return;
    setSaving(true);
    setDetailError("");
    setNotice("");
    const member = detail.member;
    try {
      const response = await fetch(`/api/admin/member-assignments/${encodeURIComponent(member.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, expectedOrganizationId: member.organization.id, expectedAssignmentVersion: member.organizationAssignmentVersion, reason: reason.trim() }),
      });
      const result = await readResponse(response);
      if (handleUnauthorized(response.status)) return;
      if (response.status === 409) {
        setConflict(true);
        setConflictReviewed(false);
        setConfirmed(false);
        await loadDetail(member.id, true);
        await loadList();
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "分會分派未完成，請重試");
      const revokedNames = (result.revokedRoleNames ?? []).map((role: string) => roleLabels[role] ?? role);
      setNotice(`已確認 ${member.name} 的正式分會為 ${result.organization.name}。${revokedNames.length ? ` 已撤銷：${revokedNames.join("、")}。` : ""}${result.revokedInviteCount ? ` 已停用 ${result.revokedInviteCount} 筆入會邀請。` : ""}`);
      setConflict(false);
      setConflictReviewed(false);
      setConfirmed(false);
      setReason("");
      setOrganizationId(result.organization.id);
      await loadDetail(member.id, true);
      await loadList();
    } catch (error) {
      setConfirmed(false);
      setConflictReviewed(false);
      setDetailError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線暫時中斷，請重新載入資料後確認結果");
    } finally {
      setSaving(false);
    }
  }

  function closeDetail() {
    detailRequest.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    setConflict(false);
    setNotice("");
  }

  if (forbidden) return <AppShell><div className="px-5 pb-8 pt-6">
    <h1 className="text-xl font-bold">會員分會分派</h1>
    <p role="alert" className="mt-5 text-sm leading-relaxed text-lion-muted">您目前沒有會員分會分派權限，請向會長或所轄區管理者確認授權。</p>
    <Link href="/profile" className="mt-5 flex min-h-12 items-center justify-center rounded-xl border border-lion-border text-sm">返回我的檔案</Link>
  </div></AppShell>;

  return <AppShell><div className="px-5 pb-8 pt-6">
    <Link href="/profile" className="mb-3 inline-flex min-h-12 items-center text-sm text-lion-muted">← 幹部工具</Link>
    <h1 className="text-xl font-bold">會員分會分派</h1>
    <p className="mt-1 text-xs leading-relaxed text-lion-muted">會員帳號已可使用。請依正式會員名單核對分會；待分派與入會審核為不同狀態。</p>
    <p className="mt-3 rounded-xl border border-lion-border bg-lion-card px-3 py-2.5 text-xs leading-relaxed text-lion-muted">{canAssignAcrossAllClubs ? "您可選擇所有啟用分會。" : "名單及目標分會限您有權管理的範圍。"}姓名與聯絡資料僅供授權幹部核對。</p>

    <BulkAssignmentImport organizations={organizations} onCommitted={() => void loadList()} />

    <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-lion-soft p-1" role="group" aria-label="分派狀態">
      {(Object.keys(filterLabels) as StatusFilter[]).map((value) => <button key={value} type="button" disabled={saving} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`min-h-12 rounded-lg px-2 text-xs font-medium disabled:opacity-50 ${status === value ? "bg-lion-action text-lion-navyDeep" : "text-lion-muted"}`}>{filterLabels[value]}</button>)}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }} className="mt-3 flex gap-2">
      <label htmlFor="assignment-search" className="sr-only">搜尋會員姓名或 Email</label>
      <input id="assignment-search" type="search" value={search} disabled={saving} onChange={(event) => setSearch(event.target.value)} placeholder="會員姓名或 Email" className="min-w-0 flex-1 rounded-xl border border-lion-border bg-lion-card px-3 py-2.5 text-sm placeholder:text-lion-muted" />
      <button disabled={saving} type="submit" className="min-h-12 shrink-0 rounded-xl bg-lion-action px-4 text-sm font-semibold text-lion-navyDeep disabled:opacity-50">搜尋</button>
    </form>
    {listError && <div role="alert" className="mt-4 rounded-xl border border-lion-border bg-lion-card p-3"><p className="text-sm text-lion-danger">{listError}</p><button type="button" disabled={saving || loading} onClick={() => void loadList()} className="mt-2 min-h-12 rounded-lg border border-lion-border px-3 text-xs">重試名單</button></div>}
    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-lion-muted"><p>{filterLabels[status]} · 共 {pagination.total} 人</p>{loading && <p role="status">載入中…</p>}</div>
    <div className="mt-3 flex flex-col gap-3" aria-busy={loading}>
      {!loading && !listError && members.length === 0 && <p className="rounded-xl border border-dashed border-lion-border px-4 py-8 text-center text-sm text-lion-muted">沒有符合條件的會員</p>}
      {members.map((member) => <button key={member.id} type="button" disabled={saving || loading} onClick={() => void loadDetail(member.id)} aria-pressed={selectedId === member.id} className={`min-h-12 rounded-2xl border bg-lion-card p-4 text-left disabled:opacity-60 ${selectedId === member.id ? "border-lion-gold" : "border-lion-border"}`}>
        <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-sm font-semibold">{member.name}</span><span className="shrink-0 rounded-full bg-lion-soft px-2 py-1 text-[11px] text-lion-muted">{filterLabels[member.organizationAssignmentStatus]}</span></div>
        <p className="mt-1 break-words text-xs text-lion-muted">目前：{member.organization.name}</p>
        <p className="mt-1 break-words text-xs text-lion-muted">登記：{member.declaredOrganizationName || "未登記分會名稱"}</p>
        {member.email && <p className="mt-2 break-all text-xs text-lion-muted">{member.email}</p>}
        <span className="mt-3 block text-xs font-medium text-lion-gold">核對分派與歷史 →</span>
      </button>)}
    </div>
    {pagination.totalPages > 1 && <nav aria-label="會員名單分頁" className="mt-4 flex items-center justify-between gap-2">
      <button type="button" disabled={saving || loading || pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} className="min-h-12 rounded-xl border border-lion-border px-3 text-xs disabled:opacity-40">上一頁</button>
      <span className="text-xs text-lion-muted">{pagination.page} / {pagination.totalPages}</span>
      <button type="button" disabled={saving || loading || pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} className="min-h-12 rounded-xl border border-lion-border px-3 text-xs disabled:opacity-40">下一頁</button>
    </nav>}

    {selectedId && <section className="mt-7 scroll-mt-4 rounded-2xl border border-lion-border bg-lion-card p-4" aria-busy={detailLoading}>
      <div className="flex items-center justify-between gap-2"><h2 ref={detailHeading} tabIndex={-1} className="text-base font-semibold">會員分會核對</h2><button type="button" disabled={saving} onClick={closeDetail} className="min-h-12 rounded-lg px-2 text-xs text-lion-muted">關閉</button></div>
      {detailLoading && <p role="status" className="py-4 text-sm text-lion-muted">更新會員資料中…</p>}
      {notice && <p role="status" className="mb-4 break-words rounded-xl border border-lion-gold/30 bg-lion-soft p-3 text-sm leading-relaxed">{notice}</p>}
      {conflict && <div role="alert" className="mb-4 rounded-xl border border-lion-gold/30 bg-lion-soft p-3 text-xs leading-relaxed"><p className="font-semibold">資料已由其他幹部更新</p><p className="mt-1 text-lion-muted">目標分會與原因保留。請核對重新取得的最新分會、分派歷史與目標，確認後再送出；資料未載入成功前不能提交。</p></div>}
      {detailError && <div role="alert" className="mb-4"><p className="text-sm text-lion-danger">{detailError}</p><button type="button" disabled={saving || detailLoading} onClick={() => { setConfirmed(false); setConflictReviewed(false); void loadDetail(selectedId, true); }} className="mt-2 min-h-12 rounded-lg border border-lion-border px-3 text-xs">重新載入會員資料</button></div>}
      {detail && <>
        <div className="space-y-1 break-words text-xs leading-relaxed text-lion-muted">
          <p className="text-sm font-semibold text-lion-cream">{detail.member.name}</p>
          <p>目前分會：{detail.member.organization.name}</p>
          <p>登記分會：{detail.member.declaredOrganizationName || "未登記"}</p>
          <p>核對狀態：{filterLabels[detail.member.organizationAssignmentStatus]}</p>
          <p className="break-all">Email：{detail.member.email || "未填寫"}</p>
          <p>電話：{detail.member.phone || "未填寫"}</p>
          <p>資料更新：{formatDate(detail.member.updatedAt)}</p>
        </div>
        <form onSubmit={assign} className="mt-5 space-y-4">
          <div><label htmlFor="assignment-organization" className="mb-1 block text-xs text-lion-muted">正式分會</label><select id="assignment-organization" value={organizationId} disabled={saving || detailLoading} onChange={(event) => { setOrganizationId(event.target.value); setConfirmed(false); }} required className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-sm">
            <option value="" className="bg-lion-card text-lion-cream">請選擇正式分會</option>
            {organizationId && !targetOrganization && <option value={organizationId} disabled className="bg-lion-card text-lion-cream">目前選擇不在可管理範圍內，請重新選擇</option>}
            {organizations.map((organization) => <option key={organization.id} value={organization.id} className="bg-lion-card text-lion-cream">{organization.districtCode ? `${organization.districtCode} · ` : ""}{organization.name}</option>)}
          </select></div>
          <div><label htmlFor="assignment-reason" className="mb-1 block text-xs text-lion-muted">分派／核對原因（必填）</label><textarea id="assignment-reason" value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} disabled={saving || detailLoading} required minLength={2} maxLength={1000} rows={3} placeholder="請填寫會員名單來源或分會核對依據" className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-sm placeholder:text-lion-muted" /><p className="mt-1 text-right text-[11px] text-lion-muted">{reason.trim().length} / 1000 字，至少 2 字</p></div>
          <div className="rounded-xl border border-lion-border bg-lion-soft p-3 text-xs leading-relaxed">
            <p className="font-semibold">{isTransfer ? "跨分會分派確認" : alreadyConfirmed ? "此分會已確認" : "確認目前分會"}</p>
            {isTransfer ? <><p className="mt-1 break-words text-lion-muted">{detail.member.organization.name} → {targetOrganization?.name ?? "請選擇目標分會"}</p><p className="mt-2 text-lion-muted">舊分會幹部權限與其發出的入會邀請會停用。新分會不自動授權；既有資歷、好友、活動及報名紀錄不搬移。</p><p className="mt-2 text-lion-muted">區級／全域等獨立角色不會自動變動，需另行核對。</p>{detail.member.adminRoles.filter((role) => role.scopeId === detail.member.organization.id).length > 0 && <p className="mt-2 text-lion-muted">目前舊分會權限：{detail.member.adminRoles.filter((role) => role.scopeId === detail.member.organization.id).map((role) => roleLabels[role.role] ?? role.role).join("、")}</p>}</> : <p className="mt-1 text-lion-muted">{alreadyConfirmed ? "此會員的目前分會已完成核對，無需重複確認。若需變更，請選擇其他有權管理的正式分會。" : "可將目前分會確認為正式分會，核對狀態改為「已確認」。"}</p>}
          </div>
          {conflict && <label className="flex min-h-12 items-start gap-3 rounded-xl border border-lion-border p-3 text-xs leading-relaxed"><input type="checkbox" disabled={saving || detailLoading || Boolean(detailError)} checked={conflictReviewed} onChange={(event) => setConflictReviewed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-lion-action" /><span>我已核對其他幹部更新後的最新資料與分派歷史</span></label>}
          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-lion-border p-3 text-xs leading-relaxed"><input type="checkbox" checked={confirmed} disabled={saving || detailLoading || Boolean(detailError)} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-lion-action" /><span>{isTransfer ? "我已核對正式名單，確認分派至以上目標分會並了解權限／邀請處理" : "我已核對正式名單，確認此會員屬於目前分會"}</span></label>
          <button type="submit" disabled={saving || !readyToSubmit} className="min-h-12 w-full rounded-xl bg-lion-action px-3 py-2.5 text-sm font-semibold text-lion-navyDeep disabled:opacity-50">{saving ? "分派處理中…" : isTransfer ? "確認分派至目標分會" : alreadyConfirmed ? "此分會已確認" : "確認正式分會"}</button>
        </form>
        <section className="mt-6 border-t border-lion-border pt-4"><h3 className="text-sm font-semibold">分派歷史</h3><p className="mt-1 text-xs text-lion-muted">保留每次核對、分會變更與處理人。</p>
          {detail.history.length === 0 ? <p className="py-5 text-center text-xs text-lion-muted">目前沒有分派紀錄</p> : <ol className="mt-3 space-y-3">{detail.history.map((history) => <li key={history.id} className="rounded-xl border border-lion-border bg-lion-page p-3 text-xs leading-relaxed">
            <p className="break-words font-medium">{history.fromOrganizationName ?? "中央註冊"} → {history.toOrganizationName}</p><p className="mt-1 text-lion-muted">{formatDate(history.assignedAt)} · {history.assignedBy?.name ?? "系統"}</p><p className="mt-2 whitespace-pre-wrap break-words text-lion-muted">原因：{history.reason}</p>
            {history.revokedRoleNames.length > 0 && <p className="mt-2 text-lion-muted">撤銷權限：{history.revokedRoleNames.map((role) => roleLabels[role] ?? role).join("、")}</p>}{history.revokedInviteCount > 0 && <p className="mt-1 text-lion-muted">停用邀請：{history.revokedInviteCount} 筆</p>}
          </li>)}</ol>}
        </section>
      </>}
    </section>}
  </div></AppShell>;
}
