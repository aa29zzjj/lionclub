import type { ReactNode } from "react";
import Link from "next/link";
import AppShell from "./AppShell";
import metadata from "../../docs/app-store/METADATA.zh-Hant.json";

// Server-rendered public fields only. Never pass the review/contact metadata
// object to a client component: future review credentials must remain private.
const legalEntity: string | null = metadata.app.legalEntityName;
const supportEmail: string | null = metadata.contacts.supportEmail;
const privacyEmail: string | null = metadata.contacts.privacyEmail;
// Preserve the contact already published in the existing privacy/support pages.
// Its ownership and formal support/privacy remit still need holder confirmation.
const existingWebsiteContact = "jaijai0830@gmail.com";
const validEmail = (value: string | null): value is string => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function ServiceContactDetails() {
  return <div className="space-y-2 text-base leading-relaxed">
    <p>服務名稱：{metadata.app.name}{!metadata.app.nameConfirmed ? "（名稱及品牌資料待持有人確認）" : !metadata.app.brandAuthorizationConfirmed ? "（品牌使用權仍待核對）" : ""}</p>
    <p>營運主體：{legalEntity || "法定名稱尚待服務持有人補齊"}</p>
    <p>客服聯絡：<a className="touch-link break-all text-lion-gold underline" href={`mailto:${validEmail(supportEmail) ? supportEmail : existingWebsiteContact}`}>{validEmail(supportEmail) ? supportEmail : existingWebsiteContact}</a></p>
    <p>隱私聯絡：<a className="touch-link break-all text-lion-gold underline" href={`mailto:${validEmail(privacyEmail) ? privacyEmail : existingWebsiteContact}`}>{validEmail(privacyEmail) ? privacyEmail : existingWebsiteContact}</a></p>
    {(!validEmail(supportEmail) || !validEmail(privacyEmail)) && <p className="text-sm text-lion-muted">以上未另指定的聯絡信箱沿用既有網站公開資訊；信箱持有人、正式客服／隱私責任及回應安排仍待服務持有人確認，不承諾處理時限。</p>}
    {(!legalEntity || !validEmail(supportEmail) || !validEmail(privacyEmail)) && <p className="text-sm text-lion-muted">未確認項目不能視為商店上架資料已完成。請勿傳送密碼或驗證碼給任何代辦人。</p>}
  </div>;
}

export default function PublicServicePage({ title, children }: { title: string; children: ReactNode }) {
  return <AppShell showNav={false}><main className="px-5 pb-10 pt-6">
    <div className="flex flex-wrap justify-between gap-3"><Link href="/login" className="touch-link inline-flex min-h-12 items-center text-base text-lion-gold">← 返回登入</Link><Link href="/profile" className="touch-link inline-flex min-h-12 items-center text-base text-lion-gold">個人檔案 →</Link></div>
    <p className="mt-3 text-sm font-medium text-lion-muted">{metadata.app.name} · 會員服務網站</p>
    <h1 className="mt-3 text-2xl font-bold">{title}</h1>
    <div className="mt-5 space-y-6 text-base leading-relaxed">{children}</div>
    <nav aria-label="服務與隱私連結" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-lion-border pt-4 text-base">
      <Link className="touch-link text-lion-gold underline" href="/privacy">隱私權政策</Link>
      <Link className="touch-link text-lion-gold underline" href="/support">客服與協助</Link>
      <Link className="touch-link text-lion-gold underline" href="/account/delete">刪除帳號</Link>
    </nav>
  </main></AppShell>;
}
