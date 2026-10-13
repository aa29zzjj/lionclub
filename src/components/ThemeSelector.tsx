"use client";

import { ThemePreference, useTheme } from "./ThemeProvider";

const options: Array<{ value: ThemePreference; label: string; shortLabel: string }> = [
  { value: "system", label: "跟隨系統", shortLabel: "系統" },
  { value: "light", label: "淺色模式", shortLabel: "淺色" },
  { value: "dark", label: "深色模式", shortLabel: "深色" },
];

export default function ThemeSelector() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <section className="rounded-2xl border border-lion-border bg-lion-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">顯示模式</h2>
          <p className="mt-0.5 text-xs text-lion-muted">
            {preference === "system" ? `目前跟隨系統，顯示${resolvedTheme === "dark" ? "深色" : "淺色"}` : `目前使用${resolvedTheme === "dark" ? "深色" : "淺色"}模式`}
          </p>
        </div>
        <span aria-hidden="true" className="text-lg text-lion-gold">◐</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-lion-soft p-1" role="group" aria-label="選擇顯示模式">
        {options.map((option) => {
          const active = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreference(option.value)}
              aria-pressed={active}
              aria-label={option.label}
              className={`min-h-12 rounded-lg px-2 text-xs font-medium transition-colors ${
                active ? "bg-lion-action text-lion-navyDeep shadow-sm" : "text-lion-muted hover:text-lion-cream"
              }`}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </section>
  );
}
