"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "aws-amplify/auth";
import AuthGuard from "@/components/AuthGuard";
import AlertBanner from "@/components/AlertBanner";
import FilterBar from "@/components/FilterBar";
import CollectionGrid from "@/components/CollectionGrid";
import { getCollectionItems, getPendingItems, updateItemStatus } from "@/lib/api";
import type { CollectionItem } from "@/lib/types";

export default function CollectionPage() {
  const router = useRouter();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [areaType, setAreaType] = useState("");
  const [areaName, setAreaName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);

  useEffect(() => {
    Promise.all([getCollectionItems(), getPendingItems()])
      .then(([col, pend]) => {
        setItems(col);
        setPendingCount(pend.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(async (item: CollectionItem) => {
    const next = !item.Owned;
    setItems((prev) =>
      prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Owned: next } : i))
    );
    try {
      await updateItemStatus(item.ItemName, next);
    } catch {
      // ロールバック
      setItems((prev) =>
        prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Owned: item.Owned } : i))
      );
    }
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (areaType && item.AreaType !== areaType) return false;
      if (areaName && item.AreaName !== areaName) return false;
      if (showOwnedOnly && item.Owned) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        return (
          item.ItemName.toLowerCase().includes(q) ||
          item.Motif.toLowerCase().includes(q) ||
          item.AreaName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, areaType, areaName, searchText, showOwnedOnly]);

  const ownedCount = items.filter((i) => i.Owned).length;

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-pink-500">🐾 ちいかわコレクション</h1>
            <p className="text-xs text-gray-400">
              {ownedCount} / {items.length} 個所持
            </p>
          </div>
          <button
            onClick={() => signOut().then(() => router.replace("/login/"))}
            className="text-xs text-gray-400 underline"
          >
            ログアウト
          </button>
        </header>

        <AlertBanner count={pendingCount} />

        <FilterBar
          items={items}
          areaType={areaType}
          areaName={areaName}
          searchText={searchText}
          showOwnedOnly={showOwnedOnly}
          onAreaTypeChange={setAreaType}
          onAreaNameChange={setAreaName}
          onSearchTextChange={setSearchText}
          onShowOwnedOnlyChange={setShowOwnedOnly}
        />

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && <CollectionGrid items={filtered} onToggle={handleToggle} />}
      </div>
    </AuthGuard>
  );
}
