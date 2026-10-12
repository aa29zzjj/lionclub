"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { colorFromId } from "@/lib/avatar-color";
import {
  calculateLionYears,
  formatLionsYear,
  MemberExperience,
  positionOptions,
  verificationLabels,
} from "@/lib/experience-data";

type MemberProfile = {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  organization: { id: string; name: string; districtCode: string | null };
  tags: Array<{ id: string; name: string; category: string }>;
  experiences: MemberExperience[];
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

  const lionYears = member.joinYear ? calculateLionYears(String(member.joinYear)) : null;

  return (
    <AppShell showNav={false}>
      <div className="px-5 pb-8 pt-6">
        <button onClick={() => router.back()} className="mb-5 text-sm text-lion-muted">← 返回</button>

        <section className="mb-5 rounded-3xl border border-lion-gold/25 bg-gradient-to-br from-[#19264a] via-lion-navyLight to-[#10172b] p-5 text-center">
          <div className="mx-auto mb-3 w-fit">
            <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={84} />
          </div>
          <h1 className="text-xl font-bold">{member.name}</h1>
          <p className="mt-1 text-sm text-lion-muted">{member.organization.name} · {member.title ?? "會員"}</p>
          {member.organization.districtCode && (
            <p className="mt-1 text-xs text-lion-gold">{member.organization.districtCode} 區</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <p className="text-lion-muted">入會年度</p>
              <p className="mt-1 font-semibold">{member.joinYear ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <p className="text-lion-muted">獅齡</p>
              <p className="mt-1 font-semibold">{lionYears == null ? "—" : `${lionYears} 年`}</p>
            </div>
          </div>
        </section>

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
