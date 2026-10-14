"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type PendingMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: { id: string; name: string };
  createdAt: string;
};

export default function PendingMembersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const now = new Date();
  const [joinDates, setJoinDates] = useState<Record<string, { year: string; month: string }>>({});

  function joinDateFor(memberId: string) {
    return joinDates[memberId] ?? { year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
  }

  function setJoinDateField(memberId: string, field: "year" | "month", value: string) {
    setJoinDates((prev) => ({ ...prev, [memberId]: { ...joinDateFor(memberId), [field]: value } }));
  }

  function load() {
    setLoading(true); setError("");
    return fetch("/api/admin/pending-members")
      .then(async (res) => {
        if (res.status === 401) {
          setMembers([]); router.replace("/login?reason=session-expired");
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          setMembers([]);
          return null;
        }
        if (!res.ok) throw new Error("待審核名單暫時無法載入");
        return res.json();
      })
      .then((data) => {
        if (data) setMembers(data.members ?? []);
      })
      .catch(() => setError("待審核名單連線中斷，請重新載入"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(memberId: string, action: "approve" | "reject") {
    if (busyId) return;
    const member = members.find((entry) => entry.id === memberId);
    if (!member) return;
    if (action === "reject" && !window.confirm(`確定拒絕 ${member.name}（${member.email || member.organization.name}）的申請嗎？這會刪除這筆待審核帳號及申請，無法復原。`)) return;
    setBusyId(memberId);
    setError(""); setToast("");
    const body: { action: "approve" | "reject"; joinYear?: number; joinMonth?: number } = { action };
    if (action === "approve") {
      const { year, month } = joinDateFor(memberId);
      if (year) body.joinYear = Number(year);
      if (month) body.joinMonth = Number(month);
    }
    try {
    const res = await fetch(`/api/admin/pending-members/${memberId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { setMembers([]); router.replace("/login?reason=session-expired"); return; }
    if (res.status === 403) { setMembers([]); setForbidden(true); return; }
    if (!res.ok) throw new Error(result.error ?? "審核未完成，請重試");
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setToast(action === "approve" ? `已核准 ${member.name}` : `已拒絕並移除 ${member.name} 的待審核申請`);
    }
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，請重新載入確認結果後再試"); }
    finally { setBusyId(null); }
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
          <h1 className="text-xl font-bold mb-4">審核新會員</h1>
          <p className="text-sm text-lion-muted text-center py-12">
            您目前沒有審核權限。如果您是會長／財務／幹部，請確認帳號是否已被授權。
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold mb-1">審核新會員</h1>
        <p className="text-xs text-lion-muted mb-4">待審核 {members.length} 筆</p>

        {toast && (
          <div role="status" className="mb-4 rounded-xl border border-lion-border bg-lion-card text-base px-3 py-3">
            {toast}
          </div>
        )}
        {error && <div className="mb-4"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={Boolean(busyId)} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入名單</button></div>}

        <div className="flex flex-col gap-3">
          {members.length === 0 && !error && (
            <p className="text-sm text-lion-muted text-center py-12">目前沒有待審核的申請</p>
          )}
          {members.map((m) => (
            <div key={m.id} className="rounded-2xl bg-lion-card border border-white/[0.06] p-4">
              <p className="font-semibold text-sm">{m.name}</p>
              <p className="text-xs text-lion-muted mt-0.5">{m.organization.name}</p>
              <div className="mt-2 text-xs text-lion-cream/70 flex flex-col gap-0.5">
                {m.email && <p>Email：{m.email}</p>}
                {m.phone && <p>手機：{m.phone}</p>}
                <p className="text-lion-muted">
                  申請時間：{new Date(m.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className="text-sm text-lion-muted">入會年
                <input
                  type="number"
                  value={joinDateFor(m.id).year}
                  onChange={(e) => setJoinDateField(m.id, "year", e.target.value)}
                  disabled={Boolean(busyId)}
                  min={1900}
                  max={2100}
                  className="mt-1 min-h-12 w-full rounded-lg bg-lion-soft border border-lion-border px-2 py-2 text-base outline-none focus:border-lion-gold"
                />
                </label><label className="text-sm text-lion-muted">入會月
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={joinDateFor(m.id).month}
                  onChange={(e) => setJoinDateField(m.id, "month", e.target.value)}
                  disabled={Boolean(busyId)}
                  className="mt-1 min-h-12 w-full rounded-lg bg-lion-soft border border-lion-border px-2 py-2 text-base outline-none focus:border-lion-gold"
                />
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => respond(m.id, "approve")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  核准
                </button>
                <button
                  onClick={() => respond(m.id, "reject")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-sm disabled:opacity-50"
                >
                  拒絕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
