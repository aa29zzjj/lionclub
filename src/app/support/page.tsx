import Link from "next/link";

const CONTACT_EMAIL = "jaijai0830@gmail.com";
const APP_NAME = "獅子會 App";

export const metadata = { title: `客服／聯絡我們 - ${APP_NAME}` };

export default function SupportPage() {
  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className="app-frame w-full max-w-[640px] bg-lion-page text-lion-cream px-6 py-10">
        <Link href="/login" className="text-sm text-lion-gold">← 返回登入</Link>
        <h1 className="text-2xl font-bold mt-4 mb-1">客服／聯絡我們</h1>
        <p className="text-xs text-lion-muted mb-8">使用上遇到問題，或想申請刪除資料，都可以聯絡我們</p>

        <div className="flex flex-col gap-6 text-sm leading-relaxed text-lion-cream/90">
          <section>
            <h2 className="font-semibold text-base mb-2">聯絡信箱</h2>
            <p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-lion-gold">{CONTACT_EMAIL}</a>
            </p>
            <p className="text-xs text-lion-muted mt-1">我們會盡快回覆，一般約 3 個工作天內處理。</p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">常見問題</h2>
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-medium">忘記密碼怎麼辦？</p>
                <p className="text-lion-cream/70">在登入頁點選「忘記密碼？」，輸入註冊 Email 後會收到重設連結，連結 30 分鐘內有效。</p>
              </div>
              <div>
                <p className="font-medium">沒收到邀請 QR Code 或驗證信？</p>
                <p className="text-lion-cream/70">請先檢查垃圾信件匣；若還是找不到，可向分會幹部索取新的邀請 QR，或在個人檔案重新寄送驗證信。</p>
              </div>
              <div>
                <p className="font-medium">想刪除帳號跟個人資料？</p>
                <p className="text-lion-cream/70">
                  可在「我的檔案」最下方自行申請刪除帳號。若您目前持有幹部權限或有尚未開始的活動，需要先請其他幹部協助處理後才能刪除；如遇到無法自行處理的狀況，請來信聯絡我們協助。
                </p>
              </div>
              <div>
                <p className="font-medium">分會資訊或分派結果有誤？</p>
                <p className="text-lion-cream/70">請聯繫您所屬分會的幹部，由幹部於「會員分會分派」後台核對並調整；若找不到可協助的幹部，請來信聯絡我們。</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-2">其他連結</h2>
            <p>
              <Link href="/privacy" className="text-lion-gold">隱私權政策</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
