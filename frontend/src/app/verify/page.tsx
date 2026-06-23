"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import VerifyModal from "@/components/VerifyModal";
import { getPendingItems, verifyItem } from "@/lib/api";
import type { MasterItem } from "@/lib/types";

export default function VerifyPage() {
  const router = useRouter();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getPendingItems()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const current = items[currentIndex];

  async function handleConfirm(
    itemName: string,
    patch: { areaType: string; areaName: string; motif: string }
  ) {
    await verifyItem(itemName, patch);
    advance();
  }

  function advance() {
    if (currentIndex + 1 >= items.length) {
      router.replace("/collection/");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            ← 戻る
          </button>
          <h1 className="text-lg font-bold text-gray-700">新着アイテムの確認</h1>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400" />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p>未確認のアイテムはありません</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="text-center mb-4 text-sm text-gray-500">
            {currentIndex + 1} / {items.length} 件
          </div>
        )}

        {current && (
          <VerifyModal
            item={current}
            onConfirm={handleConfirm}
            onSkip={advance}
          />
        )}
      </div>
    </AuthGuard>
  );
}
