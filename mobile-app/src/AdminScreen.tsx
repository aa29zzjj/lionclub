import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createApiClient, ApiError, type Member, type Invite, type PendingMember,
  type PendingExperience, type RolesResponse, type ReportsResponse,
} from "./contract";

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
    <div className="qr-overlay" role="alertdialog">
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

function PendingExperiencesPanel() {
  const [items, setItems] = useState<PendingExperience[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.getPendingExperiences()); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "讀取失敗"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(item: PendingExperience, action: "verify" | "reject") {
    setBusyId(item.id);
    try {
      await api.reviewPendingExperience(item.id, action, item.updatedAt as string, action === "reject" ? "原生 App 審核拒絕" : undefined);
      await load();
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "審核失敗"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="list-stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items.length === 0 ? <p className="member-meta">目前沒有待審資歷。</p> : null}
      {items.map((item) => (
        <div key={item.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">{item.member.name}</p>
            <p className="list-card-meta">{item.review.label}</p>
          </div>
          <div className="list-card-actions">
            <button type="button" className="secondary" disabled={busyId === item.id} onClick={() => act(item, "verify")}>核實</button>
            <button type="button" className="secondary" disabled={busyId === item.id} onClick={() => act(item, "reject")}>退回</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RolesPanel() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.getRoles()); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "讀取失敗"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function grant(memberId: string, role: string) {
    setBusyId(memberId);
    try { await api.grantRole(data!.organization.id, memberId, role); await load(); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "授權失敗"); }
    finally { setBusyId(null); }
  }

  async function revoke(roleId: string) {
    setConfirmingRevoke(null);
    setBusyId(roleId);
    try { await api.revokeRole(roleId); await load(); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "撤銷失敗"); }
    finally { setBusyId(null); }
  }

  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p className="member-meta">載入中…</p>;

  return (
    <div className="list-stack">
      <p className="member-meta">目前組織：{data.organization.name}</p>
      {data.members.filter((m) => m.eligibleForGrant).map((m) => (
        <div key={m.id} className="list-card">
          <div className="list-card-main">
            <p className="list-card-title">{m.name}</p>
            {m.adminRoles.length > 0 ? <p className="list-card-meta">{m.adminRoles.map((r) => r.role).join("、")}</p> : null}
          </div>
          <div className="list-card-actions">
            {m.adminRoles.length > 0 ? (
              m.adminRoles.map((r) => (
                <button key={r.id} type="button" className="secondary" disabled={busyId === r.id} onClick={() => setConfirmingRevoke(r.id)}>撤銷</button>
              ))
            ) : (
              <button type="button" className="secondary" disabled={busyId === m.id} onClick={() => grant(m.id, data.assignableRoles[0])}>
                授予 {data.assignableRoles[0]}
              </button>
            )}
          </div>
        </div>
      ))}
      {confirmingRevoke ? (
        <Confirm message="撤銷幹部權限是敏感操作,確定要撤銷嗎？" onConfirm={() => revoke(confirmingRevoke)} onCancel={() => setConfirmingRevoke(null)} />
      ) : null}
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

export default function AdminScreen({ member: _member }: { member: Member }) {
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
      {tab === "roles" ? <RolesPanel /> : null}
      {tab === "reports" ? <ReportsPanel /> : null}
    </div>
  );
}
