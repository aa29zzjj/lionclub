"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PeopleIcon, BellIcon } from "./icons";

const tabs = [
  { href: "/home", label: "首頁", Icon: HomeIcon },
  { href: "/friends", label: "好友", Icon: PeopleIcon },
  { href: "/notifications", label: "活動通知", Icon: BellIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="sticky bottom-0 shrink-0 bg-lion-navyDeep/95 border-t border-white/[0.06] flex items-stretch px-2 pb-2 pt-2 backdrop-blur z-10">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${
              active ? "text-lion-gold" : "text-lion-muted"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
