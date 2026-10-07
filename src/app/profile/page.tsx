"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { memberTitleOptions, tagOptions } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export default function ProfilePage() {
  const router = useRouter();
  const { profile, updateProfile } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [bio, setBio] = useState(profile.bio);
  const [tags, setTags] = useState<string[]>(profile.tags);
  const [toast, setToast] = useState("");

  function startEditing() {
    setAvatarUrl(profile.avatarUrl);
    setName(profile.name);
    setTitle(profile.title);
    setEmail(profile.email);
    setPhone(profile.phone);
    setBio(profile.bio);
    setTags(profile.tags);
    setEditing(true);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUrl(URL.createObjectURL(file));
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateProfile({ avatarUrl, name, title, email, phone, bio, tags });
    setEditing(false);
    setToast("個人資料已更新");
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">我的檔案</h1>
          {!editing && (
            <button
              onClick={startEditing}
              className="text-xs font-medium bg-lion-gold text-lion-navyDeep px-3 py-1.5 rounded-full"
            >
              編輯我的檔案
            </button>
          )}
        </div>

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        {!editing && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar name={profile.name} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={64} />
              <div>
                <p className="text-lg font-bold">{profile.name}</p>
                <p className="text-sm text-lion-muted">
                  {profile.chapter} · {profile.title}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-lion-muted">Email</span>
                <span>{profile.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lion-muted">手機</span>
                <span>{profile.phone || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lion-muted">會員編號</span>
                <span>{profile.memberNo}</span>
              </div>
            </div>

            {profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((tag) => (
                  <span key={tag} className="text-xs px-3 py-1.5 rounded-full border border-lion-gold/40 text-lion-gold">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {profile.bio && (
              <div>
                <h2 className="font-semibold mb-2">關於我</h2>
                <p className="text-sm text-lion-cream/70 leading-relaxed">{profile.bio}</p>
              </div>
            )}
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full bg-white/10 border-2 border-dashed border-lion-gold/50 flex items-center justify-center overflow-hidden"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="大頭貼預覽" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">📷</span>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <p className="text-xs text-lion-muted mt-2">更換大頭貼</p>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-xs text-lion-muted">
              所屬分會：{profile.chapter}（如需變更請聯繫分會幹部）
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">姓名</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">職稱／身分</label>
                <select
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  {memberTitleOptions.map((t) => (
                    <option key={t} value={t} className="text-black">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">手機</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">專長／興趣標籤</label>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => {
                  const active = tags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        active
                          ? "bg-lion-gold text-lion-navyDeep border-lion-gold"
                          : "bg-white/5 text-lion-cream/60 border-white/15"
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">關於我</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2.5 text-sm"
              >
                儲存變更
              </button>
            </div>
          </form>
        )}

        {!editing && (
          <button
            onClick={() => router.push("/login")}
            className="mt-8 w-full text-center text-xs text-lion-muted"
          >
            登出
          </button>
        )}
      </div>
    </AppShell>
  );
}
