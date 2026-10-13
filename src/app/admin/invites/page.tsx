"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import QrCode from "@/components/QrCode";

type Invite = {
  id: string;
  token: string;
  validFrom: string;
  validUntil: string;
  usageCount: number;
  usageLimit: number | null;
  revokedAt: string | null;
  organization: { name: string };
};

type Me = {
  organization: { id: string; name: string };
  adminRoles: { role: string }[];
};

export default function AdminInvitesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newRegisterUrl, setNewRegisterUrl] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [validDays, setValidDays] = useState(3);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setInvitesLoading(true);
    setError("");
    fetch("/api/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("無法載入帳號資料，請稍後重試");
        return res.json();
      })
      .then((data) => {
        if (!data || !active) return;
        setMe(data);
      })
      .catch((error) => { if (active) setError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線暫時中斷，請重新載入"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, loadAttempt]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    setInvitesLoading(true);
    fetch("/api/invites")
      .then(async (res) => {
        if (res.status === 403) {
          if (active) setForbidden(true);
          return { invites: [] };
        }
        if (!res.ok) throw new Error("邀請紀錄載入失敗，請重新載入");
        return res.json();
      })
      .then((data) => { if (active) setInvites(data.invites ?? []); })
      .catch((error) => { if (active) setError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線暫時中斷，邀請紀錄尚未載入"); })
      .finally(() => { if (active) setInvitesLoading(false); });
    return () => { active = false; };
  }, [me]);

  async function handleCreate() {
    setCreating(true);
    setError("");
    setCopyNotice("");
    setNewRegisterUrl(null);
    setGeneratedInvite(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "產生失敗");
        return;
      }
      setGeneratedInvite(data.invite);
      setInvites((prev) => [data.invite, ...prev.filter((invite) => invite.id !== data.invite.id)]);
      setNewRegisterUrl(data.registerUrl);
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-xl font-bold mb-4">產生邀請 QR</h1>
          <p className="text-sm text-lion-muted text-center py-12">
            您目前沒有本分會的管理權限，無法產生邀請。如果您是會長／財務，請確認帳號是否已被授權。
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold mb-1">產生邀請 QR</h1>
        {me && <p className="text-xs text-lion-muted mb-4">{me.organization.name}</p>}
        <p className="mb-4 rounded-xl border border-lion-border bg-lion-card p-3 text-xs leading-relaxed text-lion-muted">現場只用共同邀請 QR：新註冊統一暫存於 AI臺科大獅子會、立即可使用。QR 是平台邀請，不代表正式獅子會會籍已核實；分會之後依名單或分會長確認結果分派，不需當場逐人審核。</p>
        <label htmlFor="invite-valid-days" className="mb-2 block text-sm font-medium">QR 註冊有效期</label>
        <select id="invite-valid-days" value={validDays} onChange={(event) => setValidDays(Number(event.target.value))} disabled={creating} className="mb-2 min-h-12 w-full rounded-xl border border-lion-border bg-lion-soft px-3 text-base">
          {[1, 3, 7, 30].map((days) => <option key={days} value={days}>{days} 天{days === 3 ? "（晚宴建議）" : ""}</option>)}
        </select>
        <p className="mb-4 text-xs leading-relaxed text-lion-muted">從產生 QR 時起算，建議活動前或當天產生。到期只停止新註冊，已加入的帳號不會因此停用；一張 QR 可供多人加入。</p>

        <button
          onClick={handleCreate}
          disabled={creating || invitesLoading || !me || Boolean(error)}
          className="w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 text-sm mb-4 disabled:opacity-60"
        >
          {creating ? "產生中..." : "+ 產生新的邀請 QR"}
        </button>

        {error && <div className="mb-4"><p role="alert" className="text-sm text-lion-danger">{error}</p><button type="button" className="mt-2 min-h-12 rounded-xl border border-lion-border px-4 text-sm" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>重新載入邀請</button></div>}

        {newRegisterUrl && generatedInvite && (
          <div className="rounded-2xl bg-lion-card border border-lion-gold/30 p-5 flex flex-col items-center mb-6">
            <p className="text-xs text-lion-gold mb-3">最新產生的邀請，給新會員掃描</p>
            <div className="w-40 h-40 rounded-xl overflow-hidden mb-3">
              <QrCode value={newRegisterUrl} />
            </div>
            <p className="mb-3 text-xs text-lion-muted">註冊效期至 {new Date(generatedInvite.validUntil).toLocaleString("zh-TW")}</p>
            <button type="button" className="min-h-12 rounded-xl border border-lion-border px-5 text-sm" onClick={async () => {
              try { await navigator.clipboard.writeText(newRegisterUrl); setCopyNotice("QR 連結已複製，可傳給現場夥伴"); }
              catch { setCopyNotice("無法自動複製，請改用 QR Code 給對方掃描"); }
            }}>複製 QR 連結</button>
            {copyNotice && <p className="mt-2 text-xs text-lion-gold" role="status">{copyNotice}</p>}
          </div>
        )}

        <h2 className="text-sm font-semibold mb-2">歷史邀請</h2>
        <div className="flex flex-col gap-2">
          {invitesLoading && <p className="text-sm text-lion-muted text-center py-8" role="status">正在載入邀請紀錄…</p>}
          {!invitesLoading && !error && invites.length === 0 && <p className="text-sm text-lion-muted text-center py-8">尚未產生過邀請</p>}
          {invites.map((inv, index) => {
            const expired = new Date(inv.validUntil) < new Date();
            return (
              <div key={inv.id} className="rounded-xl bg-lion-card border border-white/[0.06] p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">邀請 QR {index + 1}</p>
                  <p className="text-[11px] text-lion-muted">
                    已使用 {inv.usageCount}
                    {inv.usageLimit ? ` / ${inv.usageLimit}` : ""} 次 · 效期至{" "}
                    {new Date(inv.validUntil).toLocaleDateString("zh-TW")}
                  </p>
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full ${
                    inv.revokedAt || expired ? "bg-white/10 text-lion-muted" : "bg-lion-gold/15 text-lion-gold"
                  }`}
                >
                  {inv.revokedAt ? "已停用" : expired ? "已過期" : "生效中"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
