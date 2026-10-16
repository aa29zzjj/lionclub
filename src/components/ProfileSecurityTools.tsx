"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import AccessibleDialog from "./AccessibleDialog";
import PasswordInput from "./PasswordInput";
import { colorFromId } from "@/lib/avatar-color";

type Block = { member: { id: string; name: string; nickname: string | null; photoUrl: string | null }; createdAt: string };

export default function ProfileSecurityTools() {
  const router = useRouter();
  const [open, setOpen] = useState<"blocks" | "sessions" | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [unblock, setUnblock] = useState<Block | null>(null);

  async function loadBlocks() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/me/blocks", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!response.ok) throw new Error(result.error ?? "無法載入封鎖名單");
      setBlocks(result.blocks ?? []);
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "封鎖名單連線中斷，請重試"); }
    finally { setLoading(false); }
  }

  async function removeBlock() {
    if (!unblock || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/members/${encodeURIComponent(unblock.member.id)}/block`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!response.ok) throw new Error(result.error ?? "解除封鎖失敗");
      setBlocks((current) => current.filter((entry) => entry.member.id !== unblock.member.id));
      setNotice(`已解除對 ${unblock.member.name} 的封鎖；好友關係不會自動恢復。`); setUnblock(null);
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，請重試"); }
    finally { setBusy(false); }
  }

  async function revoke(event: React.FormEvent) {
    event.preventDefault(); if (busy || !password) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/me/sessions/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) { router.replace("/login?reason=session-updated"); return; }
      if (!response.ok) throw new Error(result.error ?? "登出其他裝置失敗，請確認密碼");
      if (result.currentSessionRetained === false) { router.replace("/login?reason=sessions-revoked"); return; }
      setPassword(""); setOpen(null); setNotice("其他裝置的登入已撤銷，需要重新登入。");
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，尚未確認撤銷結果，請重試"); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-lion-border bg-lion-card p-4">
    <h2 className="text-base font-semibold">隱私與登入安全</h2>
    <div className="mt-3 grid gap-2"><button type="button" className="min-h-12 rounded-xl border border-lion-border px-3 text-left text-base" onClick={() => { setOpen(open === "blocks" ? null : "blocks"); setError(""); setNotice(""); if (open !== "blocks") void loadBlocks(); }}>封鎖名單{open === "blocks" ? " · 收合" : " →"}</button><button type="button" className="min-h-12 rounded-xl border border-lion-border px-3 text-left text-base" onClick={() => { setOpen(open === "sessions" ? null : "sessions"); setPassword(""); setError(""); setNotice(""); }}>登出其他裝置{open === "sessions" ? " · 收合" : " →"}</button></div>
    {notice && <p role="status" className="mt-3 text-base leading-relaxed">{notice}</p>}
    {open === "blocks" && <div className="mt-4" aria-busy={loading}>
      <p className="mb-3 text-sm text-lion-muted">解除封鎖不會自動恢復好友；需要時請重新送出邀請。</p>
      {loading ? <p role="status">載入封鎖名單中…</p> : blocks.length === 0 && !error ? <p className="py-3 text-sm text-lion-muted">目前沒有封鎖會員</p> : blocks.map((entry) => <div key={entry.member.id} className="flex flex-wrap items-center gap-3 border-t border-lion-border py-3"><Avatar name={entry.member.name} color={colorFromId(entry.member.id)} imageUrl={entry.member.photoUrl} size={40} /><div className="min-w-0 flex-1"><p className="break-words text-base font-medium">{entry.member.nickname || entry.member.name}</p><p className="text-sm text-lion-muted">{new Date(entry.createdAt).toLocaleDateString("zh-TW")}</p></div><button type="button" onClick={() => { setError(""); setUnblock(entry); }} className="min-h-12 rounded-xl border border-lion-border px-3 text-sm">解除封鎖</button></div>)}
      {error && <><p role="alert" className="mt-2 text-base text-lion-danger">{error}</p><button type="button" disabled={loading} onClick={() => void loadBlocks()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入</button></>}
    </div>}
    {open === "sessions" && <form onSubmit={revoke} className="mt-4 space-y-3"><p className="text-sm leading-relaxed text-lion-muted">遺失手機或擔心其他裝置仍登入時，可撤銷其他裝置的登入。請輸入目前密碼確認。</p><label htmlFor="revoke-sessions-password" className="block text-sm font-medium">目前密碼</label><PasswordInput id="revoke-sessions-password" autoComplete="current-password" required value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 text-base" />{error && <p role="alert" className="text-base text-lion-danger">{error}</p>}<button type="submit" disabled={busy || !password} className="min-h-12 w-full rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{busy ? "撤銷登入中…" : "確認登出其他裝置"}</button></form>}
    <AccessibleDialog open={Boolean(unblock)} onClose={() => { if (!busy) setUnblock(null); }} busy={busy} title="解除封鎖確認" description={unblock ? `確定解除對 ${unblock.member.name} 的封鎖嗎？這不會恢復好友關係。` : undefined}>
      {error && <p role="alert" className="mb-3 text-base text-lion-danger">{error}</p>}<button type="button" disabled={busy} onClick={() => void removeBlock()} className="min-h-12 w-full rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{busy ? "處理中…" : "確認解除封鎖"}</button>
    </AccessibleDialog>
  </section>;
}
