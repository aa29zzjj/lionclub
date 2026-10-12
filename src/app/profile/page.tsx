"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { memberTitleOptions, tagOptions } from "@/lib/mock-data";
import { colorFromId } from "@/lib/avatar-color";
import { calculateLionYears } from "@/lib/experience-data";

type Me = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  bio: string | null;
  phone: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  organization: { name: string };
  tags: { name: string }[];
  adminRoles: { role: string }[];
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  function loadMe() {
    return fetch("/api/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data: Me | null) => {
        if (data) setMe(data);
      });
  }

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lionYears = me?.joinYear ? calculateLionYears(String(me.joinYear)) : null;

  function startEditing() {
    if (!me) return;
    setAvatarPreview(me.photoUrl);
    setAvatarFile(null);
    setName(me.name);
    setTitle(me.title ?? "");
    setEmail(me.email);
    setPhone(me.phone ?? "");
    setBio(me.bio ?? "");
    setTags(me.tags.map((t) => t.name));
    setEditing(true);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setToast("請選擇 5 MB 內的 JPG、PNG 或 WebP 圖片");
      return;
    }
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    let photoUrl = me?.photoUrl ?? null;
    if (avatarFile) {
      const signResponse = await fetch("/api/me/avatar-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: avatarFile.type, size: avatarFile.size }),
      });
      const signResult = await signResponse.json();
      if (!signResponse.ok) {
        setToast(signResult.error ?? "無法準備大頭貼上傳");
        return;
      }
      const uploadResponse = await fetch(signResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": avatarFile.type },
        body: avatarFile,
      });
      if (!uploadResponse.ok) {
        setToast("大頭貼上傳失敗，請稍後再試");
        return;
      }
      photoUrl = signResult.photoUrl;
    }
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, email, phone, bio, tags, photoUrl }),
    });
    if (!res.ok) {
      setToast("更新失敗，請再試一次");
      setTimeout(() => setToast(""), 2500);
      return;
    }
    const updated = await res.json();
    setMe(updated);
    setAvatarFile(null);
    setEditing(false);
    setToast("個人資料已更新");
    setTimeout(() => setToast(""), 2500);
  }

  if (loading || !me) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-6">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
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
              <Avatar name={me.name} color={colorFromId(me.id)} imageUrl={me.photoUrl} size={64} />
              <div>
                <p className="text-lg font-bold">{me.name}</p>
                <p className="text-sm text-lion-muted">
                  {me.organization.name} · {me.title ?? "會員"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-lion-muted">Email</span>
                <span>{me.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lion-muted">手機</span>
                <span>{me.phone || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lion-muted">會員編號</span>
                <span>{me.memberNo || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lion-muted">入會年／獅齡</span>
                <span>{me.joinYear ?? "—"}／{lionYears ?? "—"} 年</span>
              </div>
            </div>

            <Link
              href="/profile/experience"
              className="rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#243968] border border-lion-gold/25 p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] tracking-[0.18em] text-lion-gold mb-1">LIONS EXPERIENCE</p>
                <p className="font-semibold">獅子會資歷</p>
                <p className="text-xs text-lion-muted mt-1">查看任職紀錄與會籍資歷</p>
              </div>
              <span className="w-9 h-9 rounded-full bg-lion-gold text-lion-navyDeep flex items-center justify-center text-lg">→</span>
            </Link>

            {me.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {me.tags.map((tag) => (
                  <span key={tag.name} className="text-xs px-3 py-1.5 rounded-full border border-lion-gold/40 text-lion-gold">
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}

            {me.bio && (
              <div>
                <h2 className="font-semibold mb-2">關於我</h2>
                <p className="text-sm text-lion-cream/70 leading-relaxed">{me.bio}</p>
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
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="大頭貼預覽" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">📷</span>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <p className="text-xs text-lion-muted mt-2">JPG、PNG 或 WebP，檔案上限 5 MB</p>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-xs text-lion-muted">
              所屬分會：{me.organization.name}（如需變更請聯繫分會幹部）
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
          <>
            <Link
              href="/admin/invites"
              className="mt-8 block w-full text-center text-xs text-lion-gold"
            >
              幹部專用：產生入會邀請 QR
            </Link>
            {me.adminRoles.some((adminRole) => ["CLUB_OFFICER", "CLUB_PRESIDENT", "CLUB_FINANCE", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"].includes(adminRole.role)) && (
              <Link href="/admin/pending-members" className="mt-3 block w-full text-center text-xs text-lion-gold">
                幹部專用：審核新會員
              </Link>
            )}
            {me.adminRoles.some((adminRole) => ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"].includes(adminRole.role)) && (
              <Link href="/admin/roles" className="mt-3 block w-full text-center text-xs text-lion-gold">
                會長／區幹部：管理系統權限
              </Link>
            )}
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
              className="mt-3 w-full text-center text-xs text-lion-muted"
            >
              登出
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
