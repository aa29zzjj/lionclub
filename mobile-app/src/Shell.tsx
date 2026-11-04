import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Member } from "./contract";

export type TabKey = "home" | "friends" | "events" | "notifications" | "security";

/** Mirrors the website's bottom nav (src/components/BottomNav.tsx) exactly —
 * five tabs, no separate "admin" tab. Admin tools live inside the "我的" tab,
 * the same way the website reaches /admin/* from /profile. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "home", label: "首頁" },
  { key: "friends", label: "好友" },
  { key: "events", label: "活動" },
  { key: "notifications", label: "通知" },
  { key: "security", label: "我的" },
];

/** Placeholder for a tab whose real screen lands in a later stage of the native port. */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="tab-placeholder">
      <p>「{label}」畫面製作中，下一輪會補上。</p>
    </div>
  );
}

export default function Shell({ member, renderTab }: {
  member: Member;
  renderTab: (tab: TabKey, member: Member, setTab: (tab: TabKey) => void) => ReactNode | null;
}) {
  const [tab, setTab] = useState<TabKey>("home");
  const contentRef = useRef<HTMLElement>(null);

  // .shell-content is one persistent scroll container reused across tabs
  // (renderTab only swaps its children), so its scrollTop must be reset by
  // hand on every switch — otherwise a tab opened while scrolled down starts
  // mid-scroll, with its top content (and the safe-area padding) hidden above.
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [tab]);

  const content = renderTab(tab, member, setTab);

  return (
    <div className="shell">
      <main className="shell-content" ref={contentRef}>
        {content ?? <ComingSoon label={TABS.find((t) => t.key === tab)?.label ?? tab} />}
      </main>
      <nav className="tab-bar" aria-label="主要功能切換">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? "tab-button active" : "tab-button"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
