import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "獅子會 App",
  description: "獅子會會員服務 App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
