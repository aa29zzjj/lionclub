"use client";

import { useState } from "react";

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

  async function preview() {
    setError("");
    setCommitResults(null);
    const parsedRows = parseCsv(csvText, organizations);
    const validRows = parsedRows.filter((row): row is { email: string; organizationId: string } => !row.error);
    const invalidRows = parsedRows.filter((row): row is PreviewRow => Boolean(row.error));

    if (validRows.length === 0) {
      setPreviewRows(invalidRows);
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
      if (!res.ok) {
        setError(data.error ?? "預覽失敗");
        return;
      }
      setPreviewRows([...invalidRows, ...(data.rows as PreviewRow[])]);
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    if (!previewRows || !reason.trim()) return;
    const okRows = previewRows.filter((row) => !row.error && row.memberId);
    if (okRows.length === 0) return;
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
        setError(data.error ?? "送出失敗");
        return;
      }
      setCommitResults(data.results as CommitResult[]);
      onCommitted();
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-lion-border bg-lion-card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
        批次匯入名單（CSV）
        <span className="text-xs text-lion-muted">{open ? "收合" : "展開"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-lion-muted">
            每行一筆，格式為 <code>email,分會名稱或分會ID</code>，例如 <code>demo@lions.tw,AI臺科大獅子會</code>。
            送出前會先顯示差異預覽，確認無誤才會實際異動。
          </p>
          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreviewRows(null);
              setCommitResults(null);
            }}
            rows={6}
            placeholder={"email,分會名稱\ndemo@lions.tw,AI臺科大獅子會"}
            className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-xs font-mono outline-none focus:border-lion-gold"
          />
          <button
            type="button"
            onClick={preview}
            disabled={previewing || !csvText.trim()}
            className="min-h-12 rounded-xl bg-white/10 px-4 text-sm font-medium disabled:opacity-50"
          >
            {previewing ? "預覽中…" : "預覽差異"}
          </button>

          {error && <p className="text-xs text-lion-danger">{error}</p>}

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
                  <label className="mb-1 mt-2 block text-xs text-lion-muted">分派／核對原因（必填，套用至本批次）</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    minLength={2}
                    maxLength={1000}
                    placeholder="請填寫名單來源或核對依據"
                    className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-sm outline-none focus:border-lion-gold"
                  />
                  <button
                    type="button"
                    onClick={commit}
                    disabled={committing || reason.trim().length < 2}
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
