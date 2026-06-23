"use client";

import { useEffect } from "react";
import { configureAmplify } from "@/lib/amplify-config";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAmplify();
  }, []);

  return (
    <html lang="ja">
      <body className="bg-pink-50 min-h-screen text-gray-800">{children}</body>
    </html>
  );
}
