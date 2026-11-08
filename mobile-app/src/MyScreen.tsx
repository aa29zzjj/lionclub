import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { createApiClient, ApiError, type Member } from "./contract";
import ProfileScreen from "./ProfileScreen";
import SecurityScreen from "./SecurityScreen";
import AdminScreen from "./AdminScreen";
import ExperienceScreen from "./ExperienceScreen";
import Avatar from "./Avatar";
import NotificationSettings, { type MobilePushUi } from "./NotificationSettings";
import { colorFromId } from "../../src/lib/avatar-color";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type View = "overview" | "profile" | "admin" | "experience";

/** The native "我的" tab — mirrors the website's /profile page, which combines
 * identity, security tools and (for officers) admin tool links on one page
 * rather than splitting them across separate top-level destinations. */
export default function MyScreen({
  member,
  onUpdated,
  onLogout,
  busy,
  push,
  accountMessage,
}: {
  member: Member;
  onUpdated: (member: Member) => void;
  onLogout: () => void;
  busy: boolean;
  push: MobilePushUi;
  accountMessage?: string | null;
}) {
  const [view, setView] = useState<View>("overview");
  const isAdmin = Array.isArray(member.adminRoles) && member.adminRoles.length > 0;
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ memberId: string; email: string; text: string } | null>(null);
  const [openingWebsite, setOpeningWebsite] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const resendLock = useRef(false);
  const websiteLock = useRef(false);
  const identity = useRef({ id: member.id, email: member.email });
  identity.current = { id: member.id, email: member.email };
  const resendNotice = resendMessage?.memberId === member.id && resendMessage.email === member.email ? resendMessage.text : null;
  useEffect(() => { setResendMessage(null); }, [member.id, member.email]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { screenRef.current?.closest(".shell-content")?.scrollTo(0, 0); }, [view]);

  async function handleResendVerification() {
    if (resendLock.current || busy) return;
    resendLock.current = true;
    const owner = identity.current, isCurrent = api.captureSessionGuard();
    const visible = () => mounted.current && isCurrent() && identity.current.id === owner.id && identity.current.email === owner.email;
    setResending(true);
    setResendMessage(null);
    try {
      await api.resendVerificationEmail();
      if (visible()) setResendMessage({ memberId: owner.id, email: owner.email, text: "寄送請求已確認，請至信箱查看驗證信；實際送達時間仍取決於郵件服務。" });
    } catch (failure) {
      if (visible()) setResendMessage({ memberId: owner.id, email: owner.email, text: failure instanceof ApiError ? failure.message : "寄送請求尚未確認，請稍後再試。" });
    } finally {
      resendLock.current = false;
      if (mounted.current) setResending(false);
    }
  }

  async function openWebsite(target: "profile" | "delete") {
    if (websiteLock.current || busy) return;
    websiteLock.current = true;
    const isCurrent = api.captureSessionGuard();
    setOpeningWebsite(true); setWebsiteError(null);
    try {
      await Browser.open({ url: target === "profile" ? "https://lionclubsmembership.com/profile" : "https://lionclubsmembership.com/account/delete", presentationStyle: "popover" });
    } catch {
      if (mounted.current && isCurrent()) setWebsiteError("無法開啟帳號管理網頁，請確認連線後重試。App 內的設定尚未變更。");
    } finally { websiteLock.current = false; if (mounted.current) setOpeningWebsite(false); }
  }

  if (view === "profile") {
    return (
      <div ref={screenRef}>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <ProfileScreen member={member} onUpdated={onUpdated} />
      </div>
    );
  }

  if (view === "admin") {
    return (
      <div ref={screenRef}>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <AdminScreen member={member} />
      </div>
    );
  }

  if (view === "experience") {
    return (
      <div ref={screenRef}>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <ExperienceScreen />
      </div>
    );
  }

  return (
    <div className="my-screen" ref={screenRef}>
      <div className="my-screen-header">
        <h1 className="my-screen-title">我的檔案</h1>
        <button type="button" className="my-screen-edit-button" onClick={() => setView("profile")}>
          編輯我的檔案
        </button>
      </div>

      {!member.emailVerifiedAt ? (
        <div className="my-screen-section" style={{ borderTop: "none", borderRadius: "1rem", border: "2px solid rgb(253 162 155 / 0.5)", padding: "1rem" }}>
          <h2 className="section-title" style={{ color: "rgb(var(--lion-danger))" }}>Email 尚未驗證</h2>
          <p className="member-meta">請至 {member.email} 收取驗證信並完成驗證，以確保帳號安全。</p>
          {resendNotice ? <p className="member-meta" role="status" style={{ marginTop: "0.4rem" }}>{resendNotice}</p> : null}
          <button type="button" className="secondary" disabled={resending || busy} onClick={() => void handleResendVerification()} style={{ marginTop: "0.5rem" }}>
            {resending ? "寄送中…" : "重新寄送驗證信"}
          </button>
        </div>
      ) : null}

      <div className="my-screen-card">
        <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={64} />
        <div>
          <p className="member-name">{member.nickname || member.name}</p>
          <p className="member-meta">
            {member.organization?.name ?? "尚未分派分會"} · {member.title ?? "會員"}
          </p>
          {member.memberNo ? <p className="member-meta">會員編號 {member.memberNo}</p> : null}
        </div>
      </div>

      <section className="my-screen-section">
        <h2 className="section-title">獅子會資歷</h2>
        <button type="button" className="secondary" onClick={() => setView("experience")}>
          管理我的資歷
        </button>
      </section>

      <NotificationSettings push={push} />

      <section className="my-screen-section">
        <h2 className="section-title">帳號登入方式</h2>
        {websiteError ? <p className="error" role="alert">{websiteError}</p> : null}
        <p className="member-meta">綁定 Google／Apple 帳號請至網站操作，需要重新驗證身分。</p>
        <button
          type="button"
          className="secondary"
          disabled={openingWebsite || busy}
          onClick={() => void openWebsite("profile")}
        >
          前往網站管理登入方式
        </button>
      </section>

      <section className="my-screen-section">
        <h2 className="section-title">刪除帳號</h2>
        <p className="member-meta">刪除帳號需要重新驗證身分，請至網站完成操作。</p>
        <button
          type="button"
          className="secondary"
          disabled={openingWebsite || busy}
          onClick={() => void openWebsite("delete")}
        >
          前往網站刪除帳號
        </button>
      </section>

      {isAdmin ? (
        <section className="my-screen-section">
          <h2 className="section-title">幹部管理工具</h2>
          <button type="button" className="secondary" onClick={() => setView("admin")}>
            開啟幹部管理
          </button>
        </section>
      ) : null}

      <section className="my-screen-section">
        <SecurityScreen />
      </section>

      {accountMessage && <p role="alert" className="error">{accountMessage}</p>}
      <button type="button" className="secondary logout-button" onClick={onLogout} disabled={busy}>
        {busy ? "登出中…" : "登出"}
      </button>
    </div>
  );
}
