import { useState, type ReactNode } from "react";
import type { Member } from "./contract";

export type TabKey = "home" | "friends" | "events" | "notifications" | "security" | "admin";

const TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "home", label: "首頁" },
  { key: "friends", label: "好友" },
  { key: "events", label: "活動" },
  { key: "notifications", label: "通知" },
  { key: "security", label: "我的" },
  { key: "admin", label: "幹部", adminOnly: true },
];

/** Placeholder for a tab whose real screen lands in a later stage of the native port. */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="tab-placeholder">
      <p>「{label}」畫面製作中，下一輪會補上。</p>
    </div>
  );
}

export default function Shell({ member, renderTab, onLogout, busy }: {
  member: Member;
  renderTab: (tab: TabKey, member: Member) => ReactNode | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("home");
  const isAdmin = Array.isArray(member.adminRoles) && member.adminRoles.length > 0;
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const content = renderTab(tab, member);

  return (
    <div className="shell">
      <main className="shell-content">
        {content ?? <ComingSoon label={visibleTabs.find((t) => t.key === tab)?.label ?? tab} />}
        {tab === "home" ? (
          <button type="button" className="secondary logout-button" onClick={onLogout} disabled={busy}>
            {busy ? "登出中…" : "登出"}
          </button>
        ) : null}
      </main>
      <nav className="tab-bar" aria-label="主要功能切換">
        {visibleTabs.map((t) => (
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
