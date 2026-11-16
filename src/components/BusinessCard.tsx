"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { prepareBusinessCard, recognizeBusinessCard } from "../lib/business-card-image";
import { NextPhaseError, type NextPhaseTransport } from "../lib/next-phase-client";
import { nextPhaseAction, type BusinessCardData, type NextPhaseAction } from "../lib/next-phase-contract";
import { inferProfessionalTags, professionalTags } from "../lib/professional-tags";

type Props = { assetPath?: string; send: NextPhaseTransport; renderTerms: (done: () => void) => ReactNode };

export default function BusinessCard({ send, renderTerms, assetPath = "/card-ocr/" }: Props) {
  const [card, setCard] = useState<BusinessCardData | null>(null);
  const [draft, setDraft] = useState<BusinessCardData>({ image: "", tags: [], shareTags: false });
  const [suggested, setSuggested] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [terms, setTerms] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [working, setWorking] = useState<"scan" | "save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const operation = useRef(0);
  const busy = working !== null;

  const load = useCallback(async () => {
    const current = ++operation.current;
    setStatus("loading"); setError("");
    try {
      const { card } = await send<{ card: BusinessCardData | null }>({ view: "card" });
      if (current !== operation.current) return;
      setCard(card);
      setDraft({ image: "", tags: card?.tags ?? [], shareTags: card?.shareTags ?? false });
      setStatus("ready");
    } catch (failure) {
      if (current !== operation.current) return;
      setStatus("failed");
      setError(failure instanceof Error ? failure.message : "讀取名片失敗");
    }
  }, [send]);

  useEffect(() => { void load(); return () => { operation.current++; }; }, [load]);

  async function select(file: File) {
    const current = ++operation.current;
    setWorking("scan"); setError(""); setNotice(""); setSuggested([]);
    try {
      const image = await prepareBusinessCard(file);
      if (current !== operation.current) return;
      setDraft(previous => ({ ...previous, image: image.base64 }));
      try {
        const tags = inferProfessionalTags(await recognizeBusinessCard(image.dataUrl, assetPath));
        if (current !== operation.current) return;
        setSuggested(tags);
        setDraft(previous => ({ ...previous, tags: [...new Set([...previous.tags, ...tags])].slice(0, 8) }));
        setNotice(tags.length ? "已選取辨識到的標籤，請確認後儲存。" : "沒有辨識到專長關鍵字。你可以自行選擇或新增標籤。");
      } catch {
        if (current === operation.current) setNotice("目前無法自動辨識，可以手動選擇標籤。");
      }
    } catch (failure) {
      if (current === operation.current) setError(failure instanceof Error ? failure.message : "讀取照片失敗");
    } finally { if (current === operation.current) setWorking(null); }
  }

  async function mutate(action: NextPhaseAction) {
    if (busy) return;
    const current = ++operation.current;
    setWorking(action.action === "card.delete" ? "delete" : "save");
    setError(""); setNotice("");
    try {
      await send(action);
      if (current !== operation.current) return;
      const updated = action.action === "card.save" ? {
        image: action.image ?? card?.image ?? "",
        tags: [...new Set(action.tags)], shareTags: action.shareTags && action.tags.length > 0,
      } : null;
      setCard(updated);
      setDraft({ image: "", tags: updated?.tags ?? [], shareTags: updated?.shareTags ?? false });
      setSuggested([]); setCustom(""); setConfirmDelete(false);
      setNotice(updated ? "名片與標籤已儲存。" : "名片與標籤已移除。");
    } catch (failure) {
      if (current !== operation.current) return;
      if (failure instanceof NextPhaseError && failure.code === "TERMS_REQUIRED") setTerms(true);
      setError(failure instanceof Error ? failure.message : "儲存失敗");
    } finally { if (current === operation.current) setWorking(null); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = nextPhaseAction.safeParse({ action: "card.save", image: draft.image || undefined, tags: draft.tags, shareTags: draft.shareTags });
    if (!action.success) { setError("請確認標籤內容和圖片大小。"); return; }
    void mutate(action.data);
  }

  function toggle(tag: string) {
    setDraft(previous => {
      if (previous.tags.includes(tag)) return { ...previous, tags: previous.tags.filter(value => value !== tag) };
      return previous.tags.length >= 8 ? previous : { ...previous, tags: [...previous.tags, tag] };
    });
  }

  function addTag() {
    const tag = custom.normalize("NFKC").trim();
    const parsed = nextPhaseAction.safeParse({ action: "card.save", tags: [...new Set([...draft.tags, tag])], shareTags: false });
    if (!parsed.success) { setError("每個標籤限 20 字，最多可選 8 個。請使用文字、數字或常用符號。"); return; }
    if (!draft.tags.includes(tag)) toggle(tag);
    setCustom(""); setError("");
  }

  const image = draft.image || card?.image;
  return <section className="service-hub next-phase">
    <h1>名片與專長</h1>
    <p className="sh-muted">選一張名片照片，系統會在裝置上辨識文字並建議專長標籤。名片圖片僅自己可見。</p>
    {error && <p className="sh-error" role="alert">{error}</p>}
    {notice && <p className="sh-notice" role="status">{notice}</p>}
    {terms && renderTerms(() => { setTerms(false); setError(""); setNotice("已同意使用條款，請再按一次儲存。"); })}
    {status === "loading" ? <p role="status">讀取名片中…</p> : status === "failed" ? <button onClick={() => void load()}>重新讀取</button> : <>
      <form className="sh-card sh-form" onSubmit={save}>
        {image && <img className="np-card-photo" src={`data:image/jpeg;base64,${image}`} alt="我的名片照片" />}
        <label className="np-file">
          <input type="file" accept="image/*" disabled={busy || confirmDelete} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void select(file);
          }} />
          <span>{image ? "更換名片圖片" : "選擇名片圖片"}</span>
        </label>
        {working === "scan" && <p role="status">正在辨識名片…</p>}
        <h2>專長標籤</h2>
        <p className="sh-muted">已選 {draft.tags.length} / 8，可取消或加上自己的標籤。</p>
        <div className="np-tags" role="group" aria-label="專長標籤">
          {[...new Set([...suggested, ...draft.tags, ...professionalTags])].map(tag => <button key={tag} type="button" aria-pressed={draft.tags.includes(tag)}
            disabled={busy || confirmDelete || (!draft.tags.includes(tag) && draft.tags.length >= 8)} onClick={() => toggle(tag)}>{tag}</button>)}
        </div>
        <label>自訂標籤<input value={custom} maxLength={20} onChange={event => setCustom(event.target.value)} disabled={busy || confirmDelete} onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addTag(); }
        }} /></label>
        <button type="button" disabled={busy || confirmDelete || !custom.trim() || draft.tags.length >= 8} onClick={addTag}>加入標籤</button>
        <label className="np-sharing"><input type="checkbox" checked={draft.shareTags} disabled={busy || confirmDelete} onChange={event => setDraft({ ...draft, shareTags: event.target.checked })} />
          讓其他會員在資源媒合看到我的姓名與相符標籤</label>
        <div className="sh-actions"><button className="sh-primary" type="submit" disabled={busy || !image || terms || confirmDelete}>{working === "save" ? "儲存中…" : "儲存名片與標籤"}</button>
          {card && !confirmDelete && <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>移除名片</button>}</div>
      </form>
      {confirmDelete && <div className="sh-card" role="group" aria-label="確認移除名片"><p>移除後，這張名片和專長標籤都會刪除。</p><div className="sh-actions">
        <button type="button" disabled={busy} onClick={() => void mutate({ action: "card.delete" })}>確認移除</button>
        <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button>
      </div></div>}
    </>}
  </section>;
}
