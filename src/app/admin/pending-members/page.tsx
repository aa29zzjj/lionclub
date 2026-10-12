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
  const now = new Date();
  const [joinDates, setJoinDates] = useState<Record<string, { year: string; month: string }>>({});

  function joinDateFor(memberId: string) {
    return joinDates[memberId] ?? { year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
  }

  function setJoinDateField(memberId: string, field: "year" | "month", value: string) {
    setJoinDates((prev) => ({ ...prev, [memberId]: { ...joinDateFor(memberId), [field]: value } }));
  }

  function load() {
    return fetch("/api/admin/pending-members")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setMembers(data.members ?? []);
      });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(memberId: string, action: "approve" | "reject") {
    setBusyId(memberId);
    const body: { action: "approve" | "reject"; joinYear?: number; joinMonth?: number } = { action };
    if (action === "approve") {
      const { year, month } = joinDateFor(memberId);
      if (year) body.joinYear = Number(year);
      if (month) body.joinMonth = Number(month);
    }
    const res = await fetch(`/api/admin/pending-members/${memberId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setToast(action === "approve" ? "已核准" : "已拒絕");
      setTimeout(() => setToast(""), 2500);
    }
    setBusyId(null);
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
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {members.length === 0 && (
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
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-lion-muted shrink-0">入會年月</span>
                <input
                  type="number"
                  value={joinDateFor(m.id).year}
                  onChange={(e) => setJoinDateField(m.id, "year", e.target.value)}
                  className="w-20 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 text-xs outline-none focus:border-lion-gold"
                />
                <span className="text-xs text-lion-muted">年</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={joinDateFor(m.id).month}
                  onChange={(e) => setJoinDateField(m.id, "month", e.target.value)}
                  className="w-14 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 text-xs outline-none focus:border-lion-gold"
                />
                <span className="text-xs text-lion-muted">月</span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => respond(m.id, "approve")}
                  disabled={busyId === m.id}
                  className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  核准
                </button>
                <button
                  onClick={() => respond(m.id, "reject")}
                  disabled={busyId === m.id}
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
