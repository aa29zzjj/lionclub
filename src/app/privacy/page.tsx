import type { Metadata } from "next";
import Link from "next/link";
import PublicServicePage, { ServiceContactDetails } from "@/components/PublicServicePage";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy-policy";

export const metadata: Metadata = { title: "隱私權政策與資料處理說明｜LionClubs" };

export default function PrivacyPage() {
  return <PublicServicePage title="隱私權政策與資料處理說明">
    <p className="text-sm text-lion-muted">更新日期：{PRIVACY_POLICY_VERSION}。以下如實說明目前網站程式的資料處理；營運主體、正式聯絡、部分保留期限與商店隱私宣告仍待服務持有人確認，並非已完成上架合規驗收。</p>
    <section><h2 className="mb-3 text-lg font-semibold">服務與聯絡</h2><ServiceContactDetails /></section>
    <section><h2 className="text-lg font-semibold">使用哪些資料、用在哪裡？</h2><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>姓名、Email 與登入方式用於建立及辨識帳號；以密碼加入者的密碼以雜湊保存，不會在頁面顯示。手機、生日、頭像、介紹、標籤及資歷由您選擇填寫，供會員交流與會籍／任職資料管理。手機不是登入帳號。</li>
      <li>會員編號、分會、授權角色、審核與分派歷史用於會籍核對及權限管理。填寫職稱不會自動取得管理權限。</li>
      <li>好友關係、會員 QR 中的會員識別碼、活動、報名、報到與站內通知，用於交友、活動參與及必要聯繫。好友檔案依可見範圍顯示，活動聯絡名單限授權管理者存取。</li>
      <li>登入 Cookie、驗證／重設 Token 雜湊與操作限流記錄用於登入及防濫用。請勿公開邀請連結、密碼或有效驗證連結。</li>
    </ul></section>
    <section><h2 className="text-lg font-semibold">第三方登入與名冊帶入</h2>
      <p className="mt-3">Google 登入僅在服務完成設定後開放。您會前往 Google 授權；本平台核驗其唯一識別碼及已驗證信箱，姓名只作為可更正的填寫提示，不讀取聯絡人、郵件內容或社群貼文。Apple 登入目前未啟用，Meta 登入尚未提供。</p>
      <p className="mt-3">新會員仍須有效邀請，確認隱私與條款，以及第三方資料使用同意。既有同信箱帳號不會自動合併；連結新登入方式須先登入本人帳號並重新驗證。第三方唯一識別碼與信箱保存在登入連結中。目前無自助刪除帳號功能；本說明不表示已完成任何供應商授權撤銷，也不表示原生 App 或商店已通過驗收。</p>
      <p className="mt-3">年度名冊比對是獨立、可選的同意：到「我的資歷」決定是否啟用，以姓名及已確認分會比對，僅有自述分會時顯示待核對候選。本批來源沒有電話或 Email，不會假稱已核對電話。比對不等於本人身分驗證，帶入的是待核實草稿，不會建立其他人的登入帳號、連結本人或授予幹部權限。撤回會停止後續比對；已由您建立的草稿可另行編輯或刪除。</p>
      <p className="mt-3">組織層級可由有效會員查看；具名年度幹部目錄須先由營運者確認來源與揭露授權，再依已確認會籍的內部範圍提供必要的職稱與姓名，不公開電話、Email 或完整名冊下載。</p>
    </section>
    <section><h2 className="text-lg font-semibold">相機、照片與裝置儲存</h2><p className="mt-3">掃描 QR 時才由瀏覽器請求相機；圖片辨識在前端進行。您主動選擇並儲存的頭像／活動圖片才會上傳；程式未要求讀取通訊錄或定位。瀏覽器可撤回相機權限。</p><p className="mt-3">網站以 HttpOnly 登入 Cookie 維持狀態，另在瀏覽器保存日夜主題偏好。相機及原生插件權限仍需在未來手機 App 中另外驗收；目前站內通知不是背景推播。</p></section>
    <section><h2 className="text-lg font-semibold">服務提供者與資料安全</h2><p className="mt-3">程式串接 AWS 的網站、資料庫、圖片儲存及寄信服務。實際區域、存取、服務日誌、委外處理及備份期限仍須由營運方確認；沒有廣告 SDK 不等於整個服務不處理資料。</p><p className="mt-3">會員資料由登入及組織權限限制存取；重設密碼、撤銷其他裝置或帳號狀態變更後，伺服器會重新檢查登入資格。不要把登入密碼交給幹部代辦人。</p></section>
    <section id="deletion" className="scroll-mt-4 rounded-2xl border border-lion-border bg-lion-card p-4"><h2 className="text-lg font-semibold">資料修改、功能移除與保留</h2><p className="mt-3">您可從個人檔案修改自填資料。目前無自助刪除帳號功能，舊頁面與 API 不接受刪除操作，也不建立申請或排隊工作。</p><p className="mt-3">您仍可聯絡客服提出隱私詢問；詢問不代表刪除申請已受理、排程或完成，也不承諾刪除時限。保留依據、範圍與期限仍須營運方確認，本說明不免除依法處理資料權利請求的責任。</p><p className="mt-3">功能移除前已提交的頭像清理工作不會因此被取消；共享活動、報到、受限稽核、歷史影像與備份仍依原有保留及維護安排處理。不能宣稱全部歷史資料已即時刪除或去識別。</p></section>
    <section><h2 className="text-lg font-semibold">內容檢舉、封鎖與資料詢問</h2><p className="mt-3">會員頁可檢舉或封鎖會員，個人檔案可查看及解除自己設定的封鎖；解除不會自動恢復好友。內容處理責任、回應安排及正式隱私聯絡尚需持有人補齊。</p><Link href="/support" className="touch-link mt-2 inline-flex text-lion-gold underline">查看現有協助與待補聯絡資訊</Link></section>
  </PublicServicePage>;
}
