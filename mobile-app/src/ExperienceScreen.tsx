import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type MemberExperience, type ExperienceInput } from "./contract";
import { experienceKindOptions, organizationLevelOptions, positionOptions, visibilityLabels, type ExperienceKind, type OrganizationLevel } from "../../src/lib/experience-data";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

const kindLabels = Object.fromEntries(experienceKindOptions.map((o) => [o.value, o.label])) as Record<ExperienceKind, string>;

function ExperienceForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: MemberExperience | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ExperienceKind>((initial?.kind as ExperienceKind) ?? "membership");
  const [level, setLevel] = useState<OrganizationLevel>((initial?.level as OrganizationLevel) ?? "club");
  const [positionCode, setPositionCode] = useState(initial?.positionCode ?? "");
  const [customPositionLabel, setCustomPositionLabel] = useState(kind === "other" ? initial?.positionName ?? "" : "");
  const [organizationName, setOrganizationName] = useState(initial?.organizationName ?? "");
  const [startYear, setStartYear] = useState(String(initial?.startYear ?? new Date().getFullYear()));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ? String(initial.startMonth) : "");
  const [endYear, setEndYear] = useState(initial?.endYear ? String(initial.endYear) : "");
  const [isCurrent, setIsCurrent] = useState(initial?.isCurrent ?? true);
  const [visibility, setVisibility] = useState<"public" | "members" | "only-me">((initial?.visibility as "public" | "members" | "only-me") ?? "members");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positionChoices = positionOptions.filter((p) => p.kind === kind);

  async function handleSubmit() {
    if (kind !== "membership" && !organizationName.trim()) {
      setError("請填寫分會／組織名稱");
      return;
    }
    const year = Number(startYear);
    if (!Number.isInteger(year) || year < 1917) {
      setError("請填寫正確的開始年度");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: ExperienceInput = {
        kind,
        level: kind === "membership" ? "club" : level,
        positionCode: kind === "membership" ? "membership_joined" : kind === "other" ? customPositionLabel.trim() || "other" : positionCode || positionChoices[0]?.code || "other",
        organizationName: organizationName.trim() || "中央獅子會",
        organizationIsUnlisted: true,
        startYear: year,
        startMonth: kind === "membership" && startMonth ? Number(startMonth) : undefined,
        endYear: kind !== "membership" && endYear ? Number(endYear) : undefined,
        datePrecision: "lions-year",
        isCurrent,
        visibility,
        note: note.trim() || undefined,
      };
      if (initial) await api.updateExperience(initial.id, input);
      else await api.createExperience(input);
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="compose-form">
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div>
        <label>類型</label>
        <div className="tag-row">
          {experienceKindOptions.map((o) => (
            <button key={o.value} type="button" className={kind === o.value ? "tag-chip active" : "tag-chip"} onClick={() => { setKind(o.value); setPositionCode(""); }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {kind !== "membership" ? (
        <div>
          <label>層級</label>
          <div className="tag-row">
            {organizationLevelOptions.map((o) => (
              <button key={o.value} type="button" className={level === o.value ? "tag-chip active" : "tag-chip"} onClick={() => setLevel(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {kind !== "membership" && kind !== "other" ? (
        <div>
          <label htmlFor="exp-position">職務／身分</label>
          <select id="exp-position" value={positionCode} onChange={(e) => setPositionCode(e.target.value)}>
            <option value="">請選擇</option>
            {positionChoices.map((p) => <option key={p.code} value={p.code}>{p.label}（{organizationLevelOptions.find((l) => l.value === p.level)?.label}）</option>)}
          </select>
        </div>
      ) : null}

      {kind === "other" ? (
        <div>
          <label htmlFor="exp-custom">請說明身分／職務</label>
          <input id="exp-custom" value={customPositionLabel} onChange={(e) => setCustomPositionLabel(e.target.value)} placeholder="例如：區服務計畫召集人" />
        </div>
      ) : null}

      <div>
        <label htmlFor="exp-org">{kind === "membership" ? "所屬分會" : "分會／組織名稱"}</label>
        <input id="exp-org" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="例如：中央獅子會" />
      </div>

      <div className="form-actions">
        <div style={{ flex: 1 }}>
          <label htmlFor="exp-year">開始年度</label>
          <input id="exp-year" type="number" value={startYear} onChange={(e) => setStartYear(e.target.value)} />
        </div>
        {kind === "membership" ? (
          <div style={{ flex: 1 }}>
            <label htmlFor="exp-month">月份（選填）</label>
            <input id="exp-month" type="number" min={1} max={12} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <label htmlFor="exp-end-year">結束年度（選填）</label>
            <input id="exp-end-year" type="number" value={endYear} onChange={(e) => setEndYear(e.target.value)} disabled={isCurrent} />
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
        <span>{kind === "membership" ? "目前仍具會籍" : "目前仍在職"}</span>
      </label>

      <div>
        <label>公開範圍</label>
        <div className="tag-row">
          {(Object.keys(visibilityLabels) as (keyof typeof visibilityLabels)[]).map((key) => (
            <button key={key} type="button" className={visibility === key ? "tag-chip active" : "tag-chip"} onClick={() => setVisibility(key)}>
              {visibilityLabels[key]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="exp-note">備註（選填）</label>
        <textarea id="exp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onClose} disabled={saving}>取消</button>
        <button type="button" className="primary" onClick={handleSubmit} disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
      </div>
    </div>
  );
}

export default function ExperienceScreen() {
  const [experiences, setExperiences] = useState<MemberExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberExperience | null | "new">(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setExperiences(await api.getMyExperiences());
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取資歷失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await api.deleteExperience(id);
      setExperiences((prev) => prev.filter((exp) => exp.id !== id));
      setToast("已刪除資歷");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "刪除失敗");
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <div>
        <h1 className="screen-title" style={{ marginBottom: "1rem" }}>{editing === "new" ? "新增資歷" : "編輯資歷"}</h1>
        <ExperienceForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setToast(editing === "new" ? "已新增資歷" : "已更新資歷"); void load(); }}
        />
      </div>
    );
  }

  if (loading) return <p className="member-meta">載入中…</p>;

  return (
    <div>
      <div className="screen-header">
        <h1 className="screen-title">獅子會資歷</h1>
        <button type="button" className="my-screen-edit-button" onClick={() => setEditing("new")}>＋ 新增</button>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="member-meta" style={{ margin: "0.75rem 0" }}>新增或編輯的資歷會先標示「審核中」，由分會幹部核實後才會顯示為已核實。</p>

      {experiences.length === 0 ? <p className="member-meta">尚未新增任何資歷紀錄。</p> : null}
      <div className="list-stack">
        {experiences.map((exp) => (
          <div key={exp.id} className="list-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="list-card-main">
              <p className="list-card-title">{exp.positionName}</p>
              <p className="list-card-meta">
                {exp.organizationName} · {kindLabels[exp.kind as ExperienceKind] ?? exp.kind} · {exp.startYear}
                {exp.endYear ? `–${exp.endYear}` : exp.isCurrent ? "–現在" : ""}
              </p>
              <p className="list-card-meta">
                {exp.verificationStatus === "verified" ? "✓ 已核實" : exp.verificationStatus === "rejected" ? "已退回" : "審核中"} · {visibilityLabels[exp.visibility as keyof typeof visibilityLabels] ?? exp.visibility}
              </p>
            </div>
            {exp.verificationStatus !== "verified" ? (
              <div className="list-card-actions" style={{ marginTop: "0.6rem" }}>
                <button type="button" className="secondary" onClick={() => setEditing(exp)}>編輯</button>
                <button type="button" className="secondary" disabled={busyId === exp.id} onClick={() => handleDelete(exp.id)}>刪除</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
