"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { useAppData } from "@/lib/store";
import { getClubDirectory, isClubInDistrictDirectory } from "@/lib/club-directory";
import {
  calculateLionYears,
  districtOptions,
  experienceKindOptions,
  ExperienceKind,
  ExperienceVisibility,
  formatLionsYear,
  MemberExperience,
  multipleDistrictOptions,
  organizationLevelOptions,
  OrganizationLevel,
  positionOptions,
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
  endYear: number;
  isCurrent: boolean;
  visibility: ExperienceVisibility;
  note: string;
};

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1949 }, (_, index) => currentYear - index);

const emptyDraft: ExperienceDraft = {
  kind: "position",
  level: "club",
  positionCode: "club_president",
  organizationName: "",
  multipleDistrictCode: "300A",
  districtCode: "300A-1",
  startYear: currentYear,
  endYear: currentYear,
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
  if (level === "md") return `MD${multipleDistrictCode}`;
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
  const { profile, experiences, addExperience, updateExperience, removeExperience } = useAppData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ExperienceDraft>(emptyDraft);
  const [useCustomOrganization, setUseCustomOrganization] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const sortedExperiences = useMemo(
    () => [...experiences].sort((a, b) => b.startYear - a.startYear || Number(b.isCurrent) - Number(a.isCurrent)),
    [experiences]
  );
  const lionYears = calculateLionYears(profile.joinYear);
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
      startYear: currentYear,
      endYear: currentYear,
      districtCode: districtOptions[emptyDraft.multipleDistrictCode][0],
    });
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
      endYear: experience.endYear ?? experience.startYear,
      isCurrent: experience.isCurrent,
      visibility: experience.visibility,
      note: experience.note ?? "",
    });
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
        level: "club",
        positionCode: "membership_joined",
        organizationName: profileClubIsListed ? profile.chapter : directory?.clubs[0] ?? profile.chapter,
      }));
      return;
    }
    const nextPosition = positionOptions.find((position) => position.kind === kind);
    setDraft((previous) => ({
      ...previous,
      kind,
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.isCurrent && draft.endYear < draft.startYear) {
      setError("結束年度不能早於開始年度");
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
      endYear: draft.kind === "membership" || draft.isCurrent ? undefined : draft.endYear,
      datePrecision: draft.kind === "membership" ? "approximate" : "lions-year",
      isCurrent: draft.isCurrent,
      verificationStatus: "under-review",
      visibility: draft.visibility,
      note: draft.note || undefined,
      isDemo: false,
    };

    if (editingId) {
      updateExperience(editingId, payload);
      setToast("資歷已更新並送交審核");
    } else {
      addExperience(payload);
      setToast("資歷已新增並送交審核");
    }
    closeForm();
    setTimeout(() => setToast(""), 2500);
  }

  function handleRemove(experience: MemberExperience) {
    if (!window.confirm(`確定刪除「${experience.positionName}」這筆資歷嗎？`)) return;
    removeExperience(experience.id);
    setToast("資歷已刪除");
    setTimeout(() => setToast(""), 2500);
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
            className="rounded-full bg-lion-gold text-lion-navyDeep px-3.5 py-2 text-xs font-semibold"
          >
            ＋ 新增資歷
          </button>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#19264a] via-lion-navyLight to-[#10172b] border border-lion-gold/25 p-5 mb-4 overflow-hidden relative">
          <div className="absolute -right-10 -top-12 w-32 h-32 rounded-full border border-lion-gold/10" />
          <p className="text-[10px] tracking-[0.24em] text-lion-gold mb-4">LIONS CLUB EXPERIENCE</p>
          <div className="flex items-center gap-3.5 relative">
            <Avatar name={profile.name} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={60} />
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{profile.name}</h1>
              <p className="text-xs text-lion-muted mt-0.5 truncate">{profile.chapter}</p>
              {profile.districtCode && (
                <p className="text-[10px] text-lion-gold/80 mt-1 truncate">
                  MD{profile.multipleDistrictCode} · {profile.districtCode} 區
                  {profile.regionName ? ` · ${profile.regionName}` : ""}
                  {profile.zoneName ? ` · ${profile.zoneName}` : ""}
                </p>
              )}
              <p className="text-xs text-lion-cream/70 mt-1">入會 {profile.joinYear} 年 · 獅齡 {lionYears ?? "—"} 年</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5">
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">{experiences.length}</p>
              <p className="text-[10px] text-lion-muted">資歷紀錄</p>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">
                {experiences.filter((experience) => experience.isCurrent && experience.kind !== "membership").length}
              </p>
              <p className="text-[10px] text-lion-muted">現任職務</p>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
              <p className="text-lg font-bold text-lion-gold">{verifiedCount}</p>
              <p className="text-[10px] text-lion-muted">已核實</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3.5 py-3 text-xs text-sky-200/90 leading-relaxed mb-5">
          目前為前端展示資料。本人新增的資歷預設為「待審核」；幹部職稱與系統管理權限分開，不會因填寫職稱而取得後台權限。
        </div>

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
                      <option key={option.value} value={option.value} className="text-black">{option.label}</option>
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
                    {availablePositions.length === 0 && <option value="" className="text-black">此層級暫無選項</option>}
                    {availablePositions.map((position) => (
                      <option key={position.code} value={position.code} className="text-black">{position.label}</option>
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
                    <option key={code} value={code} className="text-black">MD{code}</option>
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
                    <option key={code} value={code} className="text-black">{code} 區</option>
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
                  <option value="" className="text-black">請選擇分會</option>
                  {availableClubs.map((club) => (
                    <option key={club} value={club} className="text-black">{club}</option>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="experience-start-year" className="text-xs text-lion-muted mb-1 block">
                  {draft.kind === "membership" ? "加入年份" : "開始獅子年度"}
                </label>
                <select
                  id="experience-start-year"
                  value={draft.startYear}
                  onChange={(event) => setDraft((previous) => ({ ...previous, startYear: Number(event.target.value) }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year} className="text-black">
                      {draft.kind === "membership" ? year : `${year}–${year + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="experience-end-year" className="text-xs text-lion-muted mb-1 block">結束獅子年度</label>
                <select
                  id="experience-end-year"
                  value={draft.endYear}
                  disabled={draft.isCurrent || draft.kind === "membership"}
                  onChange={(event) => setDraft((previous) => ({ ...previous, endYear: Number(event.target.value) }))}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold disabled:opacity-40"
                >
                  {yearOptions.map((year) => <option key={year} value={year} className="text-black">{year}–{year + 1}</option>)}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isCurrent}
                onChange={(event) => setDraft((previous) => ({ ...previous, isCurrent: event.target.checked }))}
                className="accent-[#C8A951]"
              />
              {draft.kind === "membership" ? "目前仍保有此會籍" : "目前仍在任"}
            </label>

            <div>
              <label htmlFor="experience-visibility" className="text-xs text-lion-muted mb-1 block">對外可見性</label>
              <select
                id="experience-visibility"
                value={draft.visibility}
                onChange={(event) => setDraft((previous) => ({ ...previous, visibility: event.target.value as ExperienceVisibility }))}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
              >
                <option value="public" className="text-black">公開</option>
                <option value="members" className="text-black">會員可見</option>
                <option value="only-me" className="text-black">僅自己</option>
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
              <button type="submit" className="flex-1 rounded-xl bg-lion-gold py-2.5 text-sm font-semibold text-lion-navyDeep">儲存資歷</button>
            </div>
          </form>
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
                <span className="absolute -left-[22px] top-5 w-3 h-3 rounded-full bg-lion-gold border-[3px] border-lion-navyDeep" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex rounded-lg bg-[#173d78] px-2.5 py-1 text-xs font-medium text-lion-cream mb-2">
                      {formatLionsYear(experience)}
                    </p>
                    <h3 className="font-semibold">{experience.positionName}</h3>
                    <p className="text-xs text-lion-muted mt-1">{experience.organizationName}</p>
                    {experience.organizationIsUnlisted && (
                      <p className="text-[11px] text-amber-300/80 mt-1">組織待核 · 尚未命中目前分會名冊</p>
                    )}
                    <p className="text-[11px] text-lion-cream/40 mt-1">
                      {kindLabel(experience.kind)} · {levelLabel(experience.level)} · {visibilityLabels[experience.visibility]}
                    </p>
                  </div>
                  {experience.isCurrent && (
                    <span className="shrink-0 rounded-full bg-lion-gold text-lion-navyDeep px-2 py-1 text-[10px] font-semibold">現任</span>
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
