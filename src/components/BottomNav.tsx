"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "首頁", icon: "🏠" },
  { href: "/friends", label: "好友", icon: "👥" },
  { href: "/notifications", label: "活動通知", icon: "🔔" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="sticky bottom-0 shrink-0 bg-lion-navy/95 border-t border-white/10 flex items-stretch px-2 pb-2 pt-1 backdrop-blur z-10">
      {tabs.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
              active ? "text-lion-gold" : "text-lion-cream/50"
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[11px] font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
