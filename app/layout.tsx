import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "黃名帝國・公園象棋",
  description: "黃名帝國公園象棋遊戲"
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
