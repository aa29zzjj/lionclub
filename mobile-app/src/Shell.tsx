import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Member } from "./contract";
import { HomeIcon, PeopleIcon, CalendarIcon, BellIcon, UserIcon } from "../../src/components/icons";
import ScreenErrorBoundary from "./ScreenErrorBoundary";

export type TabKey = "home" | "friends" | "events" | "notifications" | "security";

/** Mirrors the website's bottom nav (src/components/BottomNav.tsx) exactly —
 * five tabs, no separate "admin" tab. Admin tools live inside the "我的" tab,
 * the same way the website reaches /admin/* from /profile. */
const TABS: { key: TabKey; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "首頁", Icon: HomeIcon },
  { key: "friends", label: "好友", Icon: PeopleIcon },
  { key: "events", label: "活動", Icon: CalendarIcon },
  { key: "notifications", label: "通知", Icon: BellIcon },
  { key: "security", label: "我的", Icon: UserIcon },
];

type RenderTab = (tab: TabKey, member: Member, setTab: (tab: TabKey) => void) => ReactNode | null;

export function isNotificationNavigationRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Placeholder for a tab whose real screen lands in a later stage of the native port. */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="tab-placeholder">
      <p>「{label}」畫面製作中，下一輪會補上。</p>
    </div>
  );
}

// Invoke renderTab inside the boundary as well, so an exception in the render
// callback cannot remove the surrounding Shell or its five navigation buttons.
function ScreenContent({ tab, member, renderTab, setTab }: {
  tab: TabKey; member: Member; renderTab: RenderTab; setTab: (tab: TabKey) => void;
}) {
  return <>{renderTab(tab, member, setTab) ?? <ComingSoon label={TABS.find((item) => item.key === tab)?.label ?? tab} />}</>;
}

export default function Shell({ member, renderTab, initialTab = "home", notificationNavigationRevision = 0 }: {
  member: Member;
  renderTab: RenderTab;
  initialTab?: TabKey;
  notificationNavigationRevision?: number;
}) {
  const [tab, setTab] = useState<TabKey>(() => TABS.some((item) => item.key === initialTab) ? initialTab : "home");
  const contentRef = useRef<HTMLElement>(null);

  // The parent supplies a local revision counter after accepting a push tap.
  // Only open the inbox: this API deliberately takes no URL, event or member ID.
  useEffect(() => {
    if (isNotificationNavigationRevision(notificationNavigationRevision)) setTab("notifications");
  }, [notificationNavigationRevision]);

  // .shell-content is one persistent scroll container reused across tabs
  // (renderTab only swaps its children), so its scrollTop must be reset by
  // hand on every switch — otherwise a tab opened while scrolled down starts
  // mid-scroll, with its top content (and the safe-area padding) hidden above.
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [tab]);

  const screenName = TABS.find((item) => item.key === tab)?.label ?? "此頁";

  return (
    <div className="shell">
      <main id="native-tab-content" className="shell-content" aria-label={`${screenName}內容`} ref={contentRef}>
        <ScreenErrorBoundary key={`${tab}:${notificationNavigationRevision}`} screenName={screenName}>
          <ScreenContent tab={tab} member={member} renderTab={renderTab} setTab={setTab} />
        </ScreenErrorBoundary>
      </main>
      <nav className="tab-bar" aria-label="主要功能切換">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? "tab-button active" : "tab-button"}
            aria-current={t.key === tab ? "page" : undefined}
            aria-controls="native-tab-content"
            onClick={() => setTab(t.key)}
          >
            <span className="tab-icon" aria-hidden="true"><t.Icon className="tab-icon-svg" /></span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
