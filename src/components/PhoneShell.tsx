"use client";

import { ReactNode } from "react";
import BottomNav from "./BottomNav";

export default function PhoneShell({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center py-6 px-2">
      <div className="relative w-full max-w-[420px] h-[860px] max-h-[92vh] bg-lion-navyDeep rounded-[2.5rem] shadow-2xl overflow-hidden border-8 border-black/80 flex flex-col">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-black rounded-b-xl z-20" />
        <div className="flex-1 overflow-y-auto text-lion-cream">{children}</div>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
