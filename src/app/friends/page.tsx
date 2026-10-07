"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import QrModal from "@/components/QrModal";
import { ScanIcon } from "@/components/icons";
import { useAppData } from "@/lib/store";

type Tab = "friends" | "requests" | "add";

export default function FriendsPage() {
  const { profile, friends, incoming, suggestions, acceptRequest, declineRequest, sendRequest, addFriendByQr } =
    useAppData();
  const [tab, setTab] = useState<Tab>("friends");
  const [query, setQuery] = useState("");
  const [showMyQr, setShowMyQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState("");

  const filteredFriends = useMemo(
    () => friends.filter((f) => f.name.includes(query) || f.chapter.includes(query)),
    [friends, query]
  );

  function handleScanSuccess() {
    const added = addFriendByQr();
    setScanning(false);
    setToast(`已將 ${added.name} 加為好友`);
    setTimeout(() => setToast(""), 2500);
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
                tab === t.id ? "bg-lion-gold text-lion-navyDeep" : "bg-white/[0.04] text-lion-muted"
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
                <div key={f.id} className="flex items-center gap-3 rounded-xl bg-lion-card border border-white/[0.06] p-3">
                  <Avatar name={f.name} color={f.avatarColor} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    <p className="text-xs text-lion-muted truncate">
                      {f.chapter}
                      {f.title ? ` · ${f.title}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "requests" && (
          <div className="flex flex-col gap-2">
            {incoming.length === 0 && <p className="text-sm text-lion-muted text-center py-8">目前沒有好友邀請</p>}
            {incoming.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-lion-card border border-white/[0.06] p-3">
                <Avatar name={f.name} color={f.avatarColor} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{f.name}</p>
                  <p className="text-xs text-lion-muted truncate">{f.chapter}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptRequest(f.id)}
                    className="text-xs bg-lion-gold text-lion-navyDeep font-medium px-3 py-1.5 rounded-full"
                  >
                    接受
                  </button>
                  <button
                    onClick={() => declineRequest(f.id)}
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
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-lion-gold text-lion-navyDeep font-medium py-2.5 text-sm"
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
                    <Avatar name={f.name} color={f.avatarColor} />
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
                      className="text-xs shrink-0 font-medium px-3 py-1.5 rounded-full bg-lion-gold text-lion-navyDeep disabled:bg-white/10 disabled:text-lion-muted"
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
          subtitle={`${profile.name} · ${profile.chapter}`}
          seed={profile.id}
          onClose={() => setShowMyQr(false)}
        />
      )}

      {scanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-8" onClick={() => setScanning(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl bg-lion-card border border-white/10 p-6 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold mb-1">掃描好友 QR Code</p>
            <p className="text-xs text-lion-muted mb-4 text-center">將對方的會員證 QR Code 對準掃描框</p>
            <div className="w-48 h-48 rounded-xl border-2 border-dashed border-lion-gold/50 flex items-center justify-center mb-4 text-lion-muted text-xs">
              相機掃描框（示意）
            </div>
            <button
              onClick={handleScanSuccess}
              className="w-full rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2.5 text-sm mb-2"
            >
              模擬掃描成功
            </button>
            <button
              onClick={() => setScanning(false)}
              className="w-full rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
