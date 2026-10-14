import Link from "next/link";

const CONTACT_EMAIL = "jaijai0830@gmail.com";
const APP_NAME = "獅子會 App";

export const metadata = { title: `隱私權政策 - ${APP_NAME}` };

export default function PrivacyPage() {
  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className="app-frame w-full max-w-[640px] bg-lion-page text-lion-cream px-6 py-10">
        <Link href="/login" className="text-sm text-lion-gold">← 返回登入</Link>
        <h1 className="text-2xl font-bold mt-4 mb-1">隱私權政策</h1>
        <p className="text-xs text-lion-muted mb-8">最後更新：2026 年 10 月</p>

        <div className="flex flex-col gap-6 text-sm leading-relaxed text-lion-cream/90">
          <section>
            <h2 className="font-semibold text-base mb-2">我們蒐集哪些資料</h2>
            <p>
              使用{APP_NAME}時，我們會蒐集您主動提供的資料，包含：姓名、暱稱、Email、電話、生日、大頭貼照片、所屬分會、獅子會任職資歷、活動報名與報到紀錄，以及您與其他會員之間的好友關係。
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">我們如何使用這些資料</h2>
            <ul className="list-disc list-inside flex flex-col gap-1">
              <li>提供會員身分驗證、登入與帳號安全（例如異常登入的速率限制）</li>
              <li>顯示您的數位會員證、個人檔案與獅子會資歷</li>
              <li>處理活動報名、報到與相關通知</li>
              <li>讓幹部核對分會歸屬、審核資歷與管理會員權限</li>
              <li>處理您對其他會員的封鎖或檢舉</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">資料存放與第三方服務</h2>
            <p>
              系統架設於 Amazon Web Services（AWS）上，資料庫、大頭貼照片儲存與系統寄送的 Email（如驗證信、密碼重設信、通知信）皆透過 AWS 提供的服務處理。我們不會將您的個人資料出售或提供給上述服務以外的第三方作行銷用途。
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">資料保留與帳號刪除</h2>
            <p className="mb-2">
              您可以在「我的檔案」自行刪除帳號。刪除後：
            </p>
            <ul className="list-disc list-inside flex flex-col gap-1">
              <li>您的姓名、Email、電話、生日、大頭貼等個人識別資料會被清除或匿名化，帳號無法再登入</li>
              <li>大頭貼照片會由背景作業於短時間內從儲存空間實際刪除</li>
              <li>您建立過的活動、好友曾經的報名紀錄、幹部審核的稽核歷程等「與他人共用」的資料，會以匿名化方式保留，用以維持活動與歷史紀錄的完整性，不會顯示您的個人身分</li>
            </ul>
            <p className="mt-2">
              若您在持有幹部權限或有尚未開始的活動時申請刪除帳號，系統會先請您處理這些事項，避免影響其他會員。
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">您的權利</h2>
            <p>
              您可以隨時在「我的檔案」查看與更正自己的資料。如果您對資料蒐集、使用方式有疑問，或需要協助處理帳號刪除遇到的問題，請透過下方聯絡方式與我們聯繫。
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">聯絡我們</h2>
            <p>
              如有任何隱私權相關問題，歡迎來信：
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-lion-gold ml-1">{CONTACT_EMAIL}</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
