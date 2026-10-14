"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { colorFromId } from "@/lib/avatar-color";
import {
  calculateLionYears,
  formatJoinDate,
  formatLionsYear,
  MemberExperience,
  positionOptions,
  verificationLabels,
} from "@/lib/experience-data";

type MemberProfile = {
  id: string;
  name: string;
  nickname: string | null;
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  joinMonth: number | null;
  organization: { id: string; name: string; districtCode: string | null };
  tags: Array<{ id: string; name: string; category: string }>;
  experiences: MemberExperience[];
  blockedByMe?: boolean;
};

function positionName(experience: MemberExperience) {
  if (experience.kind === "membership") return "加入獅子會";
  return positionOptions.find((position) => position.code === experience.positionCode)?.label ?? "其他職務";
}

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [toast, setToast] = useState("");

  async function toggleBlock() {
    if (!member) return;
    const blocking = !member.blockedByMe;
    if (blocking && !window.confirm(`確定要封鎖 ${member.name} 嗎？封鎖後會自動解除好友關係。`)) return;
    setBusy(true);
    setError("");
    try {
    const res = await fetch(`/api/members/${member.id}/block`, { method: blocking ? "POST" : "DELETE" });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { router.replace("/login?reason=session-expired"); return; }
    if (!res.ok) throw new Error(result.error ?? "封鎖狀態更新失敗，請重試");
    if (res.ok) {
      if (blocking) { setMember(null); router.replace("/profile"); return; }
      setMember((prev) => (prev ? { ...prev, blockedByMe: blocking } : prev));
      setToast(blocking ? "已封鎖" : "已取消封鎖");
      setTimeout(() => setToast(""), 2500);
    }
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，請重新載入確認封鎖狀態後再試"); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    if (!member || !reportReason.trim()) return;
    setBusy(true);
    setError("");
    try {
    const res = await fetch(`/api/members/${member.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reportReason.trim() }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { router.replace("/login?reason=session-expired"); return; }
    if (!res.ok) throw new Error(result.error ?? "檢舉未送出，請重試");
    if (res.ok) {
      setShowReportForm(false);
      setReportReason("");
      setToast("已送出檢舉，感謝您的回報");
      setTimeout(() => setToast(""), 2500);
    }
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，檢舉送出結果尚未確認，請稍後再試"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    fetch(`/api/members/${params.id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "無法載入會員資料");
          return null;
        }
        return data.member as MemberProfile;
      })
      .then((data) => data && setMember(data))
      .catch(() => setError("會員資料連線中斷，請重新整理後重試"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  const experiences = useMemo(
    () => [...(member?.experiences ?? [])].sort((a, b) => b.startYear - a.startYear),
    [member]
  );

  if (loading) {
    return (
      <AppShell showNav={false}>
        <p className="px-5 py-20 text-center text-sm text-lion-muted">載入會員資料中...</p>
      </AppShell>
    );
  }

  if (!member) {
    return (
      <AppShell showNav={false}>
        <div className="px-5 py-20 text-center">
          <p className="mb-4 text-sm text-red-300">{error || "找不到會員資料"}</p>
          <button onClick={() => router.back()} className="text-sm text-lion-gold">返回好友列表</button>
        </div>
      </AppShell>
    );
  }

  const lionYears = member.joinYear ? calculateLionYears(String(member.joinYear), member.joinMonth) : null;

  return (
    <AppShell showNav={false}>
      <div className="px-5 pb-8 pt-6">
        <button onClick={() => router.back()} className="mb-5 text-sm text-lion-muted">← 返回</button>

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}
        {error && <p role="alert" className="mb-4 text-base text-lion-danger">{error}</p>}

        <section className="theme-brand-panel mb-5 rounded-3xl border border-lion-gold/25 bg-gradient-to-br from-[#19264a] via-lion-navyLight to-[#10172b] p-5 text-center">
          <div className="mx-auto mb-3 w-fit">
            <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={84} />
          </div>
          <h1 className="text-xl font-bold">{member.nickname || member.name}</h1>
          {member.nickname && <p className="mt-0.5 text-xs text-lion-muted">{member.name}</p>}
          <p className="mt-1 text-sm text-lion-muted">{member.organization.name} · {member.title ?? "會員"}</p>
          {member.organization.districtCode && (
            <p className="mt-1 text-xs text-lion-gold">{member.organization.districtCode} 區</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <p className="text-lion-muted">入會年度</p>
              <p className="mt-1 font-semibold">{formatJoinDate(member.joinYear, member.joinMonth) ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <p className="text-lion-muted">獅齡</p>
              <p className="mt-1 font-semibold">{lionYears == null ? "—" : `${lionYears} 年`}</p>
            </div>
          </div>
        </section>

        <div className="mb-5 flex gap-2">
          <button
            onClick={toggleBlock}
            disabled={busy}
            className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-xs disabled:opacity-50"
          >
            {member.blockedByMe ? "取消封鎖" : "封鎖此會員"}
          </button>
          <button
            onClick={() => setShowReportForm((v) => !v)}
            className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-xs"
          >
            檢舉
          </button>
        </div>

        {showReportForm && (
          <div className="mb-5 rounded-2xl border border-white/[0.06] bg-lion-card p-4">
            <label htmlFor="member-report-reason" className="mb-1 block text-sm text-lion-muted">檢舉原因</label>
            <textarea
              id="member-report-reason"
              disabled={busy}
              maxLength={1000}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={3}
              placeholder="請簡述檢舉原因"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold resize-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setShowReportForm(false)}
                disabled={busy}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-xs"
              >
                取消
              </button>
              <button
                onClick={submitReport}
                disabled={busy || !reportReason.trim()}
                className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-base disabled:opacity-50"
              >
                送出檢舉
              </button>
            </div>
          </div>
        )}

        {member.tags.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold">專長／興趣</h2>
            <div className="flex flex-wrap gap-2">
              {member.tags.map((tag) => (
                <span key={tag.id} className="rounded-full border border-lion-gold/40 px-3 py-1.5 text-xs text-lion-gold">
                  #{tag.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {member.bio && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold">關於我</h2>
            <p className="rounded-2xl border border-white/[0.06] bg-lion-card p-4 text-sm leading-relaxed text-lion-cream/70">
              {member.bio}
            </p>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold">獅子會資歷</h2>
          {experiences.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-lion-card px-4 py-8 text-center text-sm text-lion-muted">
              對方尚未公開資歷資料
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {experiences.map((experience) => (
                <article key={experience.id} className="rounded-2xl border border-white/[0.06] bg-lion-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{positionName(experience)}</p>
                      <p className="mt-1 text-xs text-lion-muted">{experience.organizationName}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] text-lion-muted">
                      {verificationLabels[experience.verificationStatus]}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-lion-gold">
                    {formatLionsYear(experience)}{experience.isCurrent ? " · 現任" : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
