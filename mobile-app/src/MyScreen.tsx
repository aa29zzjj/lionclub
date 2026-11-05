import { useState } from "react";
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
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleResendVerification() {
    setResending(true);
    setResendMessage(null);
    try {
      await api.resendVerificationEmail();
      setResendMessage("驗證信已寄出，請至信箱收取");
    } catch (failure) {
      setResendMessage(failure instanceof ApiError ? failure.message : "寄送失敗，請稍後再試");
    } finally {
      setResending(false);
    }
  }

  if (view === "profile") {
    return (
      <div>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <ProfileScreen member={member} onUpdated={onUpdated} />
      </div>
    );
  }

  if (view === "admin") {
    return (
      <div>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <AdminScreen member={member} />
      </div>
    );
  }

  if (view === "experience") {
    return (
      <div>
        <button type="button" className="profile-back" onClick={() => setView("overview")}>
          ‹ 返回
        </button>
        <ExperienceScreen />
      </div>
    );
  }

  return (
    <div className="my-screen">
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
          {resendMessage ? <p className="member-meta" role="status" style={{ marginTop: "0.4rem" }}>{resendMessage}</p> : null}
          <button type="button" className="secondary" disabled={resending} onClick={handleResendVerification} style={{ marginTop: "0.5rem" }}>
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
        <p className="member-meta">綁定 Google／Apple 帳號請至網站操作，需要重新驗證身分。</p>
        <button
          type="button"
          className="secondary"
          onClick={() => void Browser.open({ url: "https://lionclubsmembership.com/profile", presentationStyle: "popover" })}
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
          onClick={() => void Browser.open({ url: "https://lionclubsmembership.com/account/delete", presentationStyle: "popover" })}
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
