"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { currentServiceYear, localDate, parseServiceAction, type ServiceHubData } from "../lib/service-contract";
import { ServiceClientError, type ServiceTransport } from "../lib/service-client";

type Field = { name: string; label: string; type?: "text" | "textarea" | "date" | "datetime-local" | "number" | "select"; optional?: boolean; options?: [string, string][]; min?: number; max?: number; step?: string; maxLength?: number };
type Draft = { title: string; detail?: string; action: string; fixed: Record<string, unknown>; fields: Field[]; values: Record<string, string> };
type Export = { filename: string; content: string };
type Entry = ServiceHubData["entries"][number];
const statusLabels: Record<string, string> = { OPEN: "開放回應", RESPONDED: "等待接受", MATCHED: "已媒合", COMPLETED: "已完成", CLOSED: "已關閉", PENDING: "待確認", CONFIRMED: "已確認", REJECTED: "已退回", REVOKED: "已撤回確認", ACCEPTED: "已接受", NOT_SELECTED: "本次未選擇" };
const textField = (name: string, label: string, maxLength = 120): Field => ({ name, label, maxLength });
const noteField = (name: string, label: string, optional = false): Field => ({ name, label, type: "textarea", optional, maxLength: 1000 });
const hoursField: Field = { name: "hours", label: "服務時數（小時）", type: "number", min: 0.25, max: 16, step: "0.25" };
const dayField: Field = { name: "date", label: "服務日期", type: "date" };
function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join(""); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function taipeiInput(iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (name: string) => p.find(x => x.type === name)?.value;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}
export function serviceDraftPayload(draft: Draft) {
  const values: Record<string, unknown> = { ...draft.values };
  for (const field of draft.fields) if (field.type === "number") {
    const v = draft.values[field.name]?.trim();
    if (!v && !field.optional) throw new ServiceClientError(`請填寫${field.label}`);
    values[field.name] = v ? Number(v) : null;
  }
  if ("hours" in values) { values.minutes = Number(values.hours) * 60; delete values.hours; }
  if ("totalHours" in values) { values.totalServiceMinutes = Number(values.totalHours) * 60; delete values.totalHours; }
  if (draft.action === "outcome.save") values.endAt = `${values.endAt}:00+08:00`;
  return parseServiceAction({ ...values, ...draft.fixed, action: draft.action });
}
export async function downloadServiceFile(file: Export) {
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = file.filename; document.body.append(link); link.click(); link.remove();
  // Give the browser time to consume its own Blob; this timer never sends data.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function ServiceHub({ transport, onExport = downloadServiceFile, renderTerms }: {
  transport: ServiceTransport; onExport?: (file: Export) => Promise<void>; renderTerms?: (done: () => void) => ReactNode;
}) {
  const [tab, setTab] = useState<"needs" | "events" | "passport" | "review">("needs");
  const [year, setYear] = useState(currentServiceYear());
  const [yearInput, setYearInput] = useState(() => String(currentServiceYear()));
  const [reviewStatus, setReviewStatus] = useState("PENDING");
  const [mine, setMine] = useState(false);
  const [data, setData] = useState<ServiceHubData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [exported, setExported] = useState<Export | null>(null);
  const [needsTerms, setNeedsTerms] = useState(false);
  const active = useRef(false), generation = useRef(0), lock = useRef(false), root = useRef<HTMLDivElement>(null);
  const current = useCallback(() => active.current && transport.isCurrent(), [transport]);
  const query = useCallback(() => new URLSearchParams({ year: String(year), reviewStatus, ...(mine ? { mine: "true" } : {}) }), [year, reviewStatus, mine]);
  const fail = useCallback((failure: unknown, fallback: string) => {
    if (!active.current) return;
    if (!transport.isCurrent() || failure instanceof ServiceClientError && failure.code === "SESSION_CHANGED") { setData(null); setDraft(null); setExported(null); setError("登入帳號已切換，請返回首頁重新確認。"); return; }
    setError(failure instanceof ServiceClientError ? failure.message : fallback);
    if (failure instanceof ServiceClientError && failure.code === "TERMS_REQUIRED") setNeedsTerms(true);
  }, [transport]);
  const load = useCallback(async (page?: { name: string; cursor: string }) => {
    if (!current() || lock.current) return;
    const attempt = ++generation.current;
    setLoading(true); setError("");
    const params = query(); if (page) params.set(page.name, page.cursor);
    try { const value = await transport.read(params.toString()); if (current() && attempt === generation.current) setData(value); }
    catch (failure) { if (attempt === generation.current) fail(failure, "服務資料讀取未完成，請重新載入。"); }
    finally { if (active.current && attempt === generation.current) setLoading(false); }
  }, [current, fail, query, transport]);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++; }; }, []);
  useEffect(() => { setData(null); void load(); }, [load]);
  useLayoutEffect(() => { const container = root.current?.closest(".shell-content"); if (container) container.scrollTo(0, 0); else window.scrollTo(0, 0); }, [tab, draft?.title, draft?.action, exported?.filename]);

  useLayoutEffect(() => { if (error) { const container = root.current?.closest(".shell-content"); if (container) container.scrollTo(0, 0); else window.scrollTo(0, 0); } }, [error]);

  function open(value: Draft) { if (!current() || lock.current) return; setDraft(value); setExported(null); setError(""); setNotice(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || !current() || lock.current || loading || needsTerms) return;
    let body; try { body = serviceDraftPayload(draft); } catch (failure) { setError(failure instanceof Error ? failure.message : "請確認欄位內容"); return; }
    lock.current = true; setBusy(true); setError(""); setNotice(""); let saved = false;
    try { await transport.mutate(body); saved = true; if (current()) { setDraft(null); setNotice("已儲存，正在更新列表。"); } }
    catch (failure) { fail(failure, "儲存結果尚未確認，請先重新載入核對，草稿仍保留。"); }
    finally { lock.current = false; if (active.current) setBusy(false); }
    if (saved && current()) await load();
  }
  async function previewExport(params: URLSearchParams) {
    if (!current() || lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const file = await transport.export(params.toString()); if (current()) { setExported(file); setDraft(null); } }
    catch (failure) { fail(failure, "履歷或成果匯出未完成，請稍後再試。"); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function saveExport() {
    if (!exported || !current() || lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await onExport(exported); if (current()) setNotice("匯出操作已交給裝置，請依系統畫面選擇儲存或分享。預覽內容仍保留。"); }
    catch { if (current()) setError("裝置匯出尚未完成，預覽仍保留。請重試或選取文字自行複製。"); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const disabled = busy || loading;
  const more = (section: "needs" | "entries" | "events" | "review") => data?.nextCursors[section] ? <button type="button" disabled={disabled} onClick={() => void load({ name: `${section}Cursor`, cursor: data.nextCursors[section]! })}>下一頁</button> : null;
  const entryForm = (entry?: Entry, event?: ServiceHubData["events"][number]) => open({ title: entry ? "編輯並重新提交服務紀錄" : "補登服務紀錄", detail: "本人填寫的服務一律先列待確認，經有組織授權的幹部核對後，才計入已確認時數。", action: entry ? "entry.update" : "entry.create", fixed: entry ? { id: entry.id, version: entry.version } : { requestId: requestId(), eventId: event?.id ?? null }, fields: [textField("title", "服務名稱"), dayField, textField("category", "服務類別", 40), hoursField, noteField("note", "補充說明（選填）", true)], values: { title: entry?.title ?? event?.title ?? "", date: entry?.date ?? (event ? localDate(new Date(event.startAt)) : localDate(new Date())), category: entry?.category ?? "", hours: entry ? String(entry.minutes / 60) : "", note: entry?.note ?? "" } });
  const reviewForm = (entry: Entry, decision: "CONFIRMED" | "REJECTED" | "REVOKED") => open({ title: decision === "CONFIRMED" ? "確認服務紀錄" : decision === "REJECTED" ? "退回服務紀錄" : "撤回服務確認", detail: `${entry.memberName}｜${entry.organizationName}｜${entry.date}｜${entry.title}｜${entry.minutes / 60} 小時`, action: decision === "REVOKED" ? "entry.revoke" : "entry.review", fixed: { id: entry.id, version: entry.version, ...(decision !== "REVOKED" ? { decision } : {}) }, fields: [noteField("reason", decision === "CONFIRMED" ? "核對說明（選填）" : "請說明退回或撤回原因", decision === "CONFIRMED")], values: { reason: "" } });
  const entryCard = (entry: Entry, reviewing = false) => <article className="sh-card" key={entry.id}>
    <div className="sh-row"><h3>{entry.title}</h3><span className={`sh-badge sh-${entry.status.toLowerCase()}`}>{statusLabels[entry.status]}</span></div>
    <p>{reviewing ? `${entry.memberName}｜${entry.organizationName}｜` : ""}{entry.date} · {entry.category} · {entry.minutes / 60} 小時</p>
    {entry.note && <p className="sh-prewrap">{entry.note}</p>}{entry.reviewReason && <p className="sh-muted">核對說明：{entry.reviewReason}</p>}
    <div className="sh-actions">{reviewing && entry.status === "PENDING" ? <><button disabled={disabled} onClick={() => reviewForm(entry, "CONFIRMED")}>確認紀錄</button><button disabled={disabled} onClick={() => reviewForm(entry, "REJECTED")}>退回補充</button></> : reviewing && entry.status === "CONFIRMED" ? <button disabled={disabled} onClick={() => reviewForm(entry, "REVOKED")}>撤回確認</button> : !reviewing && !entry.eventId && entry.status !== "CONFIRMED" ? <button disabled={disabled} onClick={() => entryForm(entry)}>編輯／補充</button> : null}</div>
  </article>;

  return <div className="service-hub" ref={root} aria-busy={disabled}>
    <header className="sh-header"><div><p className="sh-eyebrow">LIONCLUBS · 一起讓服務發生</p><h1>服務中心</h1></div><button type="button" disabled={disabled} onClick={() => { setNotice(""); void load(); }}>重新載入</button></header>
    {loading && <p role="status" className="sh-muted">正在讀取服務資料…</p>}
    {error && <p role="alert" className="sh-error">{error}</p>}{notice && <p role="status" className="sh-notice">{notice}</p>}
    {needsTerms && renderTerms ? <section className="sh-card">{renderTerms(() => { setNeedsTerms(false); setError(""); setNotice("條款已確認，請再次核對並儲存草稿。"); })}</section> : null}
    {draft ? <form className="sh-card sh-form" onSubmit={event => void submit(event)}>
      <h2>{draft.title}</h2>{draft.detail && <p className="sh-muted">{draft.detail}</p>}
      {draft.fields.map(field => <label key={field.name}><span>{field.label}</span>{field.type === "textarea" ? <textarea rows={4} required={!field.optional} maxLength={field.maxLength ?? 1000} value={draft.values[field.name] ?? ""} disabled={busy} onChange={e => setDraft({ ...draft, values: { ...draft.values, [field.name]: e.target.value } })} /> : field.type === "select" ? <select required={!field.optional} value={draft.values[field.name] ?? ""} disabled={busy} onChange={e => setDraft({ ...draft, values: { ...draft.values, [field.name]: e.target.value } })}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : <input type={field.type ?? "text"} required={!field.optional} value={draft.values[field.name] ?? ""} disabled={busy} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength} onChange={e => setDraft({ ...draft, values: { ...draft.values, [field.name]: e.target.value } })} />}</label>)}
      <div className="sh-actions"><button className="sh-primary" type="submit" disabled={disabled || needsTerms}>{busy ? "處理中…" : "確認儲存"}</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>取消並返回列表</button></div>
      <p className="sh-muted">若資料已更新，請先關閉此編輯並重新載入，再從最新紀錄操作。</p>
    </form> : exported ? <section className="sh-card"><h2>預覽匯出內容</h2><p className="sh-muted">分享前請確認內容。這是平台紀錄摘要，不是官方核定證書。</p><textarea className="sh-export" aria-label="匯出內容" readOnly value={exported.content} rows={18} /><div className="sh-actions"><button className="sh-primary" disabled={busy} onClick={() => void saveExport()}>儲存／分享</button><button disabled={busy} onClick={() => { setExported(null); setError(""); }}>返回列表</button></div></section> : <>
      <nav aria-label="服務功能" className="sh-tabs">{[["needs", "資源媒合"], ["events", "活動成果"], ["passport", "服務護照"], ...(data?.canReview ? [["review", "幹部核實"]] : [])].map(([value, label]) => <button type="button" key={value} aria-current={tab === value ? "page" : undefined} className={tab === value ? "sh-selected" : ""} onClick={() => { setTab(value as typeof tab); setError(""); setNotice(""); }}>{label}</button>)}</nav>
      {data && tab !== "needs" ? <label className="sh-year">獅年起始年<input aria-label="獅年起始年" type="number" min={1900} max={2200} value={yearInput} disabled={busy} onChange={e => { setYearInput(e.target.value); const y = Number(e.target.value); if (Number.isInteger(y) && y >= 1900 && y <= 2200) setYear(y); }} onBlur={() => { if (Number(yearInput) !== year) setYearInput(String(year)); }} /><span>{year} 年 7 月至 {year + 1} 年 6 月</span></label> : null}
      {!data && !loading ? <div className="sh-empty">服務資料尚未讀取完成。<button type="button" onClick={() => void load()}>重試讀取</button></div> : null}
      {data && tab === "needs" ? <>
        <div className="sh-row"><p className="sh-muted">發布需求或提供資源，雙方確認後再合作。</p><button className="sh-primary" disabled={disabled} onClick={() => open({ title: "發布資源／需求", detail: "請填寫服務合作需要的資訊。聯絡方式不會由系統自動交換，請避免公開敏感資料。", action: "need.create", fixed: { requestId: requestId() }, fields: [{ name: "kind", label: "發布類型", type: "select", options: [["NEED", "我需要協助"], ["OFFER", "我能提供資源"]] }, textField("title", "標題"), textField("category", "資源類別", 40), noteField("description", "需求與可合作的內容"), { name: "targetDate", label: "預計日期", type: "date" }, { name: "quantity", label: "數量", type: "number", min: 1, max: 10000, step: "1" }, textField("quantityUnit", "單位（例如：位、處、趟）", 12)], values: { kind: "NEED", title: "", category: "", description: "", targetDate: localDate(new Date()), quantity: "1", quantityUnit: "" } })}>＋ 發布</button></div>
        <label className="sh-check"><input type="checkbox" checked={mine} disabled={disabled} onChange={e => setMine(e.target.checked)} />只看我發布的內容</label>
        {data.needs.length === 0 ? <p className="sh-empty">目前沒有符合的資源／需求。</p> : data.needs.map(need => <article className="sh-card" key={need.id}>
          <div className="sh-row"><span className="sh-kicker">{need.kind === "NEED" ? "需要協助" : "提供資源"} · {need.category}</span><span className="sh-badge">{statusLabels[need.status]}</span></div><h2>{need.title}</h2><p className="sh-muted">{need.owner.name} · {need.owner.organizationName}</p><p className="sh-prewrap">{need.description}</p><p>{need.targetDate} · {need.quantity} {need.quantityUnit}</p>{need.completionNote && <p className="sh-muted">處理說明：{need.completionNote}</p>}
          {need.myResponse && <p className="sh-notice">我的回應：{statusLabels[need.myResponse.status]} · {need.myResponse.message}</p>}
          {need.canManage && need.responses.length ? <section aria-label="管理回應" className="sh-replies"><h3>合作回應</h3>{need.responses.map(response => <div key={response.id}><strong>{response.member.name}</strong><p>{response.message}</p><span className="sh-muted">{statusLabels[response.status]}</span>{need.status === "RESPONDED" && response.status === "PENDING" ? <button disabled={disabled} onClick={() => open({ title: "確認接受這個合作回應", detail: `${response.member.name}：${response.message}`, action: "need.accept", fixed: { id: need.id, responseId: response.id, version: need.version }, fields: [], values: {} })}>接受回應</button> : null}</div>)}</section> : null}
          <div className="sh-actions">{need.canRespond && <button disabled={disabled} onClick={() => open({ title: "回應合作", detail: need.title, action: "need.respond", fixed: { id: need.id }, fields: [noteField("message", "可以如何協助／合作")], values: { message: "" } })}>我來回應</button>}{need.canManage && need.status === "MATCHED" ? <button disabled={disabled} onClick={() => open({ title: "確認合作已完成", detail: need.title, action: "need.complete", fixed: { id: need.id, version: need.version }, fields: [noteField("note", "完成說明（選填）", true)], values: { note: "" } })}>確認完成</button> : null}{need.canManage && ["OPEN", "RESPONDED", "MATCHED"].includes(need.status) ? <button disabled={disabled} onClick={() => open({ title: "關閉這個需求", detail: "關閉後保留合作紀錄，停止新回應。", action: "need.close", fixed: { id: need.id, version: need.version }, fields: [noteField("reason", "關閉原因")], values: { reason: "" } })}>關閉需求</button> : null}{need.owner.id !== data.viewerId ? <button disabled={disabled} onClick={() => open({ title: "檢舉資源內容", detail: "交由具權限的管理者依現行檢舉流程處理。", action: "need.report", fixed: { id: need.id }, fields: [noteField("reason", "檢舉原因")], values: { reason: "" } })}>檢舉</button> : null}</div>
        </article>)}{more("needs")}
      </> : null}
      {data && tab === "events" ? <><p className="sh-muted">帶出實際報名／報到統計，由主辦補充成果。團體時數與個人服務時數分開記錄。</p>{!data.events.length && <p className="sh-empty">這個獅年尚無活動。</p>}{data.events.map(event => <article key={event.id} className="sh-card"><h2>{event.title}</h2><p>{localDate(new Date(event.startAt))} · {event.location}</p><p className="sh-muted">報名 {event.registeredCount} 人 · 實際報到 {event.checkedInCount} 人</p>{event.outcome ? <><p className="sh-prewrap">{event.outcome.summary}</p><p>主辦自填受益估計：{event.outcome.beneficiaryCount ?? "未估計"} · 團體服務 {event.outcome.totalServiceMinutes / 60} 小時</p></> : <p className="sh-muted">主辦尚未完成成果草稿。</p>}<div className="sh-actions">{event.canManage ? <button disabled={disabled} onClick={() => open({ title: "整理活動成果", detail: `${event.title}｜實際報到 ${event.checkedInCount} 人。結束後才能儲存，總時數依實際報到與活動時間檢查。`, action: "outcome.save", fixed: { eventId: event.id, version: event.outcome?.version ?? 0 }, fields: [{ name: "endAt", label: "活動結束時間（台灣）", type: "datetime-local" }, { name: "beneficiaryCount", label: "受益人數估計（可留空）", type: "number", optional: true, min: 0, max: 1000000, step: "1" }, { name: "quantity", label: "服務數量", type: "number", min: 0, max: 1000000, step: "1" }, textField("quantityUnit", "服務數量單位", 12), { name: "totalHours", label: "團體總服務時數（主辦填寫）", type: "number", min: 0, step: "0.25" }, { ...noteField("summary", "成果摘要"), maxLength: 3000 }], values: { endAt: event.outcome ? taipeiInput(event.outcome.endAt) : "", beneficiaryCount: event.outcome?.beneficiaryCount === null || !event.outcome ? "" : String(event.outcome.beneficiaryCount), quantity: event.outcome ? String(event.outcome.quantity) : "", quantityUnit: event.outcome?.quantityUnit ?? "", totalHours: event.outcome ? String(event.outcome.totalServiceMinutes / 60) : "", summary: event.outcome?.summary ?? "" } })}>整理／編輯成果</button> : null}{event.outcome ? <button disabled={disabled} onClick={() => void previewExport(new URLSearchParams({ view: "outcome-export", id: event.id, year: String(year) }))}>預覽成果包</button> : null}{event.canLinkService ? <button disabled={disabled} onClick={() => entryForm(undefined, event)}>補登此活動的個人服務</button> : null}</div></article>)}{more("events")}</> : null}
      {data && tab === "passport" ? <><div className="sh-stats"><div><strong>{data.totals.confirmedMinutes / 60}</strong><span>已確認小時</span></div><div><strong>{data.totals.pendingMinutes / 60}</strong><span>待確認小時</span></div><div><strong>{data.totals.confirmedCount}</strong><span>已確認服務</span></div></div><p className="sh-muted">待確認、退回及撤回的紀錄不列入已確認時數。任職資歷仍由原有資歷功能管理，履歷匯出會分段列出。</p><div className="sh-actions"><button className="sh-primary" disabled={disabled} onClick={() => entryForm()}>＋ 補登服務</button><button disabled={disabled} onClick={() => void previewExport(new URLSearchParams({ view: "passport-export", year: String(year) }))}>產生我的履歷摘要</button></div>{!data.entries.length && <p className="sh-empty">這個獅年尚無服務紀錄。</p>}{data.entries.map(e => entryCard(e))}{more("entries")}</> : null}
      {data && tab === "review" && data.canReview ? <><p className="sh-muted">僅列出您具有有效組織授權的服務紀錄；本人紀錄須由其他有權限的幹部核對。</p><label className="sh-year">核實狀態<select value={reviewStatus} disabled={disabled} onChange={e => setReviewStatus(e.target.value)}>{["PENDING", "CONFIRMED", "REJECTED", "REVOKED"].map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>{!data.reviewEntries.length && <p className="sh-empty">這個獅年沒有符合的服務紀錄。</p>}{data.reviewEntries.map(e => entryCard(e, true))}{more("review")}</> : null}
    </>}
  </div>;
}
