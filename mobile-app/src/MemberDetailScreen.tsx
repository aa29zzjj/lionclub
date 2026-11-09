import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type MemberDetail } from "./contract";
import Avatar from "./Avatar";
import { colorFromId } from "../../src/lib/avatar-color";
import { formatJoinDate, positionOptions, verificationLabels } from "../../src/lib/experience-data";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);
const REPORT_REASON_MAX_LENGTH = 200;

function positionName(experience: { kind: string; positionCode: string }) {
  if (experience.kind === "membership") return "加入獅子會";
  return positionOptions.find((p) => p.code === experience.positionCode)?.label ?? "其他職務";
}

export default function MemberDetailScreen({ memberId, onBack }: { memberId: string; onBack: () => void }) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const reportReasonTooLong = reportReason.length > REPORT_REASON_MAX_LENGTH;

  const load = useCallback(async () => {
    setError(null);
    try {
      setMember(await api.getMember(memberId));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "無法載入會員資料");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleBlock() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      if (member.blockedByMe) {
        await api.unblockMember(member.id);
        setMember({ ...member, blockedByMe: false });
        setToast("已取消封鎖");
      } else {
        await api.blockMember(member.id);
        setToast("已封鎖，即將返回");
        setTimeout(onBack, 1200);
      }
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "封鎖狀態更新失敗");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    if (!member || busy || reportReason.trim().length < 2) return;
    if (reportReasonTooLong) {
      setError("檢舉原因最多 200 字，請刪減後再送出。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reportMember(member.id, reportReason.trim());
      setShowReportForm(false);
      setReportReason("");
      setToast("已送出檢舉，感謝您的回報");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "檢舉送出失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="profile-back" onClick={onBack}>‹ 返回</button>

      {loading ? <p className="member-meta">載入中…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}

      {member ? (
        <>
          <div className="my-screen-card" style={{ flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.5rem" }}>
            <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={72} />
            <p className="member-name">{member.nickname || member.name}</p>
            {member.nickname ? <p className="member-meta">{member.name}</p> : null}
            <p className="member-meta">{member.organization?.name ?? "尚未分派分會"}</p>
            {member.title ? <p className="member-meta">自填職稱：{member.title}（不代表管理授權）</p> : null}
            <div className="member-card-facts" style={{ width: "100%", marginTop: "0.5rem" }}>
              <div><dt>會員編號</dt><dd>{member.memberNo || "—"}</dd></div>
              <div><dt>入會年度</dt><dd>{formatJoinDate(member.joinYear, member.joinMonth) ?? "—"}</dd></div>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="secondary" disabled={busy} onClick={toggleBlock}>
              {member.blockedByMe ? "取消封鎖" : "封鎖此會員"}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setShowReportForm((v) => !v)}>檢舉</button>
          </div>

          {showReportForm ? (
            <div className="my-screen-section">
              <label htmlFor="member-report-reason">檢舉原因</label>
              <textarea id="member-report-reason" rows={3} maxLength={REPORT_REASON_MAX_LENGTH} aria-describedby="member-report-reason-limit" aria-invalid={reportReasonTooLong || undefined} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="請簡述檢舉原因" />
              <p id="member-report-reason-limit" className={reportReasonTooLong ? "error" : "member-meta"}>
                請輸入 2 至 200 字。目前 {reportReason.length}／200 字。
              </p>
              <div className="form-actions" style={{ marginTop: "0.5rem" }}>
                <button type="button" className="secondary" disabled={busy} onClick={() => setShowReportForm(false)}>取消</button>
                <button type="button" className="primary" disabled={busy || reportReason.trim().length < 2 || reportReasonTooLong} onClick={submitReport}>送出檢舉</button>
              </div>
            </div>
          ) : null}

          {member.tags.length > 0 ? (
            <section className="my-screen-section">
              <h2 className="section-title">專長／興趣</h2>
              <div className="tag-row">
                {member.tags.map((tag) => <span key={tag.id} className="tag-chip">#{tag.name}</span>)}
              </div>
            </section>
          ) : null}

          {member.bio ? (
            <section className="my-screen-section">
              <h2 className="section-title">關於我</h2>
              <p className="profile-bio">{member.bio}</p>
            </section>
          ) : null}

          <section className="my-screen-section">
            <h2 className="section-title">獅子會資歷</h2>
            {member.experiences.length === 0 ? (
              <p className="member-meta">對方尚未公開資歷資料</p>
            ) : (
              <div className="list-stack">
                {member.experiences.map((exp) => (
                  <div key={exp.id} className="list-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div className="list-card-main">
                      <p className="list-card-title">{positionName(exp)}</p>
                      <p className="list-card-meta">{exp.organizationName} · {exp.startYear}{exp.endYear ? `–${exp.endYear}` : exp.isCurrent ? "–現在" : ""}</p>
                      <p className="list-card-meta">{verificationLabels[exp.verificationStatus as keyof typeof verificationLabels] ?? exp.verificationStatus}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
