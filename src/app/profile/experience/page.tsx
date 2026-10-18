"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { getClubDirectory, isClubInDistrictDirectory } from "@/lib/club-directory";
import { organizationDisplayName } from "@/lib/organization-label";
import { formatLionYear, formatLionYearDateRange, getCurrentLionYearStart, getLionYearStart } from "@/lib/lion-year";
import {
  calculateLionYears,
  currentExperienceLabel,
  districtOptions,
  experienceKindOptions,
  ExperienceKind,
  ExperienceVisibility,
  formatJoinDate,
  formatLionsYear,
  isOfficerPosition,
  isVerifiedCurrentPosition,
  MemberExperience,
  multipleDistrictOptions,
  organizationLevelOptions,
  OrganizationLevel,
  positionOptions,
  shortPositionLabel,
  verificationLabels,
  visibilityLabels,
} from "@/lib/experience-data";

type ExperienceDraft = {
  kind: ExperienceKind;
  level: OrganizationLevel;
  positionCode: string;
  organizationName: string;
  multipleDistrictCode: (typeof multipleDistrictOptions)[number];
  districtCode: string;
  startYear: number;
  startMonth: number | "";
  endYear: number;
  isCurrent: boolean;
  visibility: ExperienceVisibility;
  note: string;
};

type MeResponse = {
  name: string;
  photoUrl?: string | null;
  joinYear?: number | null;
  joinMonth?: number | null;
  organization: { name: string; districtCode?: string | null };
};

type AnnualAppointmentSuggestion = {
  id: string;
  positionName: string;
  listingNature: string;
  sourcePage: string;
  yearStart: number;
  organizationName: string;
};

const currentYear = new Date().getFullYear();
const currentLionYear = getCurrentLionYearStart();
const yearOptions = Array.from({ length: currentYear - 1916 }, (_, index) => currentYear - index);

const emptyDraft: ExperienceDraft = {
  kind: "position",
  level: "club",
  positionCode: "club_president",
  organizationName: "",
  multipleDistrictCode: "300A",
  districtCode: "300A-1",
  startYear: currentLionYear,
  startMonth: "",
  endYear: currentLionYear,
  isCurrent: true,
  visibility: "members",
  note: "",
};

function kindLabel(kind: ExperienceKind) {
  return experienceKindOptions.find((option) => option.value === kind)?.label ?? "其他";
}

function levelLabel(level: OrganizationLevel) {
  return organizationLevelOptions.find((option) => option.value === level)?.label ?? "組織";
}

function organizationNameFor(
  level: OrganizationLevel,
  multipleDistrictCode: string,
  districtCode: string,
  memberClub: string
) {
  if (level === "international") return "國際獅子會";
  if (level === "md") return `${multipleDistrictCode} 複合區`;
  if (level === "district") return `${districtCode} 區`;
  if (level === "region") return `${districtCode} 專區（編號待核）`;
  if (level === "zone") return `${districtCode} 分區（編號待核）`;
  if (level === "club") return memberClub;
  return "基金會／特殊組織（待核）";
}

function verificationClass(status: MemberExperience["verificationStatus"]) {
  if (status === "verified") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "rejected") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (status === "under-review") return "border-lion-gold/30 bg-lion-gold/10 text-lion-gold";
  return "border-white/10 bg-white/5 text-lion-muted";
}

