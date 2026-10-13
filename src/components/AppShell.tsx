"use client";

import { ReactNode } from "react";
import BottomNav from "./BottomNav";

export default function AppShell({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className={`app-frame relative w-full max-w-[480px] bg-lion-page text-lion-cream flex flex-col ${showNav ? "" : "app-frame-no-nav"}`}>
        <div className="flex-1">{children}</div>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
