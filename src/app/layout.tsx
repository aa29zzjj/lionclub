import type { Metadata } from "next";
import "./globals.css";
import { AppDataProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "獅子會 App",
  description: "獅子會會員服務 App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AppDataProvider>{children}</AppDataProvider>
      </body>
    </html>
  );
}
