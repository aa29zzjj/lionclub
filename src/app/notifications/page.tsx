"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { colorFromId } from "@/lib/avatar-color";

type Friend = { id: string; name: string; chapter: string; photoUrl?: string };
type EventOption = { id: string; title: string; startAt: string };
type SentNotification = { id: string; eventTitle: string; recipients: string[]; message: string; sentAt: string };

export default function NotificationsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const [composing, setComposing] = useState(false);
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [recipientType, setRecipientType] = useState<"selected" | "organization">("selected");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/friends").then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      }),
      fetch("/api/events").then((res) => res.json()),
      fetch("/api/notifications").then((res) => res.json()),
    ])
      .then(([friendsData, eventsData, notificationsData]) => {
        if (!friendsData) return;
        setFriends(friendsData.friends ?? []);
        setEvents(eventsData.events ?? []);
        setEventId(eventsData.events?.[0]?.id ?? "");
        setNotifications(notificationsData.notifications ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFriend(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function resetForm() {
    setEventId(events[0]?.id ?? "");
    setSelected([]);
    setRecipientType("selected");
    setMessage("");
    setError("");
    setComposing(false);
  }

  async function handleSend() {
    if (!eventId || (recipientType === "selected" && selected.length === 0)) return;
    setError("");
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, recipientType, memberIds: selected, message: message || undefined }),
    });
    const result = await res.json();
    if (!res.ok) {
      setError(result.error ?? "通知發送失敗");
      return;
    }
    setToast(`已發送給 ${result.recipientCount} 位會員`);
    resetForm();
    const data = await fetch("/api/notifications").then((r) => r.json());
    setNotifications(data.notifications ?? []);
    setTimeout(() => setToast(""), 2500);
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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">活動通知</h1>
          <button
            onClick={() => setComposing(true)}
            className="text-xs font-medium bg-lion-action text-lion-navyDeep px-3 py-1.5 rounded-full"
          >
            + 發送通知
          </button>
        </div>

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        {!composing && (
          <div className="flex flex-col gap-3">
            {notifications.length === 0 && (
              <p className="text-sm text-lion-muted text-center py-8">尚未發送任何活動通知</p>
            )}
            {notifications.map((n) => (
              <div key={n.id} className="rounded-xl bg-lion-card border border-white/[0.06] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{n.eventTitle}</p>
                  <span className="text-[11px] text-lion-muted">
                    {new Date(n.sentAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-lion-cream/60 mb-2">{n.message}</p>
                <p className="text-[11px] text-lion-muted">已通知：{n.recipients.join("、")}</p>
              </div>
            ))}
          </div>
        )}

        {composing && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-lion-muted mb-1 block">選擇活動</label>
              {events.length === 0 ? (
                <p className="text-xs text-lion-muted">目前沒有可選擇的活動，請先到「活動」頁發布一個活動。</p>
              ) : (
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-lion-cream outline-none focus:border-lion-gold"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id} className="bg-lion-card text-lion-cream">
                      {ev.title}（{new Date(ev.startAt).toLocaleDateString("zh-TW")}）
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-2 block">收件範圍</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button type="button" onClick={() => setRecipientType("selected")} className={`rounded-xl border px-3 py-2 text-xs ${recipientType === "selected" ? "border-lion-gold bg-lion-gold/10 text-lion-gold" : "border-white/10"}`}>指定好友</button>
                <button type="button" onClick={() => setRecipientType("organization")} className={`rounded-xl border px-3 py-2 text-xs ${recipientType === "organization" ? "border-lion-gold bg-lion-gold/10 text-lion-gold" : "border-white/10"}`}>整個分會</button>
              </div>
              {recipientType === "organization" ? (
                <p className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2.5 text-xs text-sky-200/90">將通知同分會所有啟用會員；限活動建立者或具管理權限的幹部。</p>
              ) : <><p className="text-xs text-lion-muted mb-2">選擇好友（已選 {selected.length} 位）</p><div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {friends.map((f) => {
                  const isSelected = selected.includes(f.id);
                  return (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => toggleFriend(f.id)}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                        isSelected ? "border-lion-gold bg-lion-gold/10" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} size={36} />
                      <span className="flex-1 text-sm">{f.name}</span>
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${
                          isSelected ? "bg-lion-action border-lion-gold text-lion-navyDeep" : "border-white/30"
                        }`}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div></>}
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">通知訊息（選填）</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="寫點話邀請好友一起參加吧！"
                rows={3}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-300">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSend}
                disabled={(recipientType === "selected" && selected.length === 0) || events.length === 0}
                className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2.5 text-sm disabled:opacity-40"
              >
                {recipientType === "organization" ? "通知整個分會" : `發送給 ${selected.length} 位好友`}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
