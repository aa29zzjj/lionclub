import type { Metadata } from "next";
import PublicServicePage from "@/components/PublicServicePage";

export const metadata: Metadata = { title: "功能已移除｜LionClubs", robots: { index: false, follow: true } };

// Static retirement notice only: no client action, sign-in prompt or request form.
export default function AccountDeletionPage() {
  return <PublicServicePage title="此功能已移除">
    <p>目前無自助刪除帳號功能。本頁不會刪除帳號、接受刪除申請、建立排隊工作或自動執行任何操作。</p>
    <p>您仍可查閱隱私權政策或聯絡客服提出隱私詢問；一般詢問不代表刪除申請已受理、排程或完成，也不承諾刪除時限。</p>
  </PublicServicePage>;
}
