"use client";

import { useRef, useState } from "react";

type Organization = { id: string; name: string; districtCode?: string | null };

type PreviewRow = {
  email: string;
  organizationId: string;
  error?: string;
  memberId?: string;
  memberName?: string;
  currentOrganizationId?: string;
  currentOrganizationName?: string;
  targetOrganizationName?: string;
  expectedAssignmentVersion?: number;
};

type CommitResult = { memberId: string; ok: boolean; error?: string; organization?: { name: string } };

function parseCsv(text: string, organizations: Organization[]) {
  const byName = new Map(organizations.map((org) => [org.name.trim().toLowerCase(), org.id]));
  const byId = new Set(organizations.map((org) => org.id));

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^email\s*,/i.test(line))
    .map((line) => {
      const [emailRaw, orgRaw] = line.split(",").map((part) => part?.trim() ?? "");
      const email = emailRaw ?? "";
      const orgKey = orgRaw ?? "";
      const organizationId = byId.has(orgKey) ? orgKey : byName.get(orgKey.toLowerCase());
      if (!email || !organizationId) {
        return { email: email || "(空白)", organizationId: "", error: !email ? "缺少 Email" : "找不到符合的分會名稱或 ID" };
      }
      return { email, organizationId };
    });
}

export default function BulkAssignmentImport({
  organizations,
  onCommitted,
}: {
  organizations: Organization[];
  onCommitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [reason, setReason] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResults, setCommitResults] = useState<CommitResult[] | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const pending = previewing || committing;

  async function preview() {
    if (busyRef.current) return;
    busyRef.current = true;
    const requestId = ++requestRef.current;
    const snapshot = csvText;
    setError("");
    setPreviewRows(null); setPreviewSnapshot(null); setConfirmed(false);
    setCommitResults(null);
    const parsedRows = parseCsv(csvText, organizations);
    const validRows = parsedRows.filter((row): row is { email: string; organizationId: string } => !row.error);
    const invalidRows = parsedRows.filter((row): row is PreviewRow => Boolean(row.error));

    if (validRows.length === 0) {
      setPreviewRows(invalidRows);
      busyRef.current = false;
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/member-assignments/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await res.json();
      if (requestId !== requestRef.current) return;
      if (!res.ok) {
        setError(data.error ?? "預覽失敗");
        return;
      }
      setPreviewRows([...invalidRows, ...(data.rows as PreviewRow[])]);
      setPreviewSnapshot(snapshot);
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setPreviewing(false);
      busyRef.current = false;
    }
  }

  async function commit() {
    if (busyRef.current || !previewRows || reason.trim().length < 2 || !confirmed) return;
    if (previewSnapshot !== csvText) { setError("名單已改變，請重新預覽後再確認"); setPreviewRows(null); return; }
    const okRows = previewRows.filter((row) => !row.error && row.memberId);
    if (okRows.length === 0) return;
    busyRef.current = true;
    setCommitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/member-assignments/bulk/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: okRows.map((row) => ({
            memberId: row.memberId,
            organizationId: row.organizationId,
            expectedOrganizationId: row.currentOrganizationId,
            expectedAssignmentVersion: row.expectedAssignmentVersion ?? 0,
            reason: reason.trim(),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`${data.error ?? "送出失敗"}，請重新預覽目前資料後再確認`);
        setPreviewRows(null); setConfirmed(false);
        return;
      }
      setCommitResults(data.results as CommitResult[]);
      onCommitted();
    } catch {
      setError("連線中斷，部分資料可能已完成。請重新預覽確認目前分會後再送出，不要直接重送原批次。");
      setPreviewRows(null); setConfirmed(false);
    } finally {
      setCommitting(false);
      busyRef.current = false;
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-lion-border bg-lion-card p-4">
      <button type="button" disabled={pending} onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between text-base font-semibold disabled:opacity-50">
        批次匯入名單（CSV）
        <span className="text-xs text-lion-muted">{open ? "收合" : "展開"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-lion-muted">
            每行一筆，格式為 <code>email,分會名稱或分會ID</code>，例如 <code>demo@lions.tw,AI臺科大獅子會</code>。
            送出前會先顯示差異預覽，確認無誤才會實際異動。
          </p>
          <label htmlFor="bulk-assignment-csv" className="block text-sm font-medium">貼上待核對名單</label>
          <textarea
            id="bulk-assignment-csv"
            disabled={pending}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              requestRef.current += 1;
              setPreviewRows(null);
              setCommitResults(null);
              setPreviewSnapshot(null); setConfirmed(false);
            }}
            rows={6}
            placeholder={"email,分會名稱\ndemo@lions.tw,AI臺科大獅子會"}
            className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-xs font-mono outline-none focus:border-lion-gold"
          />
          <button
            type="button"
            onClick={preview}
            disabled={pending || !csvText.trim()}
            className="min-h-12 rounded-xl bg-white/10 px-4 text-sm font-medium disabled:opacity-50"
          >
            {previewing ? "預覽中…" : "預覽差異"}
          </button>

          {error && <p role="alert" className="text-base text-lion-danger">{error}</p>}

          {previewRows && (
            <div className="space-y-2">
              <p className="text-xs text-lion-muted">
                共 {previewRows.length} 筆，可異動 {previewRows.filter((r) => !r.error).length} 筆，
                有問題 {previewRows.filter((r) => r.error).length} 筆
              </p>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {previewRows.map((row, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-2.5 text-xs ${row.error ? "border-red-400/30 bg-red-500/5" : "border-lion-border bg-lion-page"}`}
                  >
                    <p className="font-medium">{row.email}</p>
                    {row.error ? (
                      <p className="mt-1 text-red-300">{row.error}</p>
                    ) : (
                      <p className="mt-1 text-lion-muted">
                        {row.currentOrganizationName} → {row.targetOrganizationName}
                      </p>
                    )}
                    {commitResults && (
                      <p className={`mt-1 ${commitResults.find((r) => r.memberId === row.memberId)?.ok ? "text-emerald-300" : "text-red-300"}`}>
                        {commitResults.find((r) => r.memberId === row.memberId)?.ok
                          ? "已完成"
                          : commitResults.find((r) => r.memberId === row.memberId)?.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {previewRows.some((r) => !r.error) && !commitResults && (
                <>
                  <p className="rounded-xl border border-lion-border bg-lion-soft p-3 text-sm leading-relaxed">跨分會會停用會員來源分會的幹部權限與其發出的邀請；新分會不自動授權。區級／全域獨立角色需另核對，歷史資歷、好友、活動及報名不搬移。</p>
                  <label htmlFor="bulk-assignment-reason" className="mb-1 mt-2 block text-sm text-lion-muted">分派／核對原因（必填，套用至本批次）</label>
                  <textarea
                    id="bulk-assignment-reason"
                    disabled={pending}
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setConfirmed(false); }}
                    rows={2}
                    minLength={2}
                    maxLength={1000}
                    placeholder="請填寫名單來源或核對依據"
                    className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                  />
                  <label className="flex min-h-12 items-start gap-3 rounded-xl border border-lion-border p-3 text-sm leading-relaxed"><input type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><span>我已逐筆核對這份預覽與正式名單，了解跨會將停用舊分會權限／邀請，確認只送出可異動項目。</span></label>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={pending || !confirmed || reason.trim().length < 2 || previewSnapshot !== csvText}
                    className="min-h-12 w-full rounded-xl bg-lion-action px-3 py-2.5 text-sm font-semibold text-lion-navyDeep disabled:opacity-50"
                  >
                    {committing ? "送出中…" : `確認送出 ${previewRows.filter((r) => !r.error).length} 筆`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
