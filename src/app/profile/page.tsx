"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import ThemeSelector from "@/components/ThemeSelector";
import ProfileSecurityTools from "@/components/ProfileSecurityTools";
import { CalendarIcon, ChevronRightIcon, PeopleIcon, QrIcon, UserIcon } from "@/components/icons";
import { memberTitleOptions, tagOptions } from "@/lib/mock-data";
import { colorFromId } from "@/lib/avatar-color";
import { calculateLionYears, formatJoinDate } from "@/lib/experience-data";
import { profileCapabilities } from "@/lib/profile-capabilities";

type Me = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  title: string | null;
  bio: string | null;
  phone: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  joinMonth: number | null;
  birthday: string | null;
  emailVerifiedAt?: string | null;
  organizationAssignmentStatus?: "NEEDS_ASSIGNMENT" | "ASSIGNED";
  declaredOrganizationName?: string | null;
  organization: { name: string };
  tags: { name: string }[];
  adminRoles: { role: string }[];
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [focusField, setFocusField] = useState<"phone" | "birthday" | null>(null);
  const [editing, setEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);

  async function resendVerification() {
    setResendingVerification(true);
    try {
    const res = await fetch("/api/me/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { router.replace("/login?reason=session-expired"); return; }
    setToast(res.ok ? "驗證信已寄出，請至信箱查看" : data.error ?? "寄送失敗，請稍後再試");
    } catch { setToast("驗證信連線中斷，請稍後再試"); }
    finally { setResendingVerification(false); }
  }

  function loadMe() {
    setLoadError("");
    return fetch("/api/me")
      .then(async (res) => {
        if (res.status === 401) {
          setMe(null); router.replace("/login?reason=session-expired");
          return null;
        }
        if (!res.ok) throw new Error("個人資料暫時無法載入，請稍後再試");
        return res.json();
      })
      .then((data: Me | null) => {
        if (data) setMe(data);
      })
      .catch(() => setLoadError("連線暫時中斷，請確認網路後重試"));
  }

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lionYears = me?.joinYear ? calculateLionYears(String(me.joinYear), me.joinMonth) : null;

  useEffect(() => {
    if (editing && focusField) document.getElementById(`profile-${focusField}`)?.focus();
  }, [editing, focusField]);

  function startEditing(field?: "phone" | "birthday") {
    if (!me) return;
    setAvatarPreview(me.photoUrl);
    setAvatarFile(null);
    setName(me.name);
    setNickname(me.nickname ?? "");
    setTitle(me.title ?? "");
    setEmail(me.email);
    setPhone(me.phone ?? "");
    setBirthday(me.birthday ? me.birthday.slice(0, 10) : "");
    setBio(me.bio ?? "");
    setTags(me.tags.map((t) => t.name));
    setFocusField(field ?? null);
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
    if (saving) return;
    setSaving(true);
    setToast("");
    try {
      let photoUrl = me?.photoUrl ?? null;
      if (avatarFile) {
        const signResponse = await fetch("/api/me/avatar-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: avatarFile.type, size: avatarFile.size }),
        });
        const signResult = await signResponse.json();
        if (signResponse.status === 401) { setMe(null); router.replace("/login?reason=session-expired"); return; }
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
        body: JSON.stringify({ name, nickname, title, ...(email !== me?.email ? { email } : {}), phone, bio, tags, photoUrl: photoUrl ?? "", birthday }),
      });
      if (res.status === 401) { setMe(null); router.replace("/login?reason=session-expired"); return; }
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setToast(result.error ?? "更新失敗，請再試一次");
        return;
      }
      const updated = await res.json();
      setMe(updated);
      setAvatarFile(null);
      setEditing(false);
      setToast("個人資料已更新");
      setTimeout(() => setToast(""), 2500);
    } catch {
      setToast("連線暫時中斷，資料尚未儲存，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  if (loadError && !me) {
    return <AppShell><div className="px-5 py-16 text-center">
      <p role="alert" className="text-sm text-lion-muted">{loadError}</p>
      <button type="button" onClick={() => { setLoading(true); void loadMe().finally(() => setLoading(false)); }} className="mt-4 min-h-12 rounded-xl bg-lion-action px-5 text-sm font-semibold text-lion-navyDeep">重新載入</button>
    </div></AppShell>;
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

  const capabilities = profileCapabilities(me.adminRoles);
  const joinDate = formatJoinDate(me.joinYear, me.joinMonth);
  const adminTools = [
    {
      href: "/admin/invites",
      title: "入會邀請",
      description: "產生共同入會 QR，設定註冊有效期",
      Icon: QrIcon,
      visible: capabilities.issueInvites,
    },
    {
      href: "/admin/pending-members",
      title: "審核新會員",
      description: "核准或拒絕待審核的會員申請",
      Icon: UserIcon,
      visible: capabilities.reviewMembers,
    },
    {
      href: "/admin/pending-experiences",
      title: "審核會員資歷",
      description: "核實會員自行填寫的任職紀錄",
      Icon: CalendarIcon,
      visible: capabilities.reviewExperiences,
    },
    {
      href: "/admin/roles",
      title: "管理系統權限",
      description: "授予或撤銷分會幹部權限",
      Icon: PeopleIcon,
      visible: capabilities.manageRoles,
    },
    {
      href: "/admin/member-assignment",
      title: "會員分會分派",
      description: "核對會員名單、確認正式分會與分派歷史",
      Icon: PeopleIcon,
      visible: capabilities.assignMembers,
    },
    {
      href: "/admin/reports",
      title: "檢舉管理",
      description: "查看並處理會員檢舉",
      Icon: UserIcon,
      visible: capabilities.reviewReports,
    },
  ].filter((tool) => tool.visible);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">我的檔案</h1>
          {!editing && (
            <button
              onClick={() => startEditing()}
              className="min-h-12 text-xs font-medium bg-lion-action text-lion-navyDeep px-3 py-1.5 rounded-full"
            >
              編輯我的檔案
            </button>
          )}
        </div>

        {toast && (
          <div role="status" className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        {me.organizationAssignmentStatus === "NEEDS_ASSIGNMENT" && (
          <section className="mb-5 rounded-2xl border border-lion-gold/30 bg-lion-card p-4" aria-label="分會核對狀態">
            <h2 className="text-sm font-semibold">正式分會待名單核對</h2>
            <p className="mt-1 text-xs leading-relaxed text-lion-muted">目前暫存於 {me.organization.name}，正式分會待名單核對；您可正常使用會員功能。</p>
            {me.declaredOrganizationName && <p className="mt-2 break-words text-xs text-lion-muted">登記分會：{me.declaredOrganizationName}</p>}
          </section>
        )}

        {!me.emailVerifiedAt && (
          <section className="mb-5 rounded-2xl border-2 border-amber-400/60 bg-amber-400/10 p-4 shadow-sm" aria-label="Email 驗證狀態">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">⚠️</span>
              <div>
                <h2 className="text-sm font-bold text-amber-200">Email 尚未驗證</h2>
                <p className="mt-1 text-xs leading-relaxed text-amber-200">請至 {me.email} 收取驗證信並完成驗證，以確保帳號安全。</p>
                <button
                  onClick={resendVerification}
                  disabled={resendingVerification}
                  className="mt-2 text-xs font-semibold text-amber-200 underline underline-offset-2 disabled:opacity-50"
                >
                  {resendingVerification ? "寄送中…" : "重新寄送驗證信"}
                </button>
              </div>
            </div>
          </section>
        )}

        {!editing && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar name={me.name} color={colorFromId(me.id)} imageUrl={me.photoUrl} size={64} />
              <div>
                <p className="text-lg font-bold">{me.nickname || me.name}</p>
                {me.nickname && <p className="text-xs text-lion-muted">{me.name}</p>}
                <p className="text-sm text-lion-muted">
                  {me.organization.name} · {me.title ?? "會員"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-lion-card border border-lion-border px-4 text-sm divide-y divide-white/[0.06]">
              <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                <span className="text-lion-muted">Email</span>
                <span className="min-w-0 truncate text-right">{me.email}</span>
              </div>
              <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                <span className="text-lion-muted">手機</span>
                {me.phone ? <span>{me.phone}</span> : (
                  <button type="button" aria-label="補填手機" onClick={() => startEditing("phone")} className="min-h-12 text-xs font-medium text-lion-gold">尚未填寫 · 補上</button>
                )}
              </div>
              <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                <span className="text-lion-muted">生日</span>
                {me.birthday ? <span>{new Date(me.birthday).toLocaleDateString("zh-TW")}</span> : (
                  <button type="button" aria-label="補填生日" onClick={() => startEditing("birthday")} className="min-h-12 text-xs font-medium text-lion-gold">尚未填寫 · 補上</button>
                )}
              </div>
              <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                <span className="text-lion-muted">會員編號</span>
                <span>{me.memberNo || "待系統編號"}</span>
              </div>
              <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                <span className="text-lion-muted">入會年／獅齡</span>
                <span className={joinDate ? "" : "text-xs text-lion-muted"}>
                  {joinDate ? `${joinDate}／${lionYears ?? "—"} 年` : "待幹部補登"}
                </span>
              </div>
            </div>

            <Link
              href="/profile/experience"
              className="theme-brand-panel rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#243968] border border-lion-gold/25 p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] tracking-[0.18em] text-lion-gold mb-1">LIONS EXPERIENCE</p>
                <p className="font-semibold">獅子會資歷</p>
                <p className="text-xs text-lion-muted mt-1">查看任職紀錄與會籍資歷</p>
              </div>
              <span className="w-9 h-9 rounded-full bg-lion-action text-lion-navyDeep flex items-center justify-center text-lg">→</span>
            </Link>

            <ThemeSelector />
            <ProfileSecurityTools />

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

            <section className="overflow-hidden rounded-2xl border border-lion-border bg-lion-card">
              <Link href="/organizations" className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-lion-soft">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lion-gold/10 text-lion-gold">
                  <PeopleIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">組織架構與幹部名單</span>
                  <span className="mt-0.5 block text-sm text-lion-muted">查看複合區、區、專區、分區、分會的隸屬關係與本年度在任幹部</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-lion-muted" />
              </Link>
            </section>

            {adminTools.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-lion-border bg-lion-card">
                <div className="border-b border-lion-border px-4 py-3">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-lion-gold">ADMIN TOOLS</p>
                  <h2 className="mt-0.5 text-base font-semibold">幹部與資歷工具</h2>
                  <p className="mt-1 text-sm text-lion-muted">依有效授權顯示；資歷審核權限不等於行政管理權限。</p>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {adminTools.map(({ href, title, description, Icon }) => (
                    <Link key={href} href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-lion-soft">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lion-gold/10 text-lion-gold">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium">{title}</span>
                        <span className="mt-0.5 block text-sm text-lion-muted">{description}</span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-lion-muted" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div className="flex flex-col items-center">
              <button
                type="button"
                aria-label="選擇大頭貼"
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
                <label htmlFor="profile-name" className="text-xs text-lion-muted mb-1 block">姓名</label>
                <input
                  id="profile-name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="profile-nickname" className="text-xs text-lion-muted mb-1 block">暱稱（選填）</label>
                <input
                  id="profile-nickname"
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="大家習慣怎麼稱呼你"
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="profile-title" className="text-xs text-lion-muted mb-1 block">職稱／身分</label>
                <select
                  id="profile-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                >
                  <option value="" className="bg-lion-card text-lion-cream">尚未設定</option>
                  {title && !memberTitleOptions.includes(title) && <option value={title} className="bg-lion-card text-lion-cream">{title}</option>}
                  {memberTitleOptions.map((t) => (
                    <option key={t} value={t} className="bg-lion-card text-lion-cream">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="profile-email" className="text-xs text-lion-muted mb-1 block">Email</label>
                <input
                  id="profile-email"
                  autoComplete="email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="profile-phone" className="text-xs text-lion-muted mb-1 block">手機</label>
                <input
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="profile-birthday" className="text-xs text-lion-muted mb-1 block">生日</label>
                <input
                  id="profile-birthday"
                  autoComplete="bday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
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
                          ? "bg-lion-action text-lion-navyDeep border-lion-gold"
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
              <label htmlFor="profile-bio" className="text-xs text-lion-muted mb-1 block">關於我</label>
              <textarea
                id="profile-bio"
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
                disabled={saving}
                className="min-h-12 flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2.5 text-sm disabled:opacity-50"
              >
                {saving ? "儲存中…" : "儲存變更"}
              </button>
            </div>
          </form>
        )}

        {!editing && (
          <>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
              className="mt-5 w-full rounded-xl py-2.5 text-center text-xs text-lion-muted hover:bg-lion-soft"
            >
              登出
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
