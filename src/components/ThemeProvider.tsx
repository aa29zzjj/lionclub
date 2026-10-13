"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const STORAGE_KEY = "lion-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = preference === "system" ? systemTheme() : preference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolvedTheme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", resolvedTheme === "dark" ? "#0A0D18" : "#F8F6F0");
  });
  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    let initialPreference: ThemePreference = "system";
    try {
      const storedPreference = window.localStorage.getItem(STORAGE_KEY);
      if (isThemePreference(storedPreference)) initialPreference = storedPreference;
    } catch {
      // WebViews or private browsing may deny storage; appearance still works.
    }
    setPreferenceState(initialPreference);
    setResolvedTheme(applyTheme(initialPreference));
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const nextPreference = isThemePreference(event.newValue) ? event.newValue : "system";
      setPreferenceState(nextPreference);
      setResolvedTheme(applyTheme(nextPreference));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(applyTheme("system"));
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  function setPreference(nextPreference: ThemePreference) {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      // Keep the current choice in memory if persistent storage is unavailable.
    }
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));
  }

  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
