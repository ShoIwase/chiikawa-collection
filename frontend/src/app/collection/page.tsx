"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import AuthGuard from "@/components/AuthGuard";
import AlertBanner from "@/components/AlertBanner";
import FilterBar, { type SortKey } from "@/components/FilterBar";
import CollectionGrid from "@/components/CollectionGrid";
import ImageLightbox from "@/components/ImageLightbox";
import TagEditor from "@/components/TagEditor";
import ScanModal from "@/components/ScanModal";
import { getCollectionItems, getPendingItems, updateItemStatus, updateItemTags } from "@/lib/api";
import type { CollectionItem } from "@/lib/types";
import { PREFECTURES, CHARACTERS } from "@/lib/types";

export default function CollectionPage() {
  const router = useRouter();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 所持トグルは即時保存せず、未保存の変更を pending に溜めて保存ボタンで確定する
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    Promise.all([getCollectionItems(), getPendingItems()])
      .then(([col, pend]) => {
        setItems(col);
        setPendingCount(pend.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const itemsByName = useMemo(() => {
    const m = new Map<string, CollectionItem>();
    items.forEach((i) => m.set(i.ItemName, i));
    return m;
  }, [items]);

  // タップは未保存の変更として記録するだけ（サーバーには送らない）
  const handleToggleLocal = useCallback((item: CollectionItem) => {
    const name = item.ItemName;
    const server = itemsByName.get(name)?.Owned ?? false;
    setPending((prev) => {
      const current = name in prev ? prev[name] : server;
      const next = !current;
      const np = { ...prev };
      if (next === server) delete np[name]; // サーバー値と同じに戻したら変更を取り消し
      else np[name] = next;
      return np;
    });
  }, [itemsByName]);

  const handleSave = useCallback(async () => {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    setSaving(true);
    setSaveError("");
    const succeeded: string[] = [];
    try {
      for (const [name, owned] of entries) {
        await updateItemStatus(name, owned);
        succeeded.push(name);
      }
      setItems((prev) =>
        prev.map((i) => (i.ItemName in pending ? { ...i, Owned: pending[i.ItemName] } : i))
      );
      setPending({});
    } catch {
      // 成功した分だけ反映し、失敗分は未保存のまま残す
      setItems((prev) =>
        prev.map((i) => (succeeded.includes(i.ItemName) ? { ...i, Owned: pending[i.ItemName] } : i))
      );
      setPending((prev) => {
        const np = { ...prev };
        succeeded.forEach((n) => delete np[n]);
        return np;
      });
      setSaveError("一部の保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }, [pending]);

  const handleCancel = useCallback(() => {
    setPending({});
    setSaveError("");
  }, []);

  const handleScanUpdated = useCallback((updatedNames: string[]) => {
    const nameSet = new Set(updatedNames);
    setItems((prev) => prev.map((i) => (nameSet.has(i.ItemName) ? { ...i, Owned: true } : i)));
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

  // 都道府県を変えたら市区町村の選択をリセットする
  const handlePrefectureChange = useCallback((v: string) => {
    setSelectedPrefecture(v);
    setSelectedCity("");
  }, []);

  // 未保存の変更を反映した表示用アイテム（Owned は実効値）
  const displayItems = useMemo(
    () => items.map((i) => (i.ItemName in pending ? { ...i, Owned: pending[i.ItemName] } : i)),
    [items, pending]
  );
  const dirtyNames = useMemo(() => new Set(Object.keys(pending)), [pending]);
  const dirtyCount = dirtyNames.size;

  const filtered = useMemo(() => {
    return displayItems.filter((item) => {
      if (selectedTag && !item.Tags?.includes(selectedTag)) return false;
      // 都道府県フィルタ（市区町村は親県に集約。海外・広域は「その他」）
      if (selectedPrefecture) {
        const bucket = item.Prefecture || "その他";
        if (bucket !== selectedPrefecture) return false;
      }
      if (selectedCity && item.AreaName !== selectedCity) return false;
      if (selectedCharacter && item.Motif !== selectedCharacter) return false;
      if (showOwnedOnly && item.Owned) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        return (
          item.ItemName.toLowerCase().includes(q) ||
          item.Motif.toLowerCase().includes(q) ||
          item.AreaName.toLowerCase().includes(q) ||
          (item.Prefecture ?? "").toLowerCase().includes(q) ||
          item.Tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [displayItems, selectedTag, selectedPrefecture, selectedCity, selectedCharacter, searchText, showOwnedOnly]);

  const PREF_RANK = useMemo<Map<string, number>>(() => new Map(PREFECTURES.map((p, i) => [p, i])), []);
  const CHAR_RANK = useMemo<Map<string, number>>(() => new Map(CHARACTERS.map((c, i) => [c, i])), []);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "name":
        return arr.sort((a, b) => a.ItemName.localeCompare(b.ItemName, "ja"));
      case "area":
        return arr.sort((a, b) => {
          const ra = PREF_RANK.get(a.Prefecture ?? "") ?? 999;
          const rb = PREF_RANK.get(b.Prefecture ?? "") ?? 999;
          if (ra !== rb) return ra - rb;
          const areaComp = a.AreaName.localeCompare(b.AreaName, "ja");
          if (areaComp !== 0) return areaComp;
          return (CHAR_RANK.get(a.Motif) ?? 999) - (CHAR_RANK.get(b.Motif) ?? 999);
        });
      case "character":
        return arr.sort((a, b) => {
          const ra = CHAR_RANK.get(a.Motif) ?? 999;
          const rb = CHAR_RANK.get(b.Motif) ?? 999;
          if (ra !== rb) return ra - rb;
          return a.AreaName.localeCompare(b.AreaName, "ja");
        });
      case "owned-first":
        return arr.sort((a, b) => Number(b.Owned) - Number(a.Owned));
      case "unowned-first":
        return arr.sort((a, b) => Number(a.Owned) - Number(b.Owned));
      default:
        return arr;
    }
  }, [filtered, sortKey, PREF_RANK, CHAR_RANK]);

  const ownedCount = displayItems.filter((i) => i.Owned).length;

  return (
    <AuthGuard>
      <div className={`max-w-2xl mx-auto px-4 py-6 space-y-4 ${dirtyCount > 0 ? "pb-24" : ""}`}>
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-pink-500">🐾 ちいかわコレクション</h1>
            <p className="text-xs text-gray-400">
              {ownedCount} / {items.length} 個所持
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setScanOpen(true)}
              className="text-xs text-white bg-pink-400 hover:bg-pink-500 px-2.5 py-1 rounded-full transition-colors"
            >
              写真スキャン
            </button>
            <Link href="/stats/" className="text-xs text-gray-400 underline">
              集計
            </Link>
            <button
              onClick={() => signOut().then(() => router.replace("/login/"))}
              className="text-xs text-gray-400 underline"
            >
              ログアウト
            </button>
          </div>
        </header>

        <AlertBanner count={pendingCount} />

        <FilterBar
          items={items}
          searchText={searchText}
          selectedTag={selectedTag}
          selectedPrefecture={selectedPrefecture}
          selectedCity={selectedCity}
          selectedCharacter={selectedCharacter}
          showOwnedOnly={showOwnedOnly}
          sortKey={sortKey}
          onSearchTextChange={setSearchText}
          onTagChange={setSelectedTag}
          onPrefectureChange={handlePrefectureChange}
          onCityChange={setSelectedCity}
          onCharacterChange={setSelectedCharacter}
          onShowOwnedOnlyChange={setShowOwnedOnly}
          onSortKeyChange={setSortKey}
        />

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && (
          <CollectionGrid
            items={sorted}
            dirtyNames={dirtyNames}
            onToggle={handleToggleLocal}
            onZoom={(src, alt) => setZoomedImage({ src, alt })}
            onEditTags={setEditingItem}
          />
        )}
      </div>

      {/* 未保存の変更を確定する保存バー */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-pink-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-pink-600">{dirtyCount}件</span> の未保存の変更
              {saveError && <p className="text-xs text-red-500 mt-0.5">{saveError}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-gray-500 rounded-lg border border-gray-300 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-pink-500 rounded-lg hover:bg-pink-600 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomedImage && (
        <ImageLightbox
          src={zoomedImage.src}
          alt={zoomedImage.alt}
          onClose={() => setZoomedImage(null)}
        />
      )}

      {scanOpen && (
        <ScanModal onClose={() => setScanOpen(false)} onUpdated={handleScanUpdated} />
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