export default function ExperiencePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [experiences, setExperiences] = useState<MemberExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ExperienceDraft>(emptyDraft);
  const [multipleTerms, setMultipleTerms] = useState(false);
  const [useCustomOrganization, setUseCustomOrganization] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [suggestions, setSuggestions] = useState<AnnualAppointmentSuggestion[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/me", { cache: "no-store" }),
      fetch("/api/me/experiences", { cache: "no-store" }),
      fetch("/api/me/annual-appointment-suggestions", { cache: "no-store" }),
    ])
      .then(async ([meResponse, experiencesResponse, suggestionsResponse]) => {
        if (meResponse.status === 401 || experiencesResponse.status === 401) {
          router.replace("/login");
          return;
        }
        const mePayload = await meResponse.json();
        const experiencesPayload = await experiencesResponse.json();
        if (!meResponse.ok) throw new Error(mePayload.error ?? "無法載入會員資料");
        if (!experiencesResponse.ok) throw new Error(experiencesPayload.error ?? "無法載入資歷");
        if (!active) return;
        setMe(mePayload);
        setExperiences(experiencesPayload.experiences ?? []);
        if (suggestionsResponse.ok) {
          const suggestionsPayload = await suggestionsResponse.json();
          if (active) setSuggestions(suggestionsPayload.suggestions ?? []);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "載入失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function claimSuggestion(appointmentId: string) {
    if (claimingId) return;
    setClaimingId(appointmentId);
    setError("");
    try {
      const response = await fetch("/api/me/annual-appointment-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!response.ok) { setError(data.error ?? "帶入失敗，請重新整理後再試"); return; }
      setExperiences((previous) => [...previous, data.experience]);
      setSuggestions((previous) => previous.filter((s) => s.id !== appointmentId));
      setToast(`已帶入「${data.experience.positionName}」，等候核實`);
    } catch {
      setError("連線中斷，請重新整理確認是否已帶入");
    } finally {
      setClaimingId(null);
    }
  }

  const districtCode = me?.organization.districtCode ?? "300A-1";
  const profile = {
    name: me?.name ?? "會員",
    chapter: me?.organization.name ?? "分會",
    avatarColor: "#173d78",
    avatarUrl: me?.photoUrl ?? undefined,
    joinYear: me?.joinYear ? String(me.joinYear) : "—",
    joinMonth: me?.joinMonth ?? null,
    districtCode,
    multipleDistrictCode: districtCode.split("-")[0] ?? "300A",
    regionName: "",
    zoneName: "",
  };

  const sortedExperiences = useMemo(
    () => [...experiences].sort((a, b) => b.startYear - a.startYear || Number(b.isCurrent) - Number(a.isCurrent)),
    [experiences]
  );
  const lionYears = calculateLionYears(profile.joinYear, profile.joinMonth);
  const selectableYears = Array.from(new Set([...yearOptions, draft.startYear, draft.endYear])).sort((a, b) => b - a);
  const joiningLionYear = getLionYearStart(draft.startYear, draft.startMonth === "" ? null : draft.startMonth);
  const verifiedCount = experiences.filter((experience) => experience.verificationStatus === "verified").length;
  const availablePositions = positionOptions.filter(
    (position) => position.level === draft.level && position.kind === draft.kind
  );
  const availableDistricts = districtOptions[draft.multipleDistrictCode];
  const clubDirectory = getClubDirectory(draft.districtCode);
  const availableClubs = clubDirectory?.clubs ?? [];
  const suggestedOrganizationName = organizationNameFor(
    draft.level,
    draft.multipleDistrictCode,
    draft.districtCode,
    profile.chapter
  );

  function openNewForm() {
    const directory = getClubDirectory(emptyDraft.districtCode);
    const profileClubIsListed = directory?.clubs.includes(profile.chapter) ?? false;
    setEditingId(null);
    setDraft({
      ...emptyDraft,
      organizationName: profileClubIsListed ? profile.chapter : directory?.clubs[0] ?? profile.chapter,
      startYear: currentLionYear,
      endYear: currentLionYear,
      districtCode: districtOptions[emptyDraft.multipleDistrictCode][0],
    });
    setMultipleTerms(false);
    setUseCustomOrganization(!directory);
    setError("");
    setShowForm(true);
  }

  function openEditForm(experience: MemberExperience) {
    const mdCode = multipleDistrictOptions.includes(
      experience.multipleDistrictCode as (typeof multipleDistrictOptions)[number]
    )
      ? (experience.multipleDistrictCode as (typeof multipleDistrictOptions)[number])
      : "300A";
    setEditingId(experience.id);
    setDraft({
      kind: experience.kind,
      level: experience.level,
      positionCode: experience.positionCode,
      organizationName: experience.organizationName,
      multipleDistrictCode: mdCode,
      districtCode: experience.districtCode ?? districtOptions[mdCode][0],
      startYear: experience.startYear,
      startMonth: experience.startMonth ?? "",
      endYear: experience.endYear ?? experience.startYear,
      isCurrent: experience.isCurrent,
      visibility: experience.visibility,
      note: experience.note ?? "",
    });
    setMultipleTerms(experience.endYear !== undefined && experience.endYear > experience.startYear);
    setUseCustomOrganization(
      experience.level === "club" &&
        !isClubInDistrictDirectory(experience.districtCode, experience.organizationName)
    );
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError("");
  }

  function changeKind(kind: ExperienceKind) {
    if (kind === "membership") {
      const directory = getClubDirectory(draft.districtCode);
      const profileClubIsListed = directory?.clubs.includes(profile.chapter) ?? false;
      setUseCustomOrganization(!directory);
      setDraft((previous) => ({
        ...previous,
        kind,
        startYear: previous.kind === "membership" ? previous.startYear : currentYear,
        startMonth: previous.kind === "membership" ? previous.startMonth : "",
        endYear: previous.kind === "membership" ? previous.endYear : currentYear,
        level: "club",
        positionCode: "membership_joined",
        organizationName: profileClubIsListed ? profile.chapter : directory?.clubs[0] ?? profile.chapter,
      }));
      setMultipleTerms(false);
      return;
    }
    const nextPosition = positionOptions.find((position) => position.kind === kind);
    setDraft((previous) => ({
      ...previous,
      kind,
      startYear: previous.kind === "membership" ? currentLionYear : previous.startYear,
      endYear: previous.kind === "membership" ? currentLionYear : previous.endYear,
      level: nextPosition?.level ?? "club",
      positionCode: nextPosition?.code ?? "special_role",
      organizationName: organizationNameFor(
        nextPosition?.level ?? "club",
        previous.multipleDistrictCode,
        previous.districtCode,
        profile.chapter
      ),
    }));
  }

  function changeLevel(level: OrganizationLevel) {
    const nextPosition = positionOptions.find((position) => position.kind === draft.kind && position.level === level);
    const directory = level === "club" ? getClubDirectory(draft.districtCode) : undefined;
    setUseCustomOrganization(level === "club" && !directory);
    setDraft((previous) => ({
      ...previous,
      level,
      positionCode: nextPosition?.code ?? "",
      organizationName:
        level === "club"
          ? directory?.clubs[0] ?? profile.chapter
          : organizationNameFor(level, previous.multipleDistrictCode, previous.districtCode, profile.chapter),
    }));
  }

  function changeMultipleDistrict(code: (typeof multipleDistrictOptions)[number]) {
    const firstDistrict = districtOptions[code][0];
    const directory = getClubDirectory(firstDistrict);
    if (draft.level === "club") setUseCustomOrganization(!directory);
    setDraft((previous) => ({
      ...previous,
      multipleDistrictCode: code,
      districtCode: firstDistrict,
      organizationName:
        previous.level === "club"
          ? directory?.clubs[0] ?? ""
          : organizationNameFor(previous.level, code, firstDistrict, profile.chapter),
    }));
  }

  function changeDistrict(code: string) {
    const directory = getClubDirectory(code);
    if (draft.level === "club") setUseCustomOrganization(!directory);
    setDraft((previous) => {
      const previousSuggestion = organizationNameFor(
        previous.level,
        previous.multipleDistrictCode,
        previous.districtCode,
        profile.chapter
      );
      const nextSuggestion = organizationNameFor(
        previous.level,
        previous.multipleDistrictCode,
        code,
        profile.chapter
      );
      return {
        ...previous,
        districtCode: code,
        organizationName:
          previous.level === "club"
            ? directory?.clubs[0] ?? ""
            : !previous.organizationName || previous.organizationName === previousSuggestion
              ? nextSuggestion
              : previous.organizationName,
      };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.kind !== "membership" && multipleTerms && draft.endYear < draft.startYear) {
      setError("最後任期年度不能早於第一任期年度");
      return;
    }
    if (draft.kind !== "membership" && !draft.positionCode) {
      setError("請選擇職位；目前層級若沒有選項，請改選其他層級");
      return;
    }
    if (!draft.organizationName.trim()) {
      setError("請輸入任職組織或分會名稱");
      return;
    }

    const selectedPosition = positionOptions.find((position) => position.code === draft.positionCode);
    const payload: Omit<MemberExperience, "id"> = {
      kind: draft.kind,
      level: draft.kind === "membership" ? "club" : draft.level,
      positionCode: draft.kind === "membership" ? "membership_joined" : draft.positionCode,
      positionName: draft.kind === "membership" ? "加入獅子會" : selectedPosition?.label ?? "其他職務",
      organizationName: draft.organizationName.trim(),
      organizationIsUnlisted:
        draft.level === "club" &&
        !isClubInDistrictDirectory(draft.districtCode, draft.organizationName.trim()),
      multipleDistrictCode: draft.multipleDistrictCode,
      districtCode: draft.districtCode,
      startYear: draft.startYear,
      startMonth: draft.kind === "membership" && draft.startMonth !== "" ? draft.startMonth : null,
      endYear: draft.kind === "membership" ? undefined : multipleTerms ? draft.endYear : draft.startYear,
      datePrecision: draft.kind === "membership" ? draft.startMonth === "" ? "approximate" : "month" : "lions-year",
      isCurrent: draft.isCurrent,
      verificationStatus: "under-review",
      visibility: draft.visibility,
      note: draft.note || undefined,
      isDemo: false,
    };

    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/me/experiences/${editingId}` : "/api/me/experiences", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "資歷儲存失敗");
      setExperiences((current) =>
        editingId
          ? current.map((experience) => (experience.id === editingId ? result.experience : experience))
          : [result.experience, ...current]
      );
      setToast(editingId ? "資歷已更新並送交審核" : "資歷已新增並送交審核");
      closeForm();
      window.setTimeout(() => setToast(""), 2500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "資歷儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(experience: MemberExperience) {
    if (!window.confirm(`確定刪除「${experience.positionName}」這筆資歷嗎？`)) return;
    setError("");
    try {
      const response = await fetch(`/api/me/experiences/${experience.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "資歷刪除失敗");
      setExperiences((current) => current.filter((item) => item.id !== experience.id));
      setToast("資歷已刪除");
      window.setTimeout(() => setToast(""), 2500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "資歷刪除失敗");
    }
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => router.back()} className="text-sm text-lion-muted">
            ← 返回
          </button>
          <button
            onClick={openNewForm}
            className="rounded-full bg-lion-action text-lion-navyDeep px-3.5 py-2 text-xs font-semibold"
          >
            ＋ 新增資歷
          </button>
        </div>

        <div className="theme-brand-panel rounded-3xl bg-gradient-to-br from-[#19264a] via-lion-navyLight to-[#10172b] border border-lion-gold/25 p-5 mb-4 overflow-hidden relative">
          <div className="absolute -right-10 -top-12 w-32 h-32 rounded-full border border-lion-gold/10" />
          <p className="text-[10px] tracking-[0.24em] text-lion-gold mb-4">LIONS CLUB EXPERIENCE</p>
          <div className="flex items-center gap-3.5 relative">
            <Avatar name={profile.name} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={60} />
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{profile.name}</h1>
              <p className="text-xs text-lion-muted mt-0.5 truncate">{organizationDisplayName({ name: profile.chapter })}</p>
              {profile.districtCode && (
                <p className="text-[10px] text-lion-gold/80 mt-1 truncate">
                  {profile.multipleDistrictCode} 複合區 · {profile.districtCode} 區
                  {profile.regionName ? ` · ${profile.regionName}` : ""}
                  {profile.zoneName ? ` · ${profile.zoneName}` : ""}
                </p>
              )}
              <p className="text-xs text-lion-cream/70 mt-1">入會 {formatJoinDate(me?.joinYear, profile.joinMonth) ?? "—"} · 獅齡 {lionYears ?? "—"} 年</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5">
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">{experiences.length}</p>
              <p className="text-[10px] text-lion-muted">資歷紀錄</p>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">
                {experiences.filter((experience) => isVerifiedCurrentPosition(experience)).length}
              </p>
              <p className="text-[10px] text-lion-muted">本年度核實職務</p>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">{verifiedCount}</p>
              <p className="text-[10px] text-lion-muted">資歷已核實</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-lion-muted">本人標示現任 {experiences.filter(experience => experience.isCurrent && experience.kind !== "membership").length} 筆；自填現任不等於本年度核實，也不產生管理權限。</p>
        </div>

        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3.5 py-3 text-xs text-sky-200/90 leading-relaxed mb-5">
          資歷會儲存至會員資料庫；本人新增或修改後預設為「待審核」。幹部職稱與系統管理權限分開，不會因填寫職稱而取得後台權限。
        </div>

        {loading && <p className="mb-4 text-center text-xs text-lion-muted">正在載入資歷…</p>}

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl bg-lion-card border border-white/[0.08] p-4 mb-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{editingId ? "編輯資歷" : "新增資歷"}</p>
                <p className="text-[11px] text-lion-muted mt-0.5">儲存後先進入待審核狀態</p>
              </div>
              <button type="button" onClick={closeForm} className="text-xs text-lion-muted">關閉</button>
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1.5 block">資料類型</label>
              <div className="grid grid-cols-2 gap-2">
                {experienceKindOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => changeKind(option.value)}
                    className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                      draft.kind === option.value
                        ? "border-lion-gold bg-lion-gold/10 text-lion-gold"
                        : "border-white/10 bg-white/[0.03] text-lion-cream/60"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {draft.kind !== "membership" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="experience-level" className="text-xs text-lion-muted mb-1 block">職務級別</label>
                  <select
                    id="experience-level"
                    value={draft.level}
                    onChange={(event) => changeLevel(event.target.value as OrganizationLevel)}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                  >
                    {organizationLevelOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-lion-card text-lion-cream">{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="experience-position" className="text-xs text-lion-muted mb-1 block">職位</label>
                  <select
                    id="experience-position"
                    value={draft.positionCode}
                    onChange={(event) => setDraft((previous) => ({ ...previous, positionCode: event.target.value }))}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                  >
                    {availablePositions.length === 0 && <option value="" className="bg-lion-card text-lion-cream">此層級暫無選項</option>}
                    {availablePositions.map((position) => (
                      <option key={position.code} value={position.code} className="bg-lion-card text-lion-cream">{position.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {draft.level !== "international" && draft.level !== "foundation" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                <label htmlFor="experience-md" className="text-xs text-lion-muted mb-1 block">複合區</label>
                <select
                  id="experience-md"
                  value={draft.multipleDistrictCode}
                  onChange={(event) => changeMultipleDistrict(event.target.value as (typeof multipleDistrictOptions)[number])}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  {multipleDistrictOptions.map((code) => (
                    <option key={code} value={code} className="bg-lion-card text-lion-cream">MD{code}</option>
                  ))}
                </select>
                </div>
                {draft.level !== "md" && (
                  <div>
                <label htmlFor="experience-district" className="text-xs text-lion-muted mb-1 block">區</label>
                <select
                  id="experience-district"
                  value={draft.districtCode}
                  onChange={(event) => changeDistrict(event.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  {availableDistricts.map((code) => (
                    <option key={code} value={code} className="bg-lion-card text-lion-cream">{code} 區</option>
                  ))}
                </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="experience-organization" className="text-xs text-lion-muted">任職組織／分會</label>
                {draft.level === "club" && availableClubs.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextCustom = !useCustomOrganization;
                      setUseCustomOrganization(nextCustom);
                      setDraft((previous) => ({
                        ...previous,
                        organizationName: nextCustom ? "" : availableClubs[0] ?? "",
                      }));
                    }}
                    className="text-[11px] text-lion-gold"
                  >
                    {useCustomOrganization ? "改用官方選單" : "名單找不到？手動輸入"}
                  </button>
                ) : draft.organizationName !== suggestedOrganizationName ? (
                  <button
                    type="button"
                    onClick={() => setDraft((previous) => ({ ...previous, organizationName: suggestedOrganizationName }))}
                    className="text-[11px] text-lion-gold"
                  >
                    套用建議組織
                  </button>
                ) : null}
              </div>
              {draft.level === "club" && availableClubs.length > 0 && !useCustomOrganization ? (
                <select
                  id="experience-organization"
                  value={draft.organizationName}
                  onChange={(event) => setDraft((previous) => ({ ...previous, organizationName: event.target.value }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  <option value="" className="bg-lion-card text-lion-cream">請選擇分會</option>
                  {availableClubs.map((club) => (
                    <option key={club} value={club} className="bg-lion-card text-lion-cream">{club}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="experience-organization"
                  value={draft.organizationName}
                  onChange={(event) => setDraft((previous) => ({ ...previous, organizationName: event.target.value }))}
                  placeholder="搜尋或輸入當時任職的組織名稱"
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold placeholder:text-lion-cream/25"
                />
              )}
              {draft.level === "club" && clubDirectory ? (
                <p className="text-[11px] text-lion-muted mt-1.5 leading-relaxed">
                  已載入 {draft.districtCode} 區官方名單，共 {availableClubs.length} 間分會 ·{" "}
                  <a
                    href={clubDirectory.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-lion-gold"
                  >
                    查看來源
                  </a>
                  。手動輸入的名稱會以「組織待核」保存。
                </p>
              ) : (
                <p className="text-[11px] text-lion-muted mt-1.5 leading-relaxed">
                  此層級尚無完整官方名單，可先輸入正式名稱並以「組織待核」保存。
                </p>
              )}
              {(draft.level === "region" || draft.level === "zone") && (
                <p className="text-[11px] text-lion-gold/80 mt-1">專區／分區名冊尚未完整，先以待核狀態保存。</p>
              )}
            </div>

            <div className={draft.kind === "membership" ? "grid grid-cols-2 gap-3" : "space-y-3"}>
              <div>
                <label htmlFor="experience-start-year" className="text-xs text-lion-muted mb-1 block">
                  {draft.kind === "membership" ? "加入年份" : multipleTerms ? "第一個任期年度" : "任期年度（一年）"}
                </label>
                <select
                  id="experience-start-year"
                  value={draft.startYear}
                  onChange={(event) => setDraft((previous) => ({
                    ...previous,
                    startYear: Number(event.target.value),
                    endYear: multipleTerms ? Math.max(previous.endYear, Number(event.target.value)) : Number(event.target.value),
                  }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  {selectableYears.map((year) => (
                    <option key={year} value={year} className="bg-lion-card text-lion-cream">
                      {draft.kind === "membership" ? year : `${formatLionYear(year)}（7/1–隔年 6/30）`}
                    </option>
                  ))}
                </select>
              </div>
              {draft.kind === "membership" ? <div>
                <label htmlFor="experience-start-month" className="text-xs text-lion-muted mb-1 block">加入月份（可待補）</label>
                <select
                  id="experience-start-month"
                  value={draft.startMonth}
                  onChange={(event) => setDraft((previous) => ({ ...previous, startMonth: event.target.value === "" ? "" : Number(event.target.value) }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  <option value="" className="bg-lion-card text-lion-cream">月份未知／待補</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month} className="bg-lion-card text-lion-cream">{month} 月</option>)}
                </select>
              </div> : <label className="flex items-center gap-2 text-xs text-lion-muted">
                <input
                  type="checkbox"
                  checked={multipleTerms}
                  onChange={(event) => {
                    setMultipleTerms(event.target.checked);
                    if (!event.target.checked) setDraft((previous) => ({ ...previous, endYear: previous.startYear }));
                  }}
                  className="accent-[#C8A951]"
                />
                此紀錄包含連續多個年度任期
              </label>}
              {draft.kind !== "membership" && multipleTerms && <div>
                <label htmlFor="experience-end-year" className="text-xs text-lion-muted mb-1 block">最後一個任期年度（起始年）</label>
                <select
                  id="experience-end-year"
                  value={draft.endYear}
                  onChange={(event) => setDraft((previous) => ({ ...previous, endYear: Number(event.target.value) }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold disabled:opacity-40"
                >
                  {selectableYears.filter((year) => year >= draft.startYear).map((year) => <option key={year} value={year} className="bg-lion-card text-lion-cream">{formatLionYear(year)}（7/1–隔年 6/30）</option>)}
                </select>
              </div>}
            </div>
            <p className="text-[11px] text-lion-muted leading-relaxed">
              {draft.kind === "membership"
                ? joiningLionYear === null
                  ? "會籍年度以每年 7 月 1 日分界；月份待補時，不推定所屬會籍年度。"
                  : `${formatLionYear(joiningLionYear, true)} 會籍：${formatLionYearDateRange(joiningLionYear)}。每年 7 月 1 日起算新會籍年度。`
                : `任期期間：${formatLionYearDateRange(draft.startYear, multipleTerms ? draft.endYear : draft.startYear)}；每個年度皆為 7 月 1 日至隔年 6 月 30 日。「現任」僅標記狀態，不自動延長年度。`}
            </p>

            <label className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isCurrent}
                onChange={(event) => setDraft((previous) => ({ ...previous, isCurrent: event.target.checked }))}
                className="accent-[#C8A951]"
              />
              {draft.kind === "membership" ? "目前仍保有此會籍" : "目前仍在任"}
              {draft.isCurrent && isOfficerPosition(draft.level, draft.kind) && (
                <span className="inline-flex items-center gap-1 ml-auto text-[11px] text-red-300">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  本人標示現任，待上一級核實
                </span>
              )}
            </label>

            <div>
              <label htmlFor="experience-visibility" className="text-xs text-lion-muted mb-1 block">對外可見性</label>
              <select
                id="experience-visibility"
                value={draft.visibility}
                onChange={(event) => setDraft((previous) => ({ ...previous, visibility: event.target.value as ExperienceVisibility }))}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
              >
                <option value="public" className="bg-lion-card text-lion-cream">公開</option>
                <option value="members" className="bg-lion-card text-lion-cream">會員可見</option>
                <option value="only-me" className="bg-lion-card text-lion-cream">僅自己</option>
              </select>
            </div>

            <div>
              <label htmlFor="experience-note" className="text-xs text-lion-muted mb-1 block">補充說明（選填）</label>
              <textarea
                id="experience-note"
                rows={2}
                value={draft.note}
                onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))}
                placeholder="例如委員會名稱、當屆說明或證明來源"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold resize-none placeholder:text-lion-cream/25"
              />
            </div>

            {error && <p className="text-xs text-red-300">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={closeForm} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm text-lion-cream/70">取消</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-lion-action py-2.5 text-sm font-semibold text-lion-navyDeep disabled:opacity-50">
                {saving ? "儲存中…" : "儲存資歷"}
              </button>
            </div>
          </form>
        )}

        {suggestions.length > 0 && (
          <div className="mb-4 rounded-2xl border border-lion-gold/30 bg-lion-gold/5 p-4">
            <h2 className="font-semibold text-sm">在今年度核定名冊找到你的職務</h2>
            <p className="text-[11px] text-lion-muted mt-0.5 mb-3">依姓名與分會比對，一鍵帶入後仍為「本人填寫」狀態，需經授權管理者核實。</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-lion-card border border-white/[0.06] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.positionName}</p>
                    <p className="text-[11px] text-lion-muted">{s.organizationName} · {s.yearStart}-{s.yearStart + 1} 年度 · {s.listingNature}</p>
                  </div>
                  <button
                    onClick={() => claimSuggestion(s.id)}
                    disabled={claimingId === s.id}
                    className="shrink-0 min-h-10 rounded-xl bg-lion-action px-3 text-xs font-semibold text-lion-navyDeep disabled:opacity-50"
                  >
                    {claimingId === s.id ? "帶入中…" : "加入我的資歷"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="font-semibold">資歷時間軸</h2>
            <p className="text-[11px] text-lion-muted mt-0.5">依最近年度排序，可保留同年度多重職務</p>
          </div>
          <span className="text-[11px] text-lion-gold">共 {experiences.length} 筆</span>
        </div>

        <div className="relative pl-4">
          <div className="absolute left-[7px] top-2 bottom-3 w-px bg-lion-gold/25" />
          {sortedExperiences.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
              <p className="text-sm text-lion-muted">尚未建立獅子會資歷</p>
              <button onClick={openNewForm} className="text-xs text-lion-gold mt-2">新增第一筆資歷</button>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {sortedExperiences.map((experience) => (
              <article key={experience.id} className="relative rounded-2xl bg-lion-card border border-white/[0.06] p-4 ml-3">
                <span className="absolute -left-[22px] top-5 w-3 h-3 rounded-full bg-lion-action border-[3px] border-lion-navyDeep" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex rounded-lg bg-[#173d78] px-2.5 py-1 text-xs font-medium text-[#F3F1EA] mb-2">
                      {formatLionsYear(experience)}
                    </p>
                    <h3 className="font-semibold">{shortPositionLabel(experience.positionCode, experience.positionName)}</h3>
                    {experience.kind !== "membership" && <p className="text-[11px] text-lion-muted mt-1">
                      {formatLionYearDateRange(experience.startYear, experience.endYear)}
                    </p>}
                    <p className="text-xs text-lion-muted mt-1">{organizationDisplayName({ name: experience.organizationName, level: experience.level })}</p>
                    {experience.organizationIsUnlisted && (
                      <p className="text-[11px] text-amber-300/80 mt-1">組織待核 · 尚未命中目前分會名冊</p>
                    )}
                    <p className="text-[11px] text-lion-cream/40 mt-1">
                      {kindLabel(experience.kind)} · {levelLabel(experience.level)} · {visibilityLabels[experience.visibility]}
                    </p>
                  </div>
                  {currentExperienceLabel(experience) && (
                    <span className={`max-w-32 shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${isVerifiedCurrentPosition(experience) ? "bg-lion-action text-lion-navyDeep" : "border border-lion-border text-lion-muted"}`}>{currentExperienceLabel(experience)}</span>
                  )}
                </div>

                {experience.note && <p className="text-xs text-lion-cream/55 mt-3 leading-relaxed">{experience.note}</p>}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                  <span className={`rounded-full border px-2 py-1 text-[10px] ${verificationClass(experience.verificationStatus)}`}>
                    {verificationLabels[experience.verificationStatus]}
                  </span>
                  <div className="flex gap-3 text-[11px]">
                    <button onClick={() => openEditForm(experience)} className="text-lion-gold">編輯</button>
                    <button onClick={() => handleRemove(experience)} className="text-red-300/80">刪除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
