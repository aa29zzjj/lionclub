import { useCallback, useEffect, useRef, useState } from "react";
import { createPushController, type PushApi, type PushStatus } from "./push-controller";
import { nativePush, pushStore } from "./native-push";

export function useMobilePush(memberId: string | null, api: PushApi, openNotifications: () => void) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const controller = useRef<ReturnType<typeof createPushController> | null>(null);
  useEffect(() => {
    if (!memberId) { setStatus("off"); return; }
    const active = createPushController({ memberId, api, native: nativePush, store: pushStore, changed: setStatus, openNotifications });
    controller.current = active;
    void active.refresh();
    return () => { controller.current = null; void active.dispose(); };
  }, [memberId, api, openNotifications]);
  const enable = useCallback(async () => { await controller.current?.enable(); }, []);
  const disable = useCallback(async () => {
    if (controller.current) return controller.current.disable();
    if (!nativePush.supported) return { serverConfirmed: true, nativeConfirmed: true };
    // A cold offline launch has no loaded member, but can still have an old
    // registration. Try to revoke it BEFORE logout erases the bearer.
    try {
      const linked = await pushStore.linkedMember();
      if (!linked) return { serverConfirmed: true, nativeConfirmed: true };
      const temporary = createPushController({ memberId: linked, api, native: nativePush, store: pushStore,
        changed() {}, openNotifications() {} });
      try { return await temporary.disable(); } finally { await temporary.dispose(); }
    } catch {
      try { await nativePush.unregister(); return { serverConfirmed: false, nativeConfirmed: true }; }
      catch { return { serverConfirmed: false, nativeConfirmed: false }; }
    }
  }, [api]);
  const refresh = useCallback(async () => { await controller.current?.refresh(); }, []);
  return { status, enable, disable, refresh };
}
export type MobilePushUi = ReturnType<typeof useMobilePush>;

const descriptions: Record<PushStatus, string> = {
  checking: "正在確認通知設定…",
  unavailable: "手機推播尚未由服務端啟用；App 內的通知仍可正常查看。",
  off: "未開啟手機推播。你仍可以在 App 內查看通知。",
  denied: "系統未允許通知。你可以在 iPhone「設定 → 通知 → LionClubs」調整，不會反覆要求授權。",
  registering: "正在連接手機通知服務，尚未確認開啟完成…",
  on: "此裝置已完成推播登記；是否顯示仍受網路、專注模式與系統設定影響。",
  error: "通知設定尚未確認完成，請重新連線後再試；不影響站內通知。",
};

export default function NotificationSettings({ push }: { push: MobilePushUi }) {
  const [changing, setChanging] = useState(false);
  async function change(action: () => Promise<unknown>) {
    if (changing) return; setChanging(true);
    try { await action(); } finally { setChanging(false); }
  }
  const busy = changing || push.status === "checking";
  return <section className="my-screen-section" aria-labelledby="push-settings-title">
    <h2 className="section-title" id="push-settings-title">手機通知</h2>
    <p className="member-meta">活動公告、好友邀請、審核結果。鎖定畫面只顯示通用提示，登入 App 後才讀取內容；不發行銷訊息。</p>
    <p className="member-meta" role="status">{descriptions[push.status]}</p>
    {["off", "error"].includes(push.status) && <button type="button" className="secondary" disabled={busy} onClick={() => void change(push.enable)}>開啟此裝置通知</button>}
    {push.status === "unavailable" && <button type="button" className="secondary" disabled={busy} onClick={() => void change(push.refresh)}>重新確認服務狀態</button>}
    {["on", "registering", "error", "denied"].includes(push.status) && <button type="button" className="secondary" disabled={busy} onClick={() => void change(push.disable)}>暫停此裝置通知</button>}
  </section>;
}
