import type { Metadata } from "next";
import PublicServicePage from "@/components/PublicServicePage";
import AccountDeletionPanel from "@/components/AccountDeletionPanel";
import Link from "next/link";

export const metadata: Metadata = { title: "刪除帳號｜LionClubs", robots: { index: false, follow: true } };

export default function AccountDeletionPage() {
  return <PublicServicePage title="刪除帳號與資料">
    <p>您可以在此網站確認本人身分並刪除帳號，不需安裝 App。請先閱讀以下範圍，確認操作帳號後再提交；此頁不接受代辦他人帳號。</p>
    <a href="#deletion-action" className="flex min-h-12 items-center justify-center rounded-xl bg-lion-action px-4 font-semibold text-lion-navyDeep">前往本人身分確認</a>
    <section aria-labelledby="deletion-scope" className="rounded-2xl border border-lion-border bg-lion-card p-4">
      <h2 id="deletion-scope" className="text-lg font-semibold">刪除後會發生什麼？</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>登入帳號、重設／驗證 Token、私有檔案、本人資歷及好友／封鎖關係會移除；其他裝置也會失去存取權。</li>
        <li>本人尚未報到的報名取消；已報到紀錄、共享活動與受限稽核保留，避免損害其他會員。系統保留「已刪除會員」的識別錨點。</li>
        <li>共享活動介紹、圖片及稽核原因可能包含原先填寫的文字，不會因本操作全部永久清除；保留範圍與期限仍須由營運方定案。</li>
        <li>頭像清理至少等待舊上傳連結失效後再由排程執行，可能重試；資料庫刪除成功不代表影像、快取與備份立即全清。</li>
      </ul>
      <p className="mt-3 text-sm text-lion-muted">仍有有效／預定幹部權限或未來主辦活動時，須先完成交接，本次刪除會被拒絕。系統尚未提供交接中的刪除申請佇列；未成功不得視為已送出申請。</p>
      <Link href="/privacy#deletion" className="touch-link mt-3 inline-flex text-lion-gold underline">閱讀完整刪除及保留說明</Link>
    </section>
    <AccountDeletionPanel />
  </PublicServicePage>;
}
