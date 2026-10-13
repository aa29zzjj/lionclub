"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import FriendQrScanner from "@/components/FriendQrScanner";
import QrModal from "@/components/QrModal";
import { ScanIcon } from "@/components/icons";
import { colorFromId } from "@/lib/avatar-color";
import { createFriendQrPayload, parseFriendQrPayload } from "@/lib/friend-qr";

type Tab = "friends" | "requests" | "add";

type Card = { id: string; name: string; chapter: string; title?: string; photoUrl?: string };
type FriendCard = Card & { status: "friend" };
type IncomingCard = Card & { status: "pending-in"; friendshipId: string };
type SuggestionCard = Card & { status: "pending-out" | "none" };

export default function FriendsPage() {
  const router = useRouter();
  const [meId, setMeId] = useState("");
  const [meName, setMeName] = useState("");
  const [meChapter, setMeChapter] = useState("");
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [incoming, setIncoming] = useState<IncomingCard[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([]);

  const [tab, setTab] = useState<Tab>("friends");
  const [query, setQuery] = useState("");
  const [showMyQr, setShowMyQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState("");

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  async function loadFriends() {
    const res = await fetch("/api/friends");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setFriends(data.friends ?? []);
    setIncoming(data.incoming ?? []);
    setSuggestions(data.suggestions ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      }),
      loadFriends(),
    ])
      .then(([me]) => {
        if (!me) return;
        setMeId(me.id);
        setMeName(me.name);
        setMeChapter(me.organization?.name ?? "");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredFriends = useMemo(
    () => friends.filter((f) => f.name.includes(query) || f.chapter.includes(query)),
    [friends, query]
  );

  async function acceptRequest(friendshipId: string) {
    await fetch(`/api/friends/${friendshipId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    loadFriends();
  }

  async function declineRequest(friendshipId: string) {
    await fetch(`/api/friends/${friendshipId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    loadFriends();
  }

  async function sendRequest(memberId: string) {
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) loadFriends();
  }

  async function handleScanSuccess(decodedText: string) {
    const memberId = parseFriendQrPayload(decodedText);
    if (!memberId) {
      setScanning(false);
      flash("這不是有效的獅子會會員 QR Code");
      return;
    }

    const res = await fetch("/api/friends/qr-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    const data = await res.json().catch(() => ({}));
    setScanning(false);
    if (res.ok) {
      flash(`已將 ${data.friend?.name ?? "對方"} 加為好友`);
      void loadFriends();
    } else {
      flash(data.error ?? "加入失敗，請再試一次");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold mb-4">好友</h1>

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {[
            { id: "friends" as Tab, label: `好友 (${friends.length})` },
            { id: "requests" as Tab, label: `邀請 (${incoming.length})` },
            { id: "add" as Tab, label: "加好友" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs font-medium py-2 rounded-full transition-colors ${
                tab === t.id ? "bg-lion-action text-lion-navyDeep" : "bg-white/[0.04] text-lion-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "friends" && (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋好友姓名或分會"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold mb-4"
            />
            <div className="flex flex-col gap-2">
              {filteredFriends.length === 0 && (
                <p className="text-sm text-lion-muted text-center py-8">找不到符合的好友</p>
              )}
              {filteredFriends.map((f) => (
                <Link
                  key={f.id}
                  href={`/members/${f.id}`}
                  className="flex items-center gap-3 rounded-xl bg-lion-card border border-white/[0.06] p-3"
                >
                  <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    <p className="text-xs text-lion-muted truncate">
                      {f.chapter}
                      {f.title ? ` · ${f.title}` : ""}
                    </p>
                  </div>
                  <span className="text-lion-gold">→</span>
                </Link>
              ))}
            </div>
          </>
        )}

        {tab === "requests" && (
          <div className="flex flex-col gap-2">
            {incoming.length === 0 && <p className="text-sm text-lion-muted text-center py-8">目前沒有好友邀請</p>}
            {incoming.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-lion-card border border-white/[0.06] p-3">
                <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{f.name}</p>
                  <p className="text-xs text-lion-muted truncate">{f.chapter}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptRequest(f.friendshipId)}
                    className="text-xs bg-lion-action text-lion-navyDeep font-medium px-3 py-1.5 rounded-full"
                  >
                    接受
                  </button>
                  <button
                    onClick={() => declineRequest(f.friendshipId)}
                    className="text-xs bg-white/10 text-lion-cream/70 font-medium px-3 py-1.5 rounded-full"
                  >
                    忽略
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "add" && (
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-2.5">
              <p className="text-sm font-semibold">掃描 QR Code 加好友</p>
              <p className="text-xs text-lion-muted">
                掃描對方的會員證 QR Code，或讓對方掃描你的 QR Code，即可互加好友。
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setScanning(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-lion-action text-lion-navyDeep font-medium py-2.5 text-sm"
                >
                  <ScanIcon className="w-4 h-4" /> 掃描好友 QR
                </button>
                <button
                  onClick={() => setShowMyQr(true)}
                  className="flex-1 rounded-xl bg-white/10 text-lion-cream font-medium py-2.5 text-sm"
                >
                  顯示我的 QR
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-lion-muted mb-2">推薦好友</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl bg-lion-card border border-white/[0.06] p-3">
                    <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{f.name}</p>
                      <p className="text-xs text-lion-muted truncate">
                        {f.chapter}
                        {f.title ? ` · ${f.title}` : ""}
                      </p>
                    </div>
                    <button
                      disabled={f.status === "pending-out"}
                      onClick={() => sendRequest(f.id)}
                      className="text-xs shrink-0 font-medium px-3 py-1.5 rounded-full bg-lion-action text-lion-navyDeep disabled:bg-white/10 disabled:text-lion-muted"
                    >
                      {f.status === "pending-out" ? "已送出" : "加好友"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showMyQr && (
        <QrModal
          title="我的好友 QR Code"
          subtitle={`${meName} · ${meChapter}`}
          value={createFriendQrPayload(meId)}
          onClose={() => setShowMyQr(false)}
        />
      )}

      {scanning && (
        <FriendQrScanner onScan={(decodedText) => void handleScanSuccess(decodedText)} onClose={() => setScanning(false)} />
      )}
    </AppShell>
  );
}
