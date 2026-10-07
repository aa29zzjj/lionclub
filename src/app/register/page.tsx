"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QrCode from "@/components/QrCode";
import { clubOptions, mockInvite, memberTitleOptions, tagOptions } from "@/lib/mock-data";

type Step = "invite" | "profile" | "done";

export default function RegisterPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("invite");

  const [clubId, setClubId] = useState("");
  const [pin, setPin] = useState("");
  const [inviteError, setInviteError] = useState("");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState(memberTitleOptions[0]);
  const [bio, setBio] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [profileError, setProfileError] = useState("");

  const selectedClub = clubOptions.find((c) => c.id === clubId);

  function fillFromQrDemo() {
    setClubId(mockInvite.clubId);
    setPin(mockInvite.pin);
    setInviteError("");
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clubId || !pin) {
      setInviteError("請選擇分會並輸入邀請 PIN 碼");
      return;
    }
    if (pin !== mockInvite.pin) {
      setInviteError("PIN 碼不正確，請向分會幹部確認");
      return;
    }
    setInviteError("");
    setStep("profile");
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) {
      setProfileError("請填寫姓名與 Email");
      return;
    }
    setProfileError("");
    setStep("done");
  }

  return (
    <div className="min-h-screen w-full bg-[#eef0f4] flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-lion-navyDeep text-lion-cream flex flex-col px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-2xl">🦁</span>
          <div>
            <h1 className="text-lg font-bold">獅子會新會員註冊</h1>
            <p className="text-xs text-lion-cream/50">
              {step === "invite" && "步驟 1／3：驗證邀請"}
              {step === "profile" && "步驟 2／3：填寫個人資料"}
              {step === "done" && "步驟 3／3：完成"}
            </p>
          </div>
        </div>

        {step === "invite" && (
          <form onSubmit={handleInviteSubmit} className="flex flex-col gap-5">
            <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-5 flex flex-col items-center">
              <div className="w-36 h-36 rounded-xl overflow-hidden mb-3">
                <QrCode seed="lionclub-invite" />
              </div>
              <p className="text-xs text-lion-cream/50 text-center">
                請用手機掃描分會幹部提供的邀請 QR Code
                <br />
                （示意圖，掃描後會自動帶入下方分會與 PIN 碼）
              </p>
              <button
                type="button"
                onClick={fillFromQrDemo}
                className="mt-3 text-xs text-lion-gold underline underline-offset-2"
              >
                模擬掃描成功
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-lion-cream/40">
              <div className="flex-1 h-px bg-white/10" />
              或手動輸入
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">所屬分會</label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm outline-none focus:border-lion-gold"
              >
                <option value="" className="text-black">
                  請選擇分會
                </option>
                {clubOptions.map((c) => (
                  <option key={c.id} value={c.id} className="text-black">
                    {c.name}
                  </option>
                ))}
              </select>
              {selectedClub && <p className="text-[11px] text-lion-cream/40 mt-1">{selectedClub.path}</p>}
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">邀請 PIN 碼</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="請輸入 6 碼 PIN"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold tracking-widest"
              />
              <p className="text-[11px] text-lion-cream/40 mt-1">PIN 碼由分會會長／財務每年度發放，demo 碼：{mockInvite.pin}</p>
            </div>

            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 hover:bg-lion-goldLight transition-colors"
            >
              下一步
            </button>

            <Link href="/login" className="text-center text-xs text-lion-cream/40">
              已經是會員？返回登入
            </Link>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-5">
            {selectedClub && (
              <div className="rounded-xl bg-lion-gold/10 border border-lion-gold/30 px-4 py-2.5 text-xs text-lion-gold">
                加入分會：{selectedClub.name}
              </div>
            )}

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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-lion-cream/50 mt-2">上傳大頭貼</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">姓名</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="王小明"
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
                />
              </div>
              <div>
                <label className="text-xs text-lion-muted mb-1 block">生日</label>
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div>
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
                  placeholder="you@lions.tw"
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-lion-muted mb-1 block">手機</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xx-xxx-xxx"
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-lion-muted mb-1 block">專長／興趣標籤（選填）</label>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => {
                  const active = selectedTags.includes(tag);
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
              <label className="text-xs text-lion-muted mb-1 block">簡介／經歷（選填）</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="簡單介紹自己的專業背景或參與獅子會的經歷"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold resize-none"
              />
            </div>

            {profileError && <p className="text-sm text-red-400">{profileError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("invite")}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-3 text-sm"
              >
                上一步
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 text-sm hover:bg-lion-goldLight transition-colors"
              >
                送出申請
              </button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-lion-gold/15 border-2 border-lion-gold flex items-center justify-center text-3xl overflow-hidden">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="大頭貼" className="w-full h-full object-cover" />
              ) : (
                "✅"
              )}
            </div>
            <h2 className="text-lg font-bold">已送出入會申請</h2>
            <p className="text-sm text-lion-cream/60 max-w-xs">
              {name} 您好，您的申請將由「{selectedClub?.name}」幹部審核後開通帳號，審核結果將寄送至 {email}。
            </p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 px-8 hover:bg-lion-goldLight transition-colors"
            >
              返回登入頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
