"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PeopleIcon, BellIcon, CalendarIcon, UserIcon } from "./icons";

const tabs = [
  { href: "/home", label: "首頁", Icon: HomeIcon },
  { href: "/friends", label: "好友", Icon: PeopleIcon },
  { href: "/events", label: "活動", Icon: CalendarIcon },
  { href: "/notifications", label: "通知", Icon: BellIcon },
  { href: "/profile", label: "我的", Icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="主要導覽" className="bottom-nav-safe sticky bottom-0 z-10 flex shrink-0 items-stretch border-t border-lion-border bg-lion-page/95 px-1 pt-2 backdrop-blur">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname?.startsWith(href) || (href === "/profile" && pathname?.startsWith("/admin"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors ${
              active ? "bg-lion-gold/10 text-lion-gold" : "text-lion-muted"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
