"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { meetupCategories, type MeetupDetail, type MeetupList, type MeetupSummary, type NextPhaseAction } from "../lib/next-phase-contract";
import { NextPhaseError, type NextPhaseTransport } from "../lib/next-phase-client";
import { requestId } from "../lib/request-id";

const taipeiDate = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const chatTime = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const statusLabel = (meetup: MeetupSummary) => meetup.state === "cancelled" ? "已取消" : meetup.state === "ended" ? "已開始" : meetup.joined ? "已報名" : meetup.registeredCount >= meetup.capacity ? "已額滿" : "開放報名";
type Props = { initialId?: string; send: NextPhaseTransport; renderTerms: (done: () => void) => ReactNode };

export default function Meetups({ send, renderTerms, initialId }: Props) {
  const [list, setList] = useState<MeetupList | null>(null);
  const [detail, setDetail] = useState<MeetupDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [edit, setEdit] = useState<MeetupDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [terms, setTerms] = useState(false);
  const [chat, setChat] = useState("");
  const [report, setReport] = useState<{ messageId?: string } | null>(null);
  const [confirming, setConfirming] = useState<NextPhaseAction | null>(null);
  const createKey = useRef("");
  const messageKey = useRef("");
  const writeLock = useRef(false);
  const readGeneration = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialScreen = useRef(true);

  const load = useCallback(async (id: string | null, background = false) => {
    const generation = ++readGeneration.current;
    if (!background) { setLoading(true); setError(""); }
    try {
      if (id) {
        const result = await send<MeetupDetail>({ view: "meetup", id });
        if (generation === readGeneration.current) {
          setDetail(result);
          if (!result.canReadChat) setChat("");
        }
      } else {
        const result = await send<MeetupList>({ view: "meetups" });
        if (generation === readGeneration.current) setList(result);
      }
    } catch (failure) {
      if (generation !== readGeneration.current) return;
      const inaccessible = failure instanceof NextPhaseError && [401, 403, 404, 409].includes(failure.status);
      if (inaccessible) {
        if (id) { setDetail(null); setChat(""); }
        else setList(null);
      }
      if (!background || inaccessible) setError(failure instanceof Error ? failure.message : "讀取失敗");
    } finally {
      if (generation === readGeneration.current) setLoading(false);
    }
  }, [send]);

  useEffect(() => {
    if (!creating) void load(selected);
    return () => { readGeneration.current++; };
  }, [load, selected, creating]);

  useEffect(() => {
    if (initialScreen.current) initialScreen.current = false;
    else heading.current?.focus({ preventScroll: false });
  }, [selected, creating]);

  useEffect(() => {
    if (!selected || busy || creating || !detail?.canReadChat) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(selected, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selected, busy, creating, detail?.canReadChat, load]);

  function open(id: string | null) {
    setEdit(null);
    messageKey.current = "";
    setDetail(null); setSelected(id); setCreating(false); setChat(""); setReport(null); setConfirming(null); setTerms(false); setError(""); setNotice("");
  }

  async function mutate(action: NextPhaseAction) {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await send<{ ok: true; id?: string; changed?: boolean }>(action);
      if (action.action === "meetup.create" && result.id) { open(result.id); setNotice("揪團已發布"); }
      else {
        if (action.action === "meetup.update") { setEdit(null); setNotice(result.changed === false ? "時間和地點與目前紀錄相同。" : "異動已儲存，報名獅友可在通知中查看。"); }
        if (action.action === "meetup.message") { setChat(""); messageKey.current = ""; }
        if (action.action === "meetup.report") { setReport(null); setNotice("已送出檢舉"); }
        setConfirming(null);
        await load(selected);
      }
    } catch (failure) {
      if (failure instanceof NextPhaseError && failure.code === "TERMS_REQUIRED") setTerms(true);
      setError(failure instanceof Error ? failure.message : "儲存失敗");
    } finally { writeLock.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const startsAt = String(values.get("startsAt"));
    void mutate({
      action: "meetup.create", requestId: createKey.current, title: String(values.get("title")),
      category: values.get("category") as typeof meetupCategories[number], location: String(values.get("location")),
      description: String(values.get("description")), startsAt: `${startsAt}:00+08:00`, capacity: Number(values.get("capacity")),
    });
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    const values = new FormData(event.currentTarget);
    void mutate({ action: "meetup.update", id: edit.id, revision: edit.revision,
      startsAt: `${values.get("startsAt")}:00+08:00`, location: String(values.get("location")) });
  }

  const shown = detail?.id === selected ? detail : null;
  return <div className="service-hub next-phase">
    {(creating || selected) && <button type="button" disabled={busy} onClick={() => open(null)}>‹ 返回揪團</button>}
    <div className="sh-header np-header"><h1 tabIndex={-1} ref={heading}>{creating ? "發起揪團" : shown?.title ?? "揪團"}</h1>
      {!creating && !selected && list && <button type="button" className="sh-primary" onClick={() => {
        createKey.current = requestId(); setCreating(true); setError(""); setNotice("");
      }}>＋ 發起揪團</button>}
    </div>
    {error && <p className="sh-error" role="alert">{error}</p>}
    {notice && <p className="sh-notice" role="status">{notice}</p>}
    {terms && renderTerms(() => { setTerms(false); setError(""); setNotice("已同意使用條款，請再次送出。"); })}
    {creating ? <form className="sh-card sh-form" onSubmit={create}>
      <label>揪團名稱<input name="title" placeholder="例如：週五好樂迪唱歌" minLength={2} maxLength={80} required /></label>
      <label>類型<select name="category" defaultValue="餐敘">{meetupCategories.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>開始時間（台灣時間）<input name="startsAt" type="datetime-local" required /></label>
      <label>集合地點<input name="location" minLength={2} maxLength={120} required /></label>
      <label>人數上限（含主揪）<input name="capacity" type="number" min={2} max={100} defaultValue={8} required /></label>
      <label>揪團說明<textarea name="description" rows={3} maxLength={1000} placeholder="費用、集合方式或其他資訊" /></label>
      <button className="sh-primary" type="submit" disabled={busy || terms}>{busy ? "發布中…" : "發布揪團"}</button>
    </form> : selected ? shown ? <>
      <article className="sh-card">
        <div className="sh-row"><span className="sh-kicker">{shown.category} · 主揪 {shown.hostName}</span><span className="sh-badge">{statusLabel(shown)}</span></div>
        <p>{taipeiDate.format(new Date(shown.startsAt))} · {shown.location}</p>
        <p className="sh-prewrap">{shown.description}</p>
        <p className="sh-muted">{shown.registeredCount} / {shown.capacity} 人</p>
        <div className="sh-actions">
          {shown.state === "open" && (shown.isHost
            ? <><button disabled={busy} onClick={() => { setEdit(shown); setConfirming(null); }}>修改時間或地點</button>
              <button disabled={busy} onClick={() => { setEdit(null); setConfirming({ action: "meetup.cancel", id: shown.id }); }}>取消揪團</button></>
            : <button className={shown.joined ? "" : "sh-primary"} disabled={busy || (!shown.joined && shown.registeredCount >= shown.capacity)}
              onClick={() => shown.joined ? setConfirming({ action: "meetup.leave", id: shown.id }) : void mutate({ action: "meetup.join", id: shown.id })}>{shown.joined ? "取消報名" : "我要報名"}</button>)}
          {!shown.isHost && <button disabled={busy} onClick={() => setReport({})}>檢舉揪團</button>}
        </div>
      </article>
      {edit && <form className="sh-card sh-form" onSubmit={update}>
        <h2>修改時間或地點</h2>
        <p className="sh-muted">已報名的獅友會收到異動通知，行前提醒會依新時間安排。</p>
        <label>開始時間（台灣時間）<input name="startsAt" type="datetime-local" required
          defaultValue={new Date(Date.parse(edit.startsAt) + 8 * 3_600_000).toISOString().slice(0, 16)} /></label>
        <label>集合地點<input name="location" minLength={2} maxLength={120} required defaultValue={edit.location} /></label>
        <div className="sh-actions"><button className="sh-primary" type="submit" disabled={busy}>儲存異動</button>
          <button type="button" disabled={busy} onClick={() => setEdit(null)}>關閉編輯</button></div>
      </form>}
      {confirming && <div className="sh-card" role="group" aria-label="確認操作"><p>{confirming.action === "meetup.cancel" ? "確定取消揪團並關閉發言？" : confirming.action === "meetup.leave" ? "取消報名後將無法查看這個聊天室。" : "確定刪除這則訊息？"}</p>
        <div className="sh-actions"><button autoFocus disabled={busy} onClick={() => void mutate(confirming)}>確認</button><button disabled={busy} onClick={() => setConfirming(null)}>返回</button></div>
      </div>}
      {report && <form className="sh-card sh-form" onSubmit={event => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason"));
        void mutate({ action: "meetup.report", id: shown.id, messageId: report.messageId, reason });
      }}>
        <label>檢舉原因<textarea autoFocus name="reason" required minLength={2} maxLength={200} rows={2} /></label>
        <div className="sh-actions"><button type="submit" disabled={busy}>送出檢舉</button><button type="button" disabled={busy} onClick={() => setReport(null)}>取消</button></div>
      </form>}
      <section className="sh-card" aria-labelledby="meetup-chat-title">
        <div className="sh-row"><h2 id="meetup-chat-title">揪團聊天室</h2>{shown.canReadChat && <button disabled={busy} onClick={() => void load(shown.id)}>更新訊息</button>}</div>
        {!shown.canReadChat ? <p className="sh-muted">報名後就可以進入聊天室。</p> : <>
          {shown.messages.length ? <ol className="np-chat" aria-label="最近訊息">{shown.messages.map(message => <li key={message.id} className={message.own ? "np-message np-message-own" : "np-message"}>
            <div className="sh-row"><strong>{message.own ? "你" : message.author}</strong><time dateTime={message.createdAt}>{chatTime.format(new Date(message.createdAt))}</time></div>
            <p className="sh-prewrap">{message.body}</p>
            <button type="button" disabled={busy} aria-label={message.own ? "刪除自己的訊息" : `檢舉 ${message.author} 的訊息`}
              onClick={() => message.own ? setConfirming({ action: "meetup.message.delete", id: shown.id, messageId: message.id }) : setReport({ messageId: message.id })}>{message.own ? "刪除" : "檢舉"}</button>
          </li>)}</ol> : <p className="sh-muted">還沒有訊息。</p>}
          {shown.canWriteChat ? <form className="sh-form" onSubmit={event => {
            event.preventDefault();
            if (chat.trim()) {
              messageKey.current ||= requestId();
              void mutate({ action: "meetup.message", id: shown.id, requestId: messageKey.current, body: chat });
            }
          }}>
            <label>訊息<textarea rows={2} value={chat} onChange={event => { messageKey.current = ""; setChat(event.target.value); }} maxLength={600} disabled={busy} required /></label>
            <button className="sh-primary" type="submit" disabled={!chat.trim() || busy || terms}>送出訊息</button>
          </form> : <p className="sh-muted">揪團已取消，仍可查看先前訊息。</p>}
        </>}
      </section>
    </> : null : list ? <>
      <p className="sh-muted">{list.organizationName} · 分會會員限定</p>
      {list.meetups.length ? list.meetups.map(meetup => <article className="sh-card np-list-item" key={meetup.id}>
        <div className="sh-row"><span className="sh-kicker">{meetup.category} · {taipeiDate.format(new Date(meetup.startsAt))}</span><span className="sh-badge">{statusLabel(meetup)}</span></div>
        <h2>{meetup.title}</h2><p className="sh-muted">{meetup.location} · {meetup.registeredCount} / {meetup.capacity} 人</p>
        <button type="button" aria-label={`查看揪團：${meetup.title}`} onClick={() => open(meetup.id)}>查看揪團</button>
      </article>) : <p className="sh-empty">分會還沒有揪團。</p>}
      {list.limited && <p className="sh-muted">清單優先顯示即將開始的 60 筆揪團。</p>}
    </> : null}
    {!creating && loading && !shown && (!list || selected) && <p role="status">讀取中…</p>}
    {!creating && !loading && !shown && (selected || !list) && <button onClick={() => void load(selected)}>重新讀取</button>}
  </div>;
}
