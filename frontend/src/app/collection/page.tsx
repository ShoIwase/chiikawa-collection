"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PREFECTURES, CHARACTERS, WANT_TAG, FAV_TAG } from "@/lib/types";

export default function CollectionPage() {
  const router = useRouter();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [showWanted, setShowWanted] = useState(false);
  const [showFavorite, setShowFavorite] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      // 下スクロールで隠す、上スクロール or 上部付近で見せる
      if (y > lastScrollY.current && y > 60) setFabVisible(false);
      else setFabVisible(true);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  const handleToggleLocal = useCallback((item: CollectionItem) => {
    const name = item.ItemName;
    const server = itemsByName.get(name)?.Owned ?? false;
    setPending((prev) => {
      const current = name in prev ? prev[name] : server;
      const next = !current;
      const np = { ...prev };
      if (next === server) delete np[name];
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

  const handleSaveTags = useCallback(async (tags: string[]) => {
    if (!editingItem) return;
    await updateItemTags(editingItem.ItemName, tags);
    setItems((prev) =>
      prev.map((i) => (i.ItemName === editingItem.ItemName ? { ...i, Tags: tags } : i))
    );
  }, [editingItem]);

  // ❤️ / ⭐ の即時トグル（pendingを使わず直接保存）
  const handleToggleSpecialTag = useCallback(async (item: CollectionItem, tagName: string) => {
    const current = item.Tags ?? [];
    const next = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName];
    await updateItemTags(item.ItemName, next);
    setItems((prev) =>
      prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Tags: next } : i))
    );
  }, []);

  const handleToggleWant = useCallback((item: CollectionItem) => handleToggleSpecialTag(item, WANT_TAG), [handleToggleSpecialTag]);
  const handleToggleFav = useCallback((item: CollectionItem) => handleToggleSpecialTag(item, FAV_TAG), [handleToggleSpecialTag]);

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleCharacterToggle = useCallback((c: string) => {
    setSelectedCharacters((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }, []);

  const handlePrefectureChange = useCallback((v: string) => {
    setSelectedPrefecture(v);
    setSelectedCity("");
  }, []);

  const handleClearAll = useCallback(() => {
    setSearchText("");
    setSelectedTags([]);
    setSelectedPrefecture("");
    setSelectedCity("");
    setSelectedCharacters([]);
    setShowOwnedOnly(false);
    setShowWanted(false);
    setShowFavorite(false);
  }, []);

  const handleScanUpdated = useCallback((updatedNames: string[]) => {
    const nameSet = new Set(updatedNames);
    setItems((prev) => prev.map((i) => (nameSet.has(i.ItemName) ? { ...i, Owned: true } : i)));
  }, []);

  const displayItems = useMemo(
    () => items.map((i) => (i.ItemName in pending ? { ...i, Owned: pending[i.ItemName] } : i)),
    [items, pending]
  );
  const dirtyNames = useMemo(() => new Set(Object.keys(pending)), [pending]);
  const dirtyCount = dirtyNames.size;

  const filtered = useMemo(() => {
    return displayItems.filter((item) => {
      if (selectedTags.length > 0 && !selectedTags.every((t) => item.Tags?.includes(t))) return false;
      if (selectedPrefecture) {
        const bucket = item.Prefecture || "その他";
        if (bucket !== selectedPrefecture) return false;
      }
      if (selectedCity && item.AreaName !== selectedCity) return false;
      if (selectedCharacters.length > 0 && !selectedCharacters.includes(item.Motif)) return false;
      if (showOwnedOnly && item.Owned) return false;
      if (showWanted && !item.Tags?.includes(WANT_TAG)) return false;
      if (showFavorite && !item.Tags?.includes(FAV_TAG)) return false;
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
  }, [displayItems, selectedTags, selectedPrefecture, selectedCity, selectedCharacters, searchText, showOwnedOnly, showWanted, showFavorite]);

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
  const ownedNames = useMemo(() => new Set(items.filter((i) => i.Owned).map((i) => i.ItemName)), [items]);

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
          selectedTags={selectedTags}
          selectedPrefecture={selectedPrefecture}
          selectedCity={selectedCity}
          selectedCharacters={selectedCharacters}
          showOwnedOnly={showOwnedOnly}
          showWanted={showWanted}
          showFavorite={showFavorite}
          sortKey={sortKey}
          onSearchTextChange={setSearchText}
          onTagToggle={handleTagToggle}
          onPrefectureChange={handlePrefectureChange}
          onCityChange={setSelectedCity}
          onCharacterToggle={handleCharacterToggle}
          onShowOwnedOnlyChange={setShowOwnedOnly}
          onShowWantedChange={setShowWanted}
          onShowFavoriteChange={setShowFavorite}
          onSortKeyChange={setSortKey}
          onClearAll={handleClearAll}
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
            onToggleWant={handleToggleWant}
            onToggleFav={handleToggleFav}
          />
        )}
      </div>

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

      {/* 浮きボタン（写真スキャン・集計） */}
      <div className={`fixed right-4 z-30 flex flex-col gap-2 transition-all duration-300 ${dirtyCount > 0 ? "bottom-24" : "bottom-6"} ${fabVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        <button
          onClick={() => setScanOpen(true)}
          className="flex items-center gap-1.5 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          📷 スキャン
        </button>
        <Link
          href="/stats/"
          className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-full shadow-lg border border-gray-200 active:scale-95 transition-transform"
        >
          📊 集計
        </Link>
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
          allTags={items.flatMap((i) => i.Tags ?? []).filter((t) => t !== WANT_TAG && t !== FAV_TAG).filter((t, i, a) => a.indexOf(t) === i).sort()}
          onSave={handleSaveTags}
          onClose={() => setEditingItem(null)}
        />
      )}

      {scanOpen && (
        <ScanModal
          onClose={() => setScanOpen(false)}
          onUpdated={handleScanUpdated}
          ownedNames={ownedNames}
        />
      )}
    </AuthGuard>
  );
}
