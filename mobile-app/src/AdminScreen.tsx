import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createApiClient, ApiError, type Member, type Invite, type PendingMember,
  type PendingExperience, type RolesResponse, type ReportsResponse,
} from "./contract";
import {
  ADMIN_ROLE_LABELS, createAdminRequestGuard, existingRoleGrants, grantableMembers,
  grantableRoles, validateExperienceReview, validateRoleGrant, validateRoleRevoke, type RoleGrantDraft,
} from "./admin-actions";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type AdminTab = "invites" | "pending-members" | "pending-experiences" | "roles" | "reports";
const TABS: { key: AdminTab; label: string }[] = [
  { key: "invites", label: "邀請" },
  { key: "pending-members", label: "待審會員" },
  { key: "pending-experiences", label: "待審資歷" },
  { key: "roles", label: "角色" },
  { key: "reports", label: "檢舉" },
];

function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="qr-overlay" role="alertdialog" aria-modal="true" aria-label="確認操作">
      <div className="qr-panel">
        <p style={{ color: "#0a0d18", textAlign: "center" }}>{message}</p>
        <button type="button" className="primary" onClick={onConfirm}>確定執行</button>
        <button type="button" className="secondary" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function InvitesPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInvites(await api.getInvites()); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "讀取失敗"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createInvite();
      setNewUrl(result.registerUrl);
      await load();
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "建立失敗"); }
    finally { setBusy(false); }
  }

  return (
    <div className="list-stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="button" className="primary" onClick={handleCreate} disabled={busy}>{busy ? "建立中…" : "產生新邀請 QR（3 天有效）"}</button>
      {newUrl ? (
        <div className="event-card" style={{ alignItems: "center" }}>
          <QRCodeSVG value={newUrl} size={180} bgColor="#ffffff" fgColor="#0a0d18" />
          <p className="list-card-meta">提供此 QR 給新會員掃描註冊</p>
        </div>
      ) : null}
      {invites.map((inv) => (
        <div key={inv.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">有效至 {new Date(inv.validUntil).toLocaleDateString("zh-TW")}</p>
            <p className="list-card-meta">已使用 {inv.usageCount}{inv.usageLimit ? `／${inv.usageLimit}` : ""} 次</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingMembersPanel() {
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const load = useCallback(async () => {
    try { setMembers(await api.getPendingMembers()); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "讀取失敗"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setConfirming(null);
    setBusyId(id);
    try { await api.reviewPendingMember(id, action); await load(); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "審核失敗"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="list-stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {members.length === 0 ? <p className="member-meta">目前沒有待審會員。</p> : null}
      {members.map((m) => (
        <div key={m.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">{m.name}</p>
            <p className="list-card-meta">{m.email} · {m.organization.name}</p>
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={busyId === m.id} onClick={() => act(m.id, "approve")}>核准</button>
            <button type="button" className="secondary" disabled={busyId === m.id} onClick={() => setConfirming({ id: m.id, action: "reject" })}>拒絕</button>
          </div>
        </div>
      ))}
      {confirming ? (
        <Confirm
          message="拒絕後,若此申請沒有任何歷史紀錄,帳號將直接刪除,確定要拒絕嗎？"
          onConfirm={() => act(confirming.id, confirming.action)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}

function pendingExperienceDescription(item: PendingExperience | undefined) {
  if (!item) return "此筆資歷";
  return [item.positionName, item.organizationName].filter((value): value is string => typeof value === "string" && value.length > 0).join("／") || "此筆資歷";
}

function PendingExperiencesPanel() {
  const [items, setItems] = useState<PendingExperience[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ReturnType<typeof validateExperienceReview> | null>(null);
  const busy = useRef(false);
  const requests = useRef(createAdminRequestGuard());

  const load = useCallback(async () => {
    const request = requests.current.begin();
    setLoading(true); setError(null); setConfirming(null);
    try {
      const result = await api.getPendingExperiences();
      if (requests.current.isCurrent(request)) setItems(result);
    } catch (failure) {
      if (requests.current.isCurrent(request)) setError(failure instanceof ApiError ? failure.message : "讀取失敗，請重新載入。");
    } finally { if (requests.current.isCurrent(request)) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => requests.current.invalidate(); }, [load]);

  function prepare(item: PendingExperience, action: "verify" | "reject") {
    if (busy.current || loading) return;
    try {
      setConfirming(validateExperienceReview(item, action, reasons[item.id] ?? ""));
      setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "請確認審核資料。"); }
  }

  async function act() {
    if (busy.current || loading || !confirming) return;
    const item = items.find(entry => entry.id === confirming.id);
    if (!item) { setConfirming(null); setError("資歷已變更，請重新載入。"); return; }
    try {
      const review = validateExperienceReview(item, confirming.action, confirming.reason ?? "", confirming.expectedUpdatedAt);
      busy.current = true; setBusyId(item.id); setError(null); setNotice(null); setConfirming(null);
      await api.reviewPendingExperience(review.id, review.action, review.expectedUpdatedAt, review.reason);
      setItems(previous => previous.filter(entry => entry.id !== item.id));
      setReasons(previous => { const next = { ...previous }; delete next[item.id]; return next; });
      setNotice(`${item.member.name} 的資歷${review.action === "verify" ? "已核實" : "已退回"}`);
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "審核結果未確認，請重新載入後再操作。"); }
    finally { busy.current = false; setBusyId(null); }
  }

  return (
    <div className="list-stack">
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <><p className="error" role="alert">{error}</p><button type="button" className="secondary" disabled={Boolean(busyId) || loading} onClick={() => void load()}>重新載入名單</button></> : null}
      <p className="member-meta">核實資歷不會授予管理權限；審核理由會留下紀錄。</p>
      {loading ? <p className="member-meta">載入中…</p> : null}
      {!loading && !error && items.length === 0 ? <p className="member-meta">目前沒有待審資歷。</p> : null}
      {!loading && items.map((item) => (
        <div key={item.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">{item.member.name}</p>
            <p className="list-card-meta">{pendingExperienceDescription(item)}</p>
            {typeof item.startYear === "number" ? <p className="list-card-meta">{item.startYear} 年起{item.isCurrent === true ? "（本人標示現任，待核實）" : typeof item.endYear === "number" ? `，至 ${item.endYear} 年` : ""}</p> : null}
            {typeof item.note === "string" && item.note ? <p className="list-card-meta">備註：{item.note}</p> : null}
            <p className="list-card-meta">{item.review.label}</p>
            <label htmlFor={`review-reason-${item.id}`}>具體審核理由／證明來源</label>
            <textarea id={`review-reason-${item.id}`} rows={3} maxLength={1000} disabled={Boolean(busyId)} value={reasons[item.id] ?? ""}
              onChange={event => setReasons(previous => ({ ...previous, [item.id]: event.target.value }))}
              placeholder={item.review.requiresReason ? "例外核實或退回皆須填寫至少 2 字" : "退回必填；核實可填證明來源"} />
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => prepare(item, "verify")}>核實</button>
            <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => prepare(item, "reject")}>退回</button>
          </div>
        </div>
      ))}
      {confirming ? <Confirm message={`確定${confirming.action === "verify" ? "核實" : "退回"} ${items.find(item => item.id === confirming.id)?.member.name ?? "此會員"} 的「${pendingExperienceDescription(items.find(item => item.id === confirming.id))}」嗎？${confirming.reason ? `理由：${confirming.reason}` : "核實只確認此筆資歷，不會新增管理權限。"}`} onConfirm={() => void act()} onCancel={() => setConfirming(null)} /> : null}
    </div>
  );
}

function RolesPanel({ actorId }: { actorId: string }) {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<RolesResponse["organizations"]>([]);
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");
  const [validUntilDate, setValidUntilDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ kind: "grant"; draft: RoleGrantDraft; message: string } | { kind: "revoke"; organizationId: string; roleId: string; message: string } | null>(null);
  const busy = useRef(false);
  const requests = useRef(createAdminRequestGuard());

  const load = useCallback(async (requestedOrganizationId?: string) => {
    const request = requests.current.begin();
    setLoading(true); setData(null); setError(null); setConfirming(null);
    if (requestedOrganizationId) setOrganizationId(requestedOrganizationId);
    try {
      const result = await api.getRoles(requestedOrganizationId);
      if (!requests.current.isCurrent(request)) return;
      if (requestedOrganizationId && result.organization.id !== requestedOrganizationId) throw new Error("回傳組織與選擇不符，請重新載入。");
      setData(result); setOrganizationId(result.organization.id); setOrganizations(result.organizations);
      const members = grantableMembers(result, actorId);
      const roles = grantableRoles(result);
      setMemberId(current => members.some(member => member.id === current) ? current : members[0]?.id ?? "");
      setRole(current => roles.includes(current) ? current : roles[0] ?? "");
    } catch (failure) {
      if (requests.current.isCurrent(request)) setError(failure instanceof Error ? failure.message : "讀取失敗，請重新載入。");
    } finally { if (requests.current.isCurrent(request)) setLoading(false); }
  }, [actorId]);
  useEffect(() => { void load(); return () => requests.current.invalidate(); }, [load]);

  function prepareGrant() {
    if (busy.current || loading || !data) return;
    const draft = { organizationId, memberId, role, validUntilDate };
    try {
      validateRoleGrant(data, actorId, draft);
      const member = data.members.find(entry => entry.id === memberId)!;
      setError(null);
      setConfirming({ kind: "grant", draft, message: `確定授予 ${member.name} 在 ${data.organization.name} 的「${ADMIN_ROLE_LABELS[role]}」？${validUntilDate ? `有效至 ${validUntilDate}（台灣時間含當日）。` : "未設定到期日。"}此操作不會核實自填資歷，也不會自動續期。` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "請確認授權資料。"); }
  }

  function prepareRevoke(roleId: string) {
    if (busy.current || loading || !data) return;
    try {
      const { member, grant } = validateRoleRevoke(data, actorId, organizationId, roleId);
      setError(null);
      setConfirming({ kind: "revoke", organizationId, roleId, message: `確定撤銷 ${member.name} 在 ${data.organization.name} 的「${ADMIN_ROLE_LABELS[grant.role] ?? grant.role}」權限嗎？` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "請確認角色資料。"); }
  }

  async function act() {
    if (busy.current || loading || !data || !confirming) return;
    try {
      const grant = confirming.kind === "grant" ? validateRoleGrant(data, actorId, confirming.draft) : null;
      if (confirming.kind === "revoke") validateRoleRevoke(data, actorId, confirming.organizationId, confirming.roleId);
      busy.current = true; setBusyId(grant?.memberId ?? (confirming.kind === "revoke" ? confirming.roleId : "grant"));
      setError(null); setNotice(null); setConfirming(null);
      if (grant) await api.grantRole(grant.organizationId, grant.memberId, grant.role, grant.validUntil);
      else if (confirming.kind === "revoke") await api.revokeRole(confirming.roleId);
      setNotice(grant ? "權限已授予。" : "權限已撤銷。");
      setValidUntilDate("");
      await load(data.organization.id);
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "操作結果未確認，請重新載入確認後再試。");
    } finally { busy.current = false; setBusyId(null); }
  }

  const disabled = loading || Boolean(busyId);
  const members = data ? grantableMembers(data, actorId) : [];
  const roles = data ? grantableRoles(data) : [];
  const grants = data ? existingRoleGrants(data) : [];

  return (
    <div className="list-stack">
      {organizations.length ? <label>授權組織／精確範圍<select aria-label="授權組織" value={organizationId} disabled={disabled} onChange={event => { if (busy.current) return; setValidUntilDate(""); setNotice(null); void load(event.target.value); }}>{organizations.map(org => <option key={org.id} value={org.id}>{org.districtCode && !org.name.includes(org.districtCode) ? `${org.districtCode} · ` : ""}{org.name}</option>)}</select></label> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <><p className="error" role="alert">{error}</p><button type="button" className="secondary" disabled={disabled} onClick={() => void load(organizationId || undefined)}>重新載入權限</button></> : null}
      {loading ? <p className="member-meta">載入中…</p> : null}
      {data ? <>
        <form className="event-card" onSubmit={event => { event.preventDefault(); prepareGrant(); }}>
          <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, width: "100%", display: "grid", gap: 12 }}>
            <legend>授予系統權限</legend>
            <label>會員<select aria-label="授權會員" value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">請選擇會員</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}</select></label>
            <label>系統權限<select aria-label="系統權限" value={role} onChange={event => setRole(event.target.value)}><option value="">請選擇權限</option>{roles.map(value => <option key={value} value={value}>{ADMIN_ROLE_LABELS[value]}</option>)}</select></label>
            <label>有效至（台灣日期含當日，{data.organization.level === "district" ? "必填" : "選填"}）<input type="date" value={validUntilDate} required={data.organization.level === "district"} onChange={event => setValidUntilDate(event.target.value)} /></label>
            {data.organization.level === "district" ? <p className="list-card-meta">區級資歷審核角色最長 366 日，不自動續期；不包含會員異動、邀請或官方活動發布權。</p> : null}
            <button type="submit" className="primary" disabled={!memberId || !role || disabled}>授予權限</button>
          </fieldset>
        </form>
        <p className="member-meta">現有可管理權限：{grants.length} 項</p>
        {grants.length === 0 ? <p className="member-meta">此組織目前沒有可管理的角色。</p> : null}
        {grants.map(({ member, grant }) => (
        <div key={grant.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">{member.name}</p>
            <p className="list-card-meta">{ADMIN_ROLE_LABELS[grant.role] ?? grant.role}</p>
            <p className="list-card-meta">{new Date(grant.validFrom).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })} 起，{grant.validUntil ? `至 ${new Date(grant.validUntil).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}` : "未設定到期日（既有角色）"}</p>
            {!member.eligibleForGrant ? <p className="list-card-meta">目前不可新增授權；既有角色仍可核對撤銷。</p> : null}
            {member.id === actorId ? <p className="list-card-meta">自己的權限須由另一位有效授權者核對。</p> : null}
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={disabled || member.id === actorId} onClick={() => prepareRevoke(grant.id)}>撤銷</button>
          </div>
        </div>
        ))}
      </> : null}
      {confirming ? <Confirm message={confirming.message} onConfirm={() => void act()} onCancel={() => setConfirming(null)} /> : null}
    </div>
  );
}

function ReportsPanel() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; kind: "member" | "event"; action: "suspend" | "remove_content" } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.getReports()); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "讀取失敗"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, kind: "member" | "event", action: "review" | "dismiss" | "suspend" | "remove_content") {
    setConfirming(null);
    setBusyId(id);
    try { await api.moderateReport(id, kind, action); await load(); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "處理失敗"); }
    finally { setBusyId(null); }
  }

  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p className="member-meta">載入中…</p>;

  return (
    <div className="list-stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data.reports.length === 0 && data.eventReports.length === 0 ? <p className="member-meta">目前沒有待處理的檢舉。</p> : null}
      {data.reports.map((r) => (
        <div key={r.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">檢舉會員：{r.target.name}</p>
            <p className="list-card-meta">{r.reason}</p>
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={busyId === r.id} onClick={() => act(r.id, "member", "dismiss")}>駁回</button>
            <button type="button" className="secondary" disabled={busyId === r.id} onClick={() => setConfirming({ id: r.id, kind: "member", action: "suspend" })}>停權</button>
          </div>
        </div>
      ))}
      {data.eventReports.map((r) => (
        <div key={r.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">檢舉活動：{r.event?.title ?? "已刪除"}</p>
            <p className="list-card-meta">{r.reason}</p>
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={busyId === r.id} onClick={() => act(r.id, "event", "dismiss")}>駁回</button>
            <button type="button" className="secondary" disabled={busyId === r.id} onClick={() => setConfirming({ id: r.id, kind: "event", action: "remove_content" })}>移除內容</button>
          </div>
        </div>
      ))}
      {confirming ? (
        <Confirm
          message={confirming.action === "suspend" ? "停權會立即登出此會員所有裝置,確定要停權嗎？" : "確定要移除此活動的標題/說明/封面內容嗎？"}
          onConfirm={() => act(confirming.id, confirming.kind, confirming.action)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}

export default function AdminScreen({ member }: { member: Member }) {
  const [tab, setTab] = useState<AdminTab>("pending-members");
  return (
    <div className="admin-screen">
      <nav className="sub-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={t.key === tab ? "sub-tab active" : "sub-tab"} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>
      {tab === "invites" ? <InvitesPanel /> : null}
      {tab === "pending-members" ? <PendingMembersPanel /> : null}
      {tab === "pending-experiences" ? <PendingExperiencesPanel /> : null}
      {tab === "roles" ? <RolesPanel actorId={member.id} /> : null}
      {tab === "reports" ? <ReportsPanel /> : null}
    </div>
  );
}
