"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import {
  initialFriends,
  initialSentNotifications,
  upcomingEvents,
  SentNotification,
} from "@/lib/mock-data";

export default function NotificationsPage() {
  const friends = initialFriends.filter((f) => f.status === "friend");
  const [sent, setSent] = useState<SentNotification[]>(initialSentNotifications);
  const [composing, setComposing] = useState(false);
  const [eventId, setEventId] = useState(upcomingEvents[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");

  function toggleFriend(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function resetForm() {
    setEventId(upcomingEvents[0]?.id ?? "");
    setSelected([]);
    setMessage("");
    setComposing(false);
  }

  function handleSend() {
    const event = upcomingEvents.find((e) => e.id === eventId);
    if (!event || selected.length === 0) return;
    const names = friends.filter((f) => selected.includes(f.id)).map((f) => f.name);
    const newNotification: SentNotification = {
      id: `n${Date.now()}`,
      eventTitle: event.title,
      recipients: names,
      message: message || `邀請你一起參加「${event.title}」！`,
      sentAt: "剛剛",
    };
    setSent((prev) => [newNotification, ...prev]);
    setToast(`已發送給 ${names.length} 位好友`);
    resetForm();
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">活動通知</h1>
          <button
            onClick={() => setComposing(true)}
            className="text-xs font-medium bg-lion-gold text-lion-navyDeep px-3 py-1.5 rounded-full"
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
            {sent.length === 0 && (
              <p className="text-sm text-lion-cream/40 text-center py-8">尚未發送任何活動通知</p>
            )}
            {sent.map((n) => (
              <div key={n.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{n.eventTitle}</p>
                  <span className="text-[11px] text-lion-cream/40">{n.sentAt}</span>
                </div>
                <p className="text-xs text-lion-cream/60 mb-2">{n.message}</p>
                <p className="text-[11px] text-lion-cream/40">已通知：{n.recipients.join("、")}</p>
              </div>
            ))}
          </div>
        )}

        {composing && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-lion-cream/60 mb-1 block">選擇活動</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 text-sm text-lion-cream outline-none focus:border-lion-gold"
              >
                {upcomingEvents.map((ev) => (
                  <option key={ev.id} value={ev.id} className="text-black">
                    {ev.title}（{ev.date}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-lion-cream/60 mb-2 block">
                選擇好友（已選 {selected.length} 位）
              </label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
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
                      <Avatar name={f.name} color={f.avatarColor} size={36} />
                      <span className="flex-1 text-sm">{f.name}</span>
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${
                          isSelected ? "bg-lion-gold border-lion-gold text-lion-navyDeep" : "border-white/30"
                        }`}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-lion-cream/60 mb-1 block">通知訊息（選填）</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="寫點話邀請好友一起參加吧！"
                rows={3}
                className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 text-sm text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSend}
                disabled={selected.length === 0}
                className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2.5 text-sm disabled:opacity-40"
              >
                發送給 {selected.length} 位好友
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
