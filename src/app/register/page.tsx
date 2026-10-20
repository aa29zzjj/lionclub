"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { memberTitleOptions, tagOptions } from "@/lib/mock-data";
import PasswordInput from "@/components/PasswordInput";
import FederatedAuthButtons from "@/components/FederatedAuthButtons";

type Step = "invite" | "profile" | "done";
type Onboarding = {
  organization: { id: string; name: string; districtCode: string | null };
  requiresInvite: true;
  inviteMethod: "qr";
  mode: "central";
};
type VerifiedInvite = { token: string; organizationId: string; organizationName: string };
type InviteStatus = "idle" | "loading" | "valid" | "invalid";

const inputClass = "w-full min-w-0 min-h-12 rounded-xl border border-lion-border bg-lion-soft px-4 py-3 text-base text-lion-cream outline-none placeholder:text-lion-muted focus:border-lion-gold";
const primaryButtonClass = "min-h-12 rounded-xl bg-lion-action px-5 py-3 font-semibold text-lion-navyDeep transition-colors hover:bg-lion-actionHover disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass = "min-h-12 rounded-xl border border-lion-border bg-lion-soft px-5 py-3 text-sm font-medium text-lion-cream disabled:cursor-not-allowed disabled:opacity-60";

function isOnboarding(value: unknown): value is Onboarding {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Onboarding>;
  return data.mode === "central" && data.requiresInvite === true && data.inviteMethod === "qr"
    && Boolean(data.organization)
    && typeof data.organization?.id === "string" && Boolean(data.organization.id)
    && typeof data.organization.name === "string" && Boolean(data.organization.name)
    && (data.organization.districtCode === null || typeof data.organization.districtCode === "string");
}

