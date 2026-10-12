"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import QrCode from "@/components/QrCode";

type Invite = {
  id: string;
  pin: string;
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
  const [creating, setCreating] = useState(false);
  const [newRegisterUrl, setNewRegisterUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setMe(data);
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    fetch("/api/invites")
      .then((res) => {
        if (res.status === 403) {
          setForbidden(true);
          return { invites: [] };
        }
        return res.json();
      })
      .then((data) => setInvites(data.invites ?? []));
  }, [me]);

  async function handleCreate() {
    setCreating(true);
    setError("");
    setNewRegisterUrl(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "產生失敗");
        return;
      }
      setInvites((prev) => [data.invite, ...prev]);
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

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 text-sm mb-4 disabled:opacity-60"
        >
          {creating ? "產生中..." : "+ 產生新的邀請 QR"}
        </button>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {newRegisterUrl && invites[0] && (
          <div className="rounded-2xl bg-lion-card border border-lion-gold/30 p-5 flex flex-col items-center mb-6">
            <p className="text-xs text-lion-gold mb-3">最新產生的邀請，給新會員掃描</p>
            <div className="w-40 h-40 rounded-xl overflow-hidden mb-3">
              <QrCode value={newRegisterUrl} />
            </div>
            <p className="text-sm font-semibold tracking-widest mb-1">PIN：{invites[0].pin}</p>
            <p className="text-[11px] text-lion-muted break-all text-center">{newRegisterUrl}</p>
          </div>
        )}

        <h2 className="text-sm font-semibold mb-2">歷史邀請</h2>
        <div className="flex flex-col gap-2">
          {invites.length === 0 && <p className="text-sm text-lion-muted text-center py-8">尚未產生過邀請</p>}
          {invites.map((inv) => {
            const expired = new Date(inv.validUntil) < new Date();
            return (
              <div key={inv.id} className="rounded-xl bg-lion-card border border-white/[0.06] p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium tracking-widest">PIN {inv.pin}</p>
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
