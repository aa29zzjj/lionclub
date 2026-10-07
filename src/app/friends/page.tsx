"use client";

import { useMemo, useState } from "react";
import PhoneShell from "@/components/PhoneShell";
import Avatar from "@/components/Avatar";
import { Friend, initialFriends, suggestedFriends } from "@/lib/mock-data";

type Tab = "friends" | "requests" | "add";

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>(initialFriends.filter((f) => f.status === "friend"));
  const [incoming, setIncoming] = useState<Friend[]>(initialFriends.filter((f) => f.status === "pending-in"));
  const [suggestions, setSuggestions] = useState<Friend[]>(suggestedFriends);
  const [query, setQuery] = useState("");

  const filteredFriends = useMemo(
    () => friends.filter((f) => f.name.includes(query) || f.chapter.includes(query)),
    [friends, query]
  );

  function acceptRequest(id: string) {
    const person = incoming.find((f) => f.id === id);
    if (!person) return;
    setIncoming((prev) => prev.filter((f) => f.id !== id));
    setFriends((prev) => [...prev, { ...person, status: "friend" }]);
  }

  function declineRequest(id: string) {
    setIncoming((prev) => prev.filter((f) => f.id !== id));
  }

  function sendRequest(id: string) {
    setSuggestions((prev) => prev.map((f) => (f.id === id ? { ...f, status: "pending-out" } : f)));
  }

  return (
    <PhoneShell>
      <div className="px-5 pt-10 pb-4">
        <h1 className="text-xl font-bold mb-4">好友</h1>

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
                tab === t.id ? "bg-lion-gold text-lion-navyDeep" : "bg-white/5 text-lion-cream/60"
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
              className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-2.5 text-sm text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold mb-4"
            />
            <div className="flex flex-col gap-2">
              {filteredFriends.length === 0 && (
                <p className="text-sm text-lion-cream/40 text-center py-8">找不到符合的好友</p>
              )}
              {filteredFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                  <Avatar name={f.name} color={f.avatarColor} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    <p className="text-xs text-lion-cream/50 truncate">
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
            {incoming.length === 0 && <p className="text-sm text-lion-cream/40 text-center py-8">目前沒有好友邀請</p>}
            {incoming.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <Avatar name={f.name} color={f.avatarColor} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{f.name}</p>
                  <p className="text-xs text-lion-cream/50 truncate">{f.chapter}</p>
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
          <div className="flex flex-col gap-2">
            <p className="text-xs text-lion-cream/50 mb-1">推薦好友</p>
            {suggestions.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <Avatar name={f.name} color={f.avatarColor} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{f.name}</p>
                  <p className="text-xs text-lion-cream/50 truncate">
                    {f.chapter}
                    {f.title ? ` · ${f.title}` : ""}
                  </p>
                </div>
                <button
                  disabled={f.status === "pending-out"}
                  onClick={() => sendRequest(f.id)}
                  className="text-xs shrink-0 font-medium px-3 py-1.5 rounded-full bg-lion-gold text-lion-navyDeep disabled:bg-white/10 disabled:text-lion-cream/40"
                >
                  {f.status === "pending-out" ? "已送出" : "加好友"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