export default function RegisterPage() {
  return <Suspense fallback={<p className="p-8 text-center text-lion-muted" role="status">正在準備註冊…</p>}><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const sourceOrganizationFromUrl = searchParams.get("org")?.trim() ?? "";
  const [step, setStep] = useState<Step>("invite");
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingAttempt, setOnboardingAttempt] = useState(0);
  const [verifiedInvite, setVerifiedInvite] = useState<VerifiedInvite | null>(null);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("idle");
  const [inviteAttempt, setInviteAttempt] = useState(0);
  const [inviteError, setInviteError] = useState("");
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [declaredOrganizationName, setDeclaredOrganizationName] = useState("");
  const [orgSuggestions, setOrgSuggestions] = useState<{ id: string; name: string; districtCode: string | null }[]>([]);
  const [orgSuggestionsOpen, setOrgSuggestionsOpen] = useState(false);
  const [activeOrgIndex, setActiveOrgIndex] = useState(-1);
  const orgListId = useId();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [profileError, setProfileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registeredOrganizationName, setRegisteredOrganizationName] = useState("");
  const [federated, setFederated] = useState<{ provider: string; email: string; hasInvite: boolean } | null>(null);
  const [oauthConsent, setOauthConsent] = useState(false);
  const [federatedNotice, setFederatedNotice] = useState("");
  const completingFederated = searchParams.get("federated") === "1";

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/oauth/pending", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || data?.pending !== true || typeof data.email !== "string") {
          if (completingFederated) setFederatedNotice("第三方驗證已失效或目前無法確認。尚未建立會員帳號，請返回登入頁重新驗證；原邀請仍會在完成註冊時核對。");
          return;
        }
        setFederated({ provider: data.provider, email: data.email, hasInvite: data.hasInvite === true });
        setEmail(data.email);
        if (typeof data.name === "string") setName((current) => current || data.name);
      }).catch(() => { if (!controller.signal.aborted && completingFederated) setFederatedNotice("目前無法確認第三方身分，請返回登入頁重新驗證；沒有自動建立帳號。"); });
    return () => controller.abort();
  }, [completingFederated]);

  const currentVerifiedInvite = verifiedInvite?.token === tokenFromUrl ? verifiedInvite : null;
  const configurationReady = Boolean(onboarding) && !onboardingLoading && !onboardingError;
  const invitationReady = configurationReady && (Boolean(federated?.hasInvite)
    || (Boolean(tokenFromUrl) && inviteStatus === "valid" && Boolean(currentVerifiedInvite)));

  useEffect(() => { if (configurationReady && federated?.hasInvite) setStep("profile"); }, [configurationReady, federated]);

  useEffect(() => {
    const controller = new AbortController();
    setOnboardingLoading(true);
    setOnboardingError("");
    setOnboarding(null);
    async function loadOnboarding() {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok || !isOnboarding(data)) throw new Error("註冊設定目前無法載入，請稍後再試。");
        if (!controller.signal.aborted) setOnboarding(data);
      } catch {
        if (!controller.signal.aborted) setOnboardingError("註冊設定目前無法載入。請確認網路連線後重新載入。");
      } finally {
        if (!controller.signal.aborted) setOnboardingLoading(false);
      }
    }
    void loadOnboarding();
    return () => controller.abort();
  }, [onboardingAttempt]);

  useEffect(() => {
    if (!onboarding || tokenFromUrl || federated?.hasInvite) return;
    setStep("invite");
  }, [onboarding, tokenFromUrl, federated?.hasInvite]);

  useEffect(() => {
    if (!onboarding || !tokenFromUrl) {
      setVerifiedInvite(null);
      setInviteStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStep("invite");
    setVerifiedInvite(null);
    setInviteStatus("loading");
    setInviteError("");
    async function verifyInvite() {
      try {
        const response = await fetch(`/api/invites/verify?token=${encodeURIComponent(tokenFromUrl)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error("目前無法驗證邀請，請確認網路後再試。");
        if (!data?.valid || typeof data.organizationId !== "string" || !data.organizationId
          || typeof data.organizationName !== "string" || !data.organizationName
          || (sourceOrganizationFromUrl && data.organizationId !== sourceOrganizationFromUrl)) {
          throw new Error("這個邀請連結已失效或不正確，請向邀請人索取新的共同邀請連結。");
        }
        if (controller.signal.aborted) return;
        setVerifiedInvite({ token: tokenFromUrl, organizationId: data.organizationId, organizationName: data.organizationName });
        setInviteStatus("valid");
        setStep("profile");
      } catch (error) {
        if (controller.signal.aborted) return;
        setInviteStatus("invalid");
        setInviteError(error instanceof Error ? error.message : "驗證邀請時發生錯誤，請重新嘗試。");
        setStep("invite");
      }
    }
    void verifyInvite();
    return () => controller.abort();
  }, [onboarding, tokenFromUrl, sourceOrganizationFromUrl, inviteAttempt]);

  function handleInviteSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!configurationReady) return;
    if (!federated?.hasInvite && (!tokenFromUrl || !currentVerifiedInvite)) {
      setInviteError("請先完成邀請連結驗證，或使用邀請人提供的新連結。");
      return;
    }
    setInviteError("");
    setStep("profile");
  }

  function toggleTag(tag: string) {
    setSelectedTags((previous) => previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag]);
  }

  useEffect(() => {
    const query = declaredOrganizationName.trim();
    if (!query) {
      setOrgSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/organizations?level=club&q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        setOrgSuggestions(Array.isArray(data?.organizations) ? data.organizations.slice(0, 20) : []);
        setActiveOrgIndex(-1);
      } catch {
        // 搜尋分會清單失敗不影響手動輸入，保留原本文字即可。
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [declaredOrganizationName]);

  useEffect(() => {
    if (orgSuggestionsOpen && activeOrgIndex >= 0) document.getElementById(`${orgListId}-${activeOrgIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeOrgIndex, orgListId, orgSuggestionsOpen]);

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !onboarding || !configurationReady || !invitationReady) return;
    if (!name.trim() || !email.trim()) {
      setProfileError("請填寫姓名與 Email。");
      return;
    }
    if (!federated && password.length < 8) {
      setProfileError("密碼至少需要 8 個字元。");
      return;
    }
    if (!federated && password !== confirmPassword) {
      setProfileError("兩次輸入的密碼不一致。");
      return;
    }
    if (!privacyConsent) {
      setProfileError("請先閱讀並同意隱私權政策與資料處理說明。");
      return;
    }
    if (!termsConsent) {
      setProfileError("請先閱讀並同意使用條款。");
      return;
    }
    if (federated && !oauthConsent) { setProfileError("請先確認第三方身分資料使用同意。"); return; }
    setProfileError("");
    setSubmitting(true);
    try {
      const invitePayload = currentVerifiedInvite ? { token: currentVerifiedInvite.token } : {};
      const response = await fetch(federated ? "/api/auth/oauth/register" : "/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), ...(federated ? { oauthConsent } : { email: email.trim(), password }),
          birthday: birthday || undefined, phone: phone.trim() || undefined,
          title: title || undefined, bio: bio.trim() || undefined, tags: selectedTags,
          declaredOrganizationName: declaredOrganizationName.trim() || undefined, privacyConsent, termsConsent, ...invitePayload,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof data?.error === "string" ? data.error : "註冊失敗，請稍後再試。";
        if (/QR|邀請|invite|token/i.test(message)) {
          setInviteError(message);
          setStep("invite");
          if (tokenFromUrl) { setVerifiedInvite(null); setInviteStatus("invalid"); }
        } else setProfileError(message);
        return;
      }
      if (data?.ok !== true || data?.canLogin !== true || typeof data.organizationName !== "string") {
        setProfileError("帳號登入狀態尚未確認，請返回登入頁嘗試登入；若仍無法登入，請聯絡管理者。");
        return;
      }
      setRegisteredOrganizationName(data.organizationName);
      setPassword("");
      setConfirmPassword("");
      setStep("done");
    } catch {
      setProfileError("連線失敗，填寫內容已保留。請確認網路後再試；若已完成註冊，可直接返回登入頁。");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="app-canvas flex w-full justify-center bg-lion-canvas">
      <div className="app-frame auth-frame flex w-full max-w-[480px] flex-col bg-lion-page px-6 py-10 text-lion-cream">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lions-logo.svg" alt="Lions Clubs International" className="h-full w-full object-contain" />
          </span>
          <div><h1 className="text-lg font-bold">獅子會新會員註冊</h1><p className="mt-0.5 text-xs text-lion-muted">{step === "invite" ? "使用共同邀請加入" : step === "profile" ? "填寫個人資料" : "註冊完成"}</p></div>
        </div>
        {federatedNotice && <div role="alert" className="mb-4 rounded-xl border border-lion-border p-4 text-sm"><p>{federatedNotice}</p><Link href="/login" className="mt-2 inline-flex min-h-12 items-center text-lion-gold underline">重新選擇 Apple／Google 登入</Link></div>}
        {onboardingLoading && <p className="py-10 text-center text-sm text-lion-muted" role="status">正在載入註冊設定…</p>}
        {onboardingError && <div className="rounded-2xl border border-lion-border bg-lion-card p-5">
          <p className="text-sm text-lion-cream" role="alert">{onboardingError}</p>
          <button type="button" className={`${primaryButtonClass} mt-4 w-full`} onClick={() => setOnboardingAttempt((value) => value + 1)}>重新載入</button>
          <Link href="/login" className="mt-2 flex min-h-12 items-center justify-center text-sm text-lion-gold">返回登入</Link>
        </div>}
        {configurationReady && onboarding && step !== "done" && <div className="mb-6 rounded-2xl border border-lion-border bg-lion-card p-5">
          <p className="text-xs text-lion-muted">新帳號統一加入</p>
          <p className="mt-1 font-semibold">{onboarding.organization.name}</p>
          {onboarding.organization.districtCode && <p className="mt-1 text-xs text-lion-muted">{onboarding.organization.districtCode}</p>}
          <p className="mt-3 text-sm leading-relaxed text-lion-muted">掃邀請 QR 註冊完成即可使用。這是平台暫存分會，不代表正式獅子會會籍已核實；之後由授權管理者依名單或分會長確認結果分派。</p>
          {currentVerifiedInvite && <p className="mt-3 border-t border-lion-border pt-3 text-xs leading-relaxed text-lion-muted">邀請來源：{currentVerifiedInvite.organizationName}。邀請來源只供核對，實際加入的是上述中央分會。</p>}
        </div>}
        {configurationReady && onboarding && step === "invite" && <form onSubmit={handleInviteSubmit} className="flex flex-col gap-5">
          {federated && <p role="status" className="rounded-xl border border-lion-border p-3 text-sm">第三方身分已驗證，尚未建立會員帳號。請在本瀏覽器開啟有效邀請 QR 連結，再完成資料與同意；驗證會逾時，請勿將邀請轉貼至公開場所。</p>}
          {federated?.hasInvite && !tokenFromUrl ? <p className="rounded-2xl border border-lion-border bg-lion-card p-5 text-sm">本次第三方驗證已保留邀請。完成註冊時仍會再次核對邀請有效期與名額。</p> : tokenFromUrl ? <div className="rounded-2xl border border-lion-border bg-lion-card p-5">
            {inviteStatus === "loading" && <p className="text-sm text-lion-muted" role="status">正在驗證共同邀請連結…</p>}
            {inviteStatus === "valid" && <p className="text-sm text-lion-gold">邀請已驗證，可以繼續填寫資料。</p>}
            {inviteStatus === "invalid" && <>
              <p className="text-sm text-lion-cream" role="alert">{inviteError}</p>
              <button type="button" className={`${secondaryButtonClass} mt-4 w-full`} onClick={() => setInviteAttempt((value) => value + 1)}>重新驗證邀請</button>
              <p className="mt-3 text-xs leading-relaxed text-lion-muted">請重新掃描現場提供的有效邀請 QR，或向邀請人索取新連結。</p>
            </>}
          </div> : <div>
            <h2 className="mb-3 text-lg font-semibold">請掃描邀請 QR Code</h2>
            <p className="text-sm leading-relaxed text-lion-muted">用手機相機掃描現場的共同邀請 QR，或開啟邀請人分享的 QR 連結，即可填寫資料並立即使用。</p>
            <p className="mt-3 text-xs leading-relaxed text-lion-muted">此頁不提供代碼註冊；必須有有效的邀請連結。</p>
            {inviteError && <p className="mt-3 text-sm text-lion-danger" role="alert">{inviteError}</p>}
          </div>}
          {(tokenFromUrl || federated?.hasInvite) && <button type="submit" disabled={!invitationReady} className={`${primaryButtonClass} w-full`}>下一步</button>}
          <Link href="/login" className="flex min-h-12 items-center justify-center text-sm text-lion-muted">已經是會員？返回登入</Link>
        </form>}
        {configurationReady && onboarding && step === "profile" && <form onSubmit={handleProfileSubmit} className="flex flex-col gap-5" aria-busy={submitting}>
          {!federated && <div className="space-y-3"><p className="text-sm">可先使用 Apple／Google 驗證身分，再完成下方會員資料。</p><FederatedAuthButtons token={currentVerifiedInvite?.token} disabled={submitting || !invitationReady} /><p className="text-center text-sm text-lion-muted">或以 Email／密碼註冊</p></div>}
          <p className="text-base font-medium">{federated ? `已透過 ${federated.provider === "apple" ? "Apple" : "Google"} 驗證；請確認姓名及同意事項，不必設定本機密碼。` : "先填姓名、Email 與密碼即可開始使用；其他資料可稍後補上。"}</p>
          <fieldset disabled={submitting} className="grid grid-cols-1 gap-4">
            <div className="min-[360px]:col-span-2">
              <label htmlFor="register-name" className="mb-1 block text-sm font-medium">姓名</label>
              <input id="register-name" name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="王小明" className={inputClass} />
            </div>
            <div className="min-[360px]:col-span-2">
              <label htmlFor="register-email" className="mb-1 block text-sm font-medium">Email</label>
              <input id="register-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required readOnly={Boolean(federated)} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@lions.tw" className={inputClass} />
            </div>
            {!federated && <div>
              <label htmlFor="register-password" className="mb-1 block text-sm font-medium">設定密碼</label>
              <PasswordInput id="register-password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 個字元" className={inputClass} />
            </div>}
            {!federated && <div>
              <label htmlFor="register-confirm-password" className="mb-1 block text-sm font-medium">確認密碼</label>
              <PasswordInput id="register-confirm-password" name="confirmPassword" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再輸入一次密碼" className={inputClass} />
            </div>}
          </fieldset>
          <details className="rounded-2xl border border-lion-border bg-lion-card p-4">
            <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">補充資料（選填，可稍後補上）</summary>
            <fieldset disabled={submitting} className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="register-birthday" className="mb-1 block text-sm font-medium">生日（選填）</label>
              <input id="register-birthday" name="birthday" type="date" autoComplete="bday" value={birthday} onChange={(event) => setBirthday(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="register-title" className="mb-1 block text-sm font-medium">職稱／身分（選填）</label>
              <select id="register-title" name="title" autoComplete="organization-title" value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass}>
                <option value="">請選擇</option>
                {memberTitleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="register-phone" className="mb-1 block text-sm font-medium">手機（選填）</label>
              <input id="register-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09xx-xxx-xxx" className={inputClass} />
            </div>
            <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOrgSuggestionsOpen(false); }}>
              <label htmlFor="register-declared-organization" className="mb-1 block text-sm font-medium">原所屬分會（選填）</label>
              <input
                id="register-declared-organization"
                name="declaredOrganizationName"
                value={declaredOrganizationName}
                onChange={(event) => { setDeclaredOrganizationName(event.target.value); setOrgSuggestionsOpen(true); setActiveOrgIndex(-1); }}
                onFocus={() => setOrgSuggestionsOpen(true)}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={orgSuggestionsOpen && orgSuggestions.length > 0}
                aria-controls={orgListId}
                aria-activedescendant={orgSuggestionsOpen && activeOrgIndex >= 0 ? `${orgListId}-${activeOrgIndex}` : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { setOrgSuggestionsOpen(false); setActiveOrgIndex(-1); }
                  if (["ArrowDown", "ArrowUp"].includes(event.key) && orgSuggestions.length) {
                    event.preventDefault(); setOrgSuggestionsOpen(true);
                    setActiveOrgIndex((index) => event.key === "ArrowDown" ? (index + 1) % orgSuggestions.length : (index <= 0 ? orgSuggestions.length - 1 : index - 1));
                  }
                  if (event.key === "Enter" && orgSuggestionsOpen && activeOrgIndex >= 0) {
                    event.preventDefault(); setDeclaredOrganizationName(orgSuggestions[activeOrgIndex].name); setOrgSuggestionsOpen(false); setActiveOrgIndex(-1);
                  }
                }}
                placeholder="輸入分會名稱搜尋，或直接手動輸入"
                autoComplete="off"
                aria-describedby="register-declared-organization-help"
                className={inputClass}
              />
              {orgSuggestionsOpen && orgSuggestions.length > 0 && (
                <ul id={orgListId} role="listbox" aria-label="分會搜尋結果" className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-lion-border bg-lion-page shadow-lg">
                  {orgSuggestions.map((org, index) => (
                    <li key={org.id} id={`${orgListId}-${index}`} role="option" aria-selected={activeOrgIndex === index}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setDeclaredOrganizationName(org.name); setOrgSuggestionsOpen(false); setActiveOrgIndex(-1); document.getElementById("register-declared-organization")?.focus(); }}
                        className={`flex min-h-12 w-full flex-col items-start px-4 py-2.5 text-left text-base hover:bg-lion-soft ${activeOrgIndex === index ? "bg-lion-soft" : ""}`}
                      >
                        <span>{org.name}</span>
                        {org.districtCode && <span className="text-xs text-lion-muted">{org.districtCode}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p id="register-declared-organization-help" className="mt-2 text-xs leading-relaxed text-lion-muted">這是待核對的參考資料，不會直接更改加入分會或管理權限。可從清單選擇，或直接手動輸入分會名稱。</p>
            </div>
          </fieldset>
          <fieldset disabled={submitting}>
            <legend className="mb-2 text-sm font-medium">專長／興趣標籤（選填）</legend>
            <div className="flex flex-wrap gap-2">{tagOptions.map((tag) => {
              const active = selectedTags.includes(tag);
              return <button type="button" key={tag} aria-pressed={active} onClick={() => toggleTag(tag)} className={`min-h-12 rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-lion-gold bg-lion-action text-lion-navyDeep" : "border-lion-border bg-lion-soft text-lion-muted"}`}>#{tag}</button>;
            })}</div>
          </fieldset>
          <div>
            <label htmlFor="register-bio" className="mb-1 block text-sm font-medium">簡介／經歷（選填）</label>
            <textarea id="register-bio" name="bio" autoComplete="off" disabled={submitting} value={bio} onChange={(event) => setBio(event.target.value)} rows={3} placeholder="簡單介紹自己的專業背景或獅子會經歷" className={`${inputClass} resize-y`} />
          </div>
          </details>
          <p className="rounded-xl bg-lion-soft p-4 text-sm leading-relaxed text-lion-muted">頭像可以在註冊完成後，到「我的檔案」上傳。</p>
          <label className="flex items-start gap-2.5 rounded-xl border border-lion-border bg-lion-soft px-3.5 py-3 text-sm">
            <input
              type="checkbox"
              checked={privacyConsent}
              onChange={(event) => setPrivacyConsent(event.target.checked)}
              disabled={submitting}
              className="mt-0.5 accent-[#C8A951]"
            />
            <span>
              我已閱讀並同意
              <Link href="/privacy" target="_blank" className="text-lion-gold underline mx-1">隱私權政策與資料處理說明</Link>
              （必填）
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-xl border border-lion-border bg-lion-soft px-3.5 py-3 text-sm">
            <input
              type="checkbox"
              checked={termsConsent}
              onChange={(event) => setTermsConsent(event.target.checked)}
              disabled={submitting}
              className="mt-0.5 accent-[#C8A951]"
            />
            <span>
              我已閱讀並同意
              <Link href="/terms" target="_blank" className="text-lion-gold underline mx-1">使用條款</Link>
              ，包含不得發布違規內容及檢舉與停權規則（必填）
            </span>
          </label>
          {federated && <label className="flex items-start gap-2.5 rounded-xl border border-lion-border bg-lion-soft px-3.5 py-3 text-sm"><input type="checkbox" checked={oauthConsent} onChange={(event) => setOauthConsent(event.target.checked)} disabled={submitting} className="mt-0.5" /><span>我同意使用所選第三方的唯一識別碼、已驗證信箱及我確認的姓名建立登入帳號。會籍、名冊資歷與幹部權限須另行核對，不會自動授權（第三方註冊必填）。</span></label>}
          {profileError && <p className="text-sm text-lion-danger" role="alert">{profileError}</p>}
          <div className="flex gap-3">
            <button type="button" disabled={submitting} onClick={() => setStep("invite")} className={`${secondaryButtonClass} flex-1`}>查看邀請</button>
            <button type="submit" disabled={submitting || !invitationReady || !privacyConsent || !termsConsent || Boolean(federated && !oauthConsent)} className={`${primaryButtonClass} flex-1`}>{submitting ? "正在註冊…" : "完成註冊並開通"}</button>
          </div>
          <Link href="/login" className="flex min-h-12 items-center justify-center text-sm text-lion-muted" aria-disabled={submitting} onClick={(event) => { if (submitting) event.preventDefault(); }}>已有帳號？返回登入</Link>
        </form>}
        {step === "done" && <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-lion-gold bg-lion-gold/10 text-3xl text-lion-gold" aria-hidden="true">✓</div>
          <h2 className="text-xl font-bold">註冊完成，可立即使用</h2>
          <p className="max-w-sm text-sm leading-relaxed text-lion-muted">{name} 您好，您已加入「{registeredOrganizationName}」，可以開始使用會員檔案、好友與活動功能。</p>
          <p className="max-w-sm text-sm leading-relaxed text-lion-muted">正式會員名單核對後，授權管理者會再分派至您的所屬分會。</p>
          <Link href="/profile/experience" className={`${secondaryButtonClass} w-full`}>查看名冊帶入與歷任資歷（需另行同意）</Link>
          <button type="button" onClick={() => { router.push("/home"); router.refresh(); }} className={`${primaryButtonClass} mt-3 w-full`}>開始使用</button>
        </div>}
      </div>
    </div>
  );
}
