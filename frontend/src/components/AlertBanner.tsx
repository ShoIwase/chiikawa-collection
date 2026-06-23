"use client";

import { useRouter } from "next/navigation";

type Props = {
  count: number;
};

export default function AlertBanner({ count }: Props) {
  const router = useRouter();

  if (count === 0) return null;

  return (
    <button
      onClick={() => router.push("/verify/")}
      className="w-full bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2 hover:bg-yellow-200 transition-colors"
    >
      <span>⚠️</span>
      <span>未確認の新着アイテムが {count} 件あります。タップして確認する</span>
    </button>
  );
}
