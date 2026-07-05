"use client";

import { configureAmplify } from "@/lib/amplify-config";
import "./globals.css";

// useEffect より前に実行し、子コンポーネントの useEffect より確実に先に Amplify を初期化する
configureAmplify();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <title>ご当地ちいかわコレクション</title>
      </head>
      <body className="bg-pink-50 min-h-screen text-gray-800">
        <main>{children}</main>
      </body>
    </html>
  );
}
