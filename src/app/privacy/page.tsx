import type { Metadata } from "next";
import Link from "next/link";
import PublicServicePage, { ServiceContactDetails } from "@/components/PublicServicePage";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy-policy";

export const metadata: Metadata = { title: "隱私權政策與資料處理說明｜LionClubs" };

export default function PrivacyPage() {
  return <PublicServicePage title="隱私權政策與資料處理說明">
    <p className="text-sm text-lion-muted">更新日期：{PRIVACY_POLICY_VERSION}。本說明涵蓋 LionClubs 網站與 iOS App；實際功能依服務設定、發布版本及您的選擇提供。服務與聯絡資訊列於下方；部分資料保存期限及處理安排仍待服務持有人確認，未確認事項會於相關段落標示。</p>
    <section><h2 className="mb-3 text-lg font-semibold">服務與聯絡</h2><ServiceContactDetails /></section>
    <section><h2 className="text-lg font-semibold">使用哪些資料、用在哪裡？</h2><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>姓名、Email 與登入方式用於建立及辨識帳號；以密碼加入者的密碼以雜湊保存，不會在頁面顯示。手機、生日、頭像、介紹、標籤及資歷由您選擇填寫，供會員交流與會籍／任職資料管理。手機不是登入帳號。</li>
      <li>會員編號、分會、授權角色、審核與分派歷史用於會籍核對及權限管理。填寫職稱不會自動取得管理權限。</li>
      <li>好友關係、會員 QR 中的會員識別碼、活動、報名、報到與站內通知，用於交友、活動參與及必要聯繫。好友檔案依可見範圍顯示，活動聯絡名單限授權管理者存取。</li>
      <li>網站登入 Cookie、App 登入憑證、驗證／重設 Token 雜湊與操作限流紀錄用於登入及防濫用。請勿公開邀請連結、密碼、登入憑證或有效驗證連結。</li>
    </ul></section>
    <section><h2 className="text-lg font-semibold">第三方登入與名冊帶入</h2>
      <p className="mt-3">Google 與 Apple 登入依服務設定及登入畫面提供，尚未開放的方式不能使用。您會前往相應服務授權；本平台核驗其唯一識別碼及已驗證信箱，姓名只作為可更正的填寫提示，不讀取聯絡人、郵件內容或社群貼文。Meta 登入尚未提供。</p>
      <p className="mt-3">新會員仍須有效邀請，確認隱私與條款，以及第三方資料使用同意。既有同信箱帳號不會自動合併；連結新登入方式須先登入本人帳號並完成本人再驗證。第三方唯一識別碼與信箱保存在登入連結中；提供 Apple 登入時，供撤銷使用的憑證以加密方式保存，刪除相關帳號時須依可用流程完成撤銷。</p>
      <p className="mt-3">年度名冊比對是獨立、可選的同意：到「我的資歷」決定是否啟用，以姓名及已確認分會比對，僅有自述分會時顯示待核對候選。本批來源沒有電話或 Email，不會假稱已核對電話。比對不等於本人身分驗證，帶入的是待核實草稿，不會建立其他人的登入帳號、連結本人或授予幹部權限。撤回會停止後續比對，但不會自動刪除已由您建立的草稿或原始年度名冊；本人草稿可另行編輯或刪除。原始名冊的來源授權、揭露範圍與保存規則仍須由營運方確認。</p>
      <p className="mt-3">組織層級可由有效會員查看；具名年度幹部目錄須先由營運者確認來源與揭露授權，再依已確認會籍的內部範圍提供必要的職稱與姓名，不公開電話、Email 或完整名冊下載。</p>
    </section>
    <section><h2 className="text-lg font-semibold">安全操作的信箱本人驗證</h2>
      <p className="mt-3">服務開放此方式且帳號符合條件時，只有 Apple 登入、沒有本機密碼的帳號，可向其既有且經 Apple 驗證的登入信箱取得驗證碼，包括 Apple 隱藏信箱。收件地址由既有登入紀錄決定，不使用個人檔案中自行修改的信箱。若該信箱尚未確認、無法寄達或服務未開放，介面會拒絕操作；不會因此視為已完成刪帳申請。</p>
      <p className="mt-3">此流程用於連結另一種登入方式、登出其他裝置或刪除本人帳號，每次驗證只適用指定操作、本人帳號及當時登入狀態。驗證碼 10 分鐘內有效；驗證完成後的操作確認期限為 5 分鐘，仍須由您親自按下該操作，不會自動執行。這是信箱持有者驗證，不代表 Apple 已再次要求密碼或 Face ID 驗證。</p>
      <p className="mt-3">為寄送、防濫用及核對操作，服務會保存帳號與登入狀態的關聯、既有 Apple 登入識別及驗證信箱快照、指定操作、驗證碼與一次性操作憑證的雜湊、寄送狀態、嘗試次數及驗證／使用／失效時間；不保存可還原的驗證碼。寄信服務會處理收件信箱、驗證碼與指定操作。重新寄碼、登入狀態或登入身分變更可能使原驗證失效。到期即不可用，但不代表資料已從資料庫、寄信日誌或備份即時清除；現有流程僅在主動取得新驗證碼時分批清理過期紀錄，固定清理排程與保存期限仍待營運方確認。</p>
    </section>
    <section><h2 className="text-lg font-semibold">相機、照片與裝置儲存</h2>
      <p className="mt-3">掃描 QR 或拍攝活動封面時才請求相機。網站由瀏覽器處理相機權限；iOS App 掃描 QR 時會拍攝圖片並在裝置辨識，不會把 QR 拍攝圖片當作辨識請求上傳。您主動選擇並執行上傳流程的頭像／活動圖片會傳送至圖片儲存服務。程式未主動要求讀取通訊錄或裝置定位；活動場地仍可由主辦者手動填寫。相機權限可在瀏覽器或 iPhone 設定中調整。</p>
      <p className="mt-3">網站以 HttpOnly 登入 Cookie 維持狀態，另在瀏覽器保存日夜主題偏好。iOS App 使用存取與更新憑證，保存在裝置的 Keychain 安全儲存中；通知選擇、隨機安裝識別碼及通知登記版本亦使用裝置安全儲存。解除安裝不等於保證清除所有裝置安全儲存或伺服器資料；要移除帳號資料，請使用本人刪除流程。</p>
    </section>
    <section><h2 className="text-lg font-semibold">可選的 iOS 手機通知</h2>
      <p className="mt-3">App 內通知與 iOS 手機推播是不同通道。只有在服務已開放、您選擇「開啟此裝置通知」並取得系統通知權限後，App 才會登記手機推播；不開啟仍可在 App 內查看通知。此功能用於活動公告、好友邀請及審核結果，不發送行銷訊息。</p>
      <p className="mt-3">推播登記包含隨機安裝識別碼、APNs 推播 token、通知設定，以及與本人帳號／會員及登入狀態的關聯。伺服器以加密 token 與雜湊管理投遞，並保存通知類型、來源識別、讀取及傳送狀態。這些資料與帳號有關聯，不會因加密或雜湊就變成匿名資料。</p>
      <p className="mt-3">推播透過 Apple Push Notification service（APNs）傳送。Apple 會接收投遞所需的推播 token、通用通知內容及通知類型；鎖定畫面只顯示通用提示，不放姓名、活動原文或審核理由。實際內容須登入 App 後依權限讀取。是否顯示通知仍受網路、專注模式及系統設定影響。</p>
      <p className="mt-3">您可在 App「手機通知」選擇「暫停此裝置通知」，或在 iPhone 設定撤回通知權限；網路中斷時，停用結果可能尚未同步，請恢復連線後確認。已交付系統的通知不保證能收回。停用不等於所有登記、通知或傳送紀錄都即時移除；使用有效期屆滿也不代表資料已從儲存或備份刪除，實際保存與清除期限仍待營運方確認。</p>
    </section>
    <section><h2 className="text-lg font-semibold">服務提供者與資料安全</h2><p className="mt-3">網站及 App 的平台服務使用 AWS 的託管、資料庫、圖片儲存及寄信服務；iOS 推播另使用 Apple APNs，第三方登入使用登入畫面提供的相應服務。實際處理區域、存取權限、委外處理安排、服務日誌與備份期限仍須由營運方確認；沒有廣告 SDK 不等於整個服務不處理資料。</p><p className="mt-3">會員資料由登入及組織權限限制存取；重設密碼、撤銷其他裝置或移除帳號後，伺服器會重新檢查登入資格。不要把登入密碼交給幹部代辦人。</p></section>
    <section id="deletion" className="scroll-mt-4 rounded-2xl border border-lion-border bg-lion-card p-4"><h2 className="text-lg font-semibold">修改、刪除與保留範圍</h2><p className="mt-3">您可從個人檔案修改自填資料，或在下方刪帳頁登入並以本人登入方式重新驗證，再明確確認刪除，不需重新安裝 App。若第三方重新驗證或撤銷服務尚未可用，介面會拒絕刪除並告知，不能視為已完成或已受理申請。</p><ul className="mt-3 list-disc space-y-3 pl-5">
      <li>刪帳會移除登入帳號與重設／驗證 Token、清除個人聯絡及檔案欄位、本人資歷、好友／封鎖關係及本人收到的通知；發送通知的原文字改為已刪除說明。</li>
      <li>為避免破壞其他人的活動及報到，會保留「已刪除會員」的識別錨點、共享活動／報到及受限的審核、分派、檢舉、同意目的／版本／時間等稽核紀錄。活動介紹／圖片與稽核原因可能包含原先填寫的文字，不會整批永久清除。這些資料、原始年度名冊、操作日誌、備份、儲存歷史版本及快取的實際保存與清除期限，仍待營運方核定及確認，現不承諾固定保存或刪除天數。第三方短期驗證資料逾時即不可使用，但使用有效期不等於物理刪除，亦不代表資料已從所有儲存與備份消失。</li>
      <li>仍有有效／預定幹部權限或未來主辦活動會被拒絕刪除，須先由授權管理者處理交接。拒絕不是已建立待辦申請；目前沒有交接中的刪帳申請佇列。</li>
      <li>頭像檔案以延後的清理工作處理，可能因排程、設定或失敗重試延後；帳號刪除與圖片儲存清理不是同一個完成時間。資料庫移除不等於圖片檔案、歷史版本、快取及備份都即刻消失，實際清理排程與期限仍待營運確認。</li>
    </ul><Link href="/account/delete" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-lion-action px-4 font-semibold text-lion-navyDeep">前往本人刪除流程</Link></section>
    <section><h2 className="text-lg font-semibold">內容檢舉、封鎖與資料詢問</h2><p className="mt-3">會員頁可檢舉或封鎖會員，個人檔案可查看及解除自己設定的封鎖；解除不會自動恢復好友。內容處理責任及回應安排仍待服務持有人確認；資料詢問可使用現有隱私聯絡資訊。</p><Link href="/support" className="touch-link mt-2 inline-flex text-lion-gold underline">查看客服與協助</Link></section>
  </PublicServicePage>;
}
