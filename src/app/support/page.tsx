import type { Metadata } from "next";
import Link from "next/link";
import PublicServicePage, { ServiceContactDetails } from "@/components/PublicServicePage";

export const metadata: Metadata = { title: "客服與操作協助｜LionClubs" };

export default function SupportPage() {
  return <PublicServicePage title="客服與操作協助">
    <section className="rounded-2xl border border-lion-border bg-lion-card p-4"><h2 className="mb-3 text-lg font-semibold">服務聯絡與待確認事項</h2><ServiceContactDetails /><p className="mt-3 text-sm text-lion-muted">角色或活動交接亦可透過您原先的分會聯絡方式找授權管理者協調；本頁沒有會送進客服系統的留言表，也不假稱已受理案件或承諾處理時間。</p></section>
    <section><h2 className="text-lg font-semibold">可以直接在網站完成的操作</h2><div className="mt-3 grid gap-3">
      <Link href="/account/delete" className="flex min-h-12 items-center rounded-xl border border-lion-border bg-lion-card px-4 py-3 font-semibold">刪除本人帳號與資料 →</Link>
      <Link href="/forgot-password" className="flex min-h-12 items-center rounded-xl border border-lion-border bg-lion-card px-4 py-3">忘記密碼／重新設定密碼 →</Link>
      <Link href="/profile" className="flex min-h-12 items-center rounded-xl border border-lion-border bg-lion-card px-4 py-3">個人檔案、封鎖名單與其他裝置登出 →</Link>
    </div></section>
    <section><h2 className="text-lg font-semibold">分會、角色與刪帳交接</h2><p className="mt-3">正式分會由授權管理者依名單核對分派；自填職稱不會授權。資歷審核人員不一定具有邀請、會員管理或角色管理權限。</p><p className="mt-3">刪帳若因幹部權限或未來主辦活動被拒絕，表示尚未完成，也沒有建立待辦申請。請先由另一位有權管理者完成角色撤銷／活動交接，再回刪帳頁操作。交接中申請與營運處理時限仍待服務持有人制定。</p></section>
    <section><h2 className="text-lg font-semibold">反映問題時請保護資料</h2><p className="mt-3">可記錄發生時間、所在頁面、錯誤文字及去個資截圖；不要提供密碼、驗證碼、完整邀請連結、Cookie、會員名單或他人的個人資料。先確認網路並重試，不要在不明網頁重新輸入帳密。</p></section>
  </PublicServicePage>;
}
