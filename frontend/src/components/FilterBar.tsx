"use client";

import { useMemo } from "react";
import type { CollectionItem } from "@/lib/types";
import { CHARACTERS, PREFECTURES, OTHER_AREA_LABEL, WANT_TAG, FAV_TAG } from "@/lib/types";

export type SortKey = "name" | "area" | "character" | "owned-first" | "unowned-first";

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTag: string;           // 現在選択中（select の表示用）
  selectedTags: string[];        // 複数選択中のタグ一覧
  selectedPrefecture: string;
  selectedCity: string;
  selectedCharacters: string[];
  showOwnedOnly: boolean;
  showWanted: boolean;
  showFavorite: boolean;
  sortKey: SortKey;
  onSearchTextChange: (v: string) => void;
  onTagToggle: (tag: string) => void;
  onPrefectureChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onCharacterToggle: (c: string) => void;
  onShowOwnedOnlyChange: (v: boolean) => void;
  onShowWantedChange: (v: boolean) => void;
  onShowFavoriteChange: (v: boolean) => void;
  onSortKeyChange: (v: SortKey) => void;
  onClearAll: () => void;
};

function bucketOf(item: CollectionItem): string {
  return item.Prefecture || OTHER_AREA_LABEL;
}

export default function FilterBar({
  items,
  searchText,
  selectedTags,
  selectedPrefecture,
  selectedCity,
  selectedCharacters,
  showOwnedOnly,
  showWanted,
  showFavorite,
  sortKey,
  onSearchTextChange,
  onTagToggle,
  onPrefectureChange,
  onCityChange,
  onCharacterToggle,
  onShowOwnedOnlyChange,
  onShowWantedChange,
  onShowFavoriteChange,
  onSortKeyChange,
  onClearAll,
}: Props) {
  // 欲しい・お気に入り以外のユーザータグ
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => {
      if (t !== WANT_TAG && t !== FAV_TAG) set.add(t);
    }));
    return [...set].sort();
  }, [items]);

  const prefsPresent = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(bucketOf(i)));
    const ordered: string[] = PREFECTURES.filter((p) => set.has(p));
    if (set.has(OTHER_AREA_LABEL)) ordered.push(OTHER_AREA_LABEL);
    return ordered;
  }, [items]);

  const citiesInPref = useMemo(() => {
    if (!selectedPrefecture) return [];
    const set = new Set<string>();
    items.forEach((i) => {
      if (bucketOf(i) !== selectedPrefecture) return;
      if (i.AreaType === "都道府県") return;
      if (i.AreaName) set.add(i.AreaName);
    });
    return [...set].sort();
  }, [items, selectedPrefecture]);

  const hasFilter =
    searchText ||
    selectedTags.length > 0 ||
    selectedPrefecture ||
    selectedCity ||
    selectedCharacters.length > 0 ||
    showOwnedOnly ||
    showWanted ||
    showFavorite;

  return (
    <div className="space-y-2">
      {/* 検索 + 並べ替え */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="アイテム名・モチーフで検索..."
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <select
          value={sortKey}
          aria-label="並べ替え"
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="name">名前順</option>
          <option value="area">地域順</option>
          <option value="character">キャラ順</option>
          <option value="owned-first">所持済み優先</option>
          <option value="unowned-first">未所持優先</option>
        </select>
      </div>

      {/* 都道府県 → 市区町村 + タグ + 未所持 + クリア */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={selectedPrefecture}
          aria-label="都道府県で絞り込み"
          onChange={(e) => onPrefectureChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="">都道府県</option>
          {prefsPresent.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={selectedCity}
          aria-label="市区町村で絞り込み"
          disabled={!selectedPrefecture || citiesInPref.length === 0}
          onChange={(e) => onCityChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">市区町村</option>
          {citiesInPref.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* タグ複数選択: 選択するたびにチップに追加 */}
        {allTags.length > 0 && (
          <select
            value=""
            aria-label="タグで絞り込み"
            onChange={(e) => { if (e.target.value) onTagToggle(e.target.value); }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            <option value="">タグ</option>
            {allTags.map((t) => (
              <option key={t} value={t} disabled={selectedTags.includes(t)}>
                {t}{selectedTags.includes(t) ? " ✓" : ""}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOwnedOnly}
            onChange={(e) => onShowOwnedOnlyChange(e.target.checked)}
            className="rounded accent-pink-400"
          />
          未所持のみ
        </label>

        {hasFilter && (
          <button onClick={onClearAll} className="text-xs text-gray-400 underline">
            クリア
          </button>
        )}
      </div>

      {/* キャラ複数選択 */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-400">キャラ:</span>
        {CHARACTERS.map((c) => {
          const active = selectedCharacters.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => onCharacterToggle(c)}
              className={
                active
                  ? "text-xs font-medium px-2.5 py-1 rounded-full bg-pink-400 text-white"
                  : "text-xs font-medium px-2.5 py-1 rounded-full bg-pink-50 text-pink-600 hover:bg-pink-100"
              }
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* 欲しい / お気に入りフィルタ */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-400">絞り込み:</span>
        <button
          type="button"
          aria-pressed={showWanted}
          onClick={() => onShowWantedChange(!showWanted)}
          className={
            showWanted
              ? "text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-500"
              : "text-xs font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100"
          }
        >
          ❤️ 欲しい
        </button>
        <button
          type="button"
          aria-pressed={showFavorite}
          onClick={() => onShowFavoriteChange(!showFavorite)}
          className={
            showFavorite
              ? "text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-600"
              : "text-xs font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100"
          }
        >
          ⭐ お気に入り
        </button>
      </div>

      {/* 選択中タグのチップ */}
      {selectedTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">タグ:</span>
          {selectedTags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {t}
              <button onClick={() => onTagToggle(t)} className="text-pink-400 hover:text-pink-600">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
