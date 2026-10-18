import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "延興郡物語｜郡長物語",
  description: "黃名帝國延興郡像素風郡務經營遊戲：論壇活躍度、隨機事件與郡長官決策。"
};

export default function YanxingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
