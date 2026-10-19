import type { Metadata } from "next";
import Link from "next/link";
import PublicServicePage, { ServiceContactDetails } from "@/components/PublicServicePage";
import { TERMS_VERSION } from "@/lib/terms";

export const metadata: Metadata = { title: "使用條款｜LionClubs" };

export default function TermsPage() {
  return <PublicServicePage title="使用條款">
    <p className="text-sm text-lion-muted">版本：{TERMS_VERSION}。註冊或發布活動前，請閱讀並同意以下條款。</p>
    <section><h2 className="text-lg font-semibold">適用對象與帳號</h2><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>本服務提供獅子會會員交流、活動與資歷管理。請以本人真實資料註冊，並妥善保管密碼，不得冒用他人身分。</li>
      <li>填寫的職稱、資歷不等於官方任命或管理授權；管理權限僅由授權管理者依程序授予。</li>
    </ul></section>
    <section><h2 className="text-lg font-semibold">不容忍的內容與行為</h2><p className="mt-3">本服務對下列內容與行為採零容忍，一經查證將移除內容，並可能停權：</p><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>騷擾、霸凌、威脅、歧視、仇恨或人身攻擊他人。</li>
      <li>色情、暴力、血腥或其他令人不適的內容。</li>
      <li>詐騙、冒用身分、散布他人個資、垃圾訊息或未經同意的商業宣傳。</li>
      <li>違反法令，或侵害他人智慧財產權、肖像權、隱私權的內容。</li>
      <li>以個人或商業目的假冒獅子會正式活動，誤導其他會員。</li>
    </ul></section>
    <section><h2 className="text-lg font-semibold">檢舉與封鎖</h2><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>任何會員都可以在會員頁檢舉該會員，或在活動頁檢舉活動內容；也可以封鎖會員，封鎖後雙方無法互相加好友、搜尋到對方或查看對方的檔案。</li>
      <li>檢舉由授權管理者審核。查證屬實時，管理者可以移除違規活動內容，或停權違規帳號（停權後該帳號所有登入立即失效）。</li>
      <li>營運方將儘速審核檢舉（內部目標為 24 小時內初步處理）；處理結果以站內或聯絡信箱通知為準。</li>
      <li>惡意或不實的檢舉本身也屬於違規行為。</li>
    </ul></section>
    <section><h2 className="text-lg font-semibold">您發布的內容</h2><p className="mt-3">您對自己發布的活動、頭像、介紹等內容負責，並保證有權發布。您同意營運方為執行本條款，得移除違規內容或停權帳號。個人資料如何使用與刪除，請見<Link href="/privacy" className="text-lion-gold underline mx-1">隱私權政策</Link>。</p></section>
    <section><h2 className="text-lg font-semibold">聯絡我們</h2><ServiceContactDetails /></section>
  </PublicServicePage>;
}
