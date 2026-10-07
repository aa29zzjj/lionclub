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
    <div className="min-h-screen w-full bg-[#eef0f4] flex justify-center">
      <div className="relative w-full max-w-[480px] min-h-screen bg-lion-navyDeep text-lion-cream flex flex-col">
        <div className="flex-1">{children}</div>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
