"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import AuthGuard from "@/components/AuthGuard";
import AlertBanner from "@/components/AlertBanner";
import FilterBar from "@/components/FilterBar";
import CollectionGrid from "@/components/CollectionGrid";
import ImageLightbox from "@/components/ImageLightbox";
import TagEditor from "@/components/TagEditor";
import { getCollectionItems, getPendingItems, updateItemStatus, updateItemTags } from "@/lib/api";
import type { CollectionItem } from "@/lib/types";

export default function CollectionPage() {
  const router = useRouter();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);

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
      setItems((prev) =>
        prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Owned: item.Owned } : i))
      );
    }
  }, []);

  const handleSaveTags = useCallback(async (tags: string[]) => {
    if (!editingItem) return;
    await updateItemTags(editingItem.ItemName, tags);
    setItems((prev) =>
      prev.map((i) => (i.ItemName === editingItem.ItemName ? { ...i, Tags: tags } : i))
    );
  }, [editingItem]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (selectedTag && !item.Tags?.includes(selectedTag)) return false;
      if (showOwnedOnly && item.Owned) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        return (
          item.ItemName.toLowerCase().includes(q) ||
          item.Motif.toLowerCase().includes(q) ||
          item.AreaName.toLowerCase().includes(q) ||
          item.Tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, selectedTag, searchText, showOwnedOnly]);

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
          searchText={searchText}
          selectedTag={selectedTag}
          showOwnedOnly={showOwnedOnly}
          onSearchTextChange={setSearchText}
          onTagChange={setSelectedTag}
          onShowOwnedOnlyChange={setShowOwnedOnly}
        />

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && (
          <CollectionGrid
            items={filtered}
            onToggle={handleToggle}
            onZoom={(src, alt) => setZoomedImage({ src, alt })}
            onEditTags={setEditingItem}
            onTagClick={setSelectedTag}
          />
        )}
      </div>

      {zoomedImage && (
        <ImageLightbox
          src={zoomedImage.src}
          alt={zoomedImage.alt}
          onClose={() => setZoomedImage(null)}
        />
      )}

      {editingItem && (
        <TagEditor
          item={editingItem}
          allTags={allTags}
          onSave={handleSaveTags}
          onClose={() => setEditingItem(null)}
        />
      )}
    </AuthGuard>
  );
}
