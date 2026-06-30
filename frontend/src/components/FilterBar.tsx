"use client";

import { useMemo } from "react";
import type { CollectionItem } from "@/lib/types";
import { CHARACTERS, PREFECTURES, OTHER_AREA_LABEL } from "@/lib/types";

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTag: string;
  selectedPrefecture: string;
  selectedCity: string;
  selectedCharacter: string;
  showOwnedOnly: boolean;
  onSearchTextChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onPrefectureChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onCharacterChange: (v: string) => void;
  onShowOwnedOnlyChange: (v: boolean) => void;
};

// 商品の所属エリア括り（都道府県、無ければ「その他」）
function bucketOf(item: CollectionItem): string {
  return item.Prefecture || OTHER_AREA_LABEL;
}

export default function FilterBar({
  items,
  searchText,
  selectedTag,
  selectedPrefecture,
  selectedCity,
  selectedCharacter,
  showOwnedOnly,
  onSearchTextChange,
  onTagChange,
  onPrefectureChange,
  onCityChange,
  onCharacterChange,
  onShowOwnedOnlyChange,
}: Props) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [items]);

  // データに存在する都道府県を地理順に。属さないものは末尾に「その他」。
  const prefsPresent = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(bucketOf(i)));
    const ordered: string[] = PREFECTURES.filter((p) => set.has(p));
    if (set.has(OTHER_AREA_LABEL)) ordered.push(OTHER_AREA_LABEL);
    return ordered;
  }, [items]);

  // 選択中の都道府県に含まれる市区町村（県全体の都道府県エントリは除外）
  const citiesInPref = useMemo(() => {
    if (!selectedPrefecture) return [];
    const set = new Set<string>();
    items.forEach((i) => {
      if (bucketOf(i) !== selectedPrefecture) return;
      if (i.AreaType === "都道府県") return; // 県全体エントリは市レベルに出さない
      if (i.AreaName) set.add(i.AreaName);
    });
    return [...set].sort();
  }, [items, selectedPrefecture]);

  const hasFilter =
    searchText ||
    selectedTag ||
    selectedPrefecture ||
    selectedCity ||
    selectedCharacter ||
    showOwnedOnly;

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder="アイテム名・モチーフで検索..."
        value={searchText}
        onChange={(e) => onSearchTextChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
      />
      <div className="flex gap-2 flex-wrap items-center">
        {/* 都道府県 → 市区町村（カスケード。県だけでもOK、市は任意） */}
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

        <select
          value={selectedTag}
          aria-label="タグで絞り込み"
          onChange={(e) => onTagChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="">タグ</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

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
          <button
            onClick={() => {
              onSearchTextChange("");
              onTagChange("");
              onPrefectureChange("");
              onCityChange("");
              onCharacterChange("");
              onShowOwnedOnlyChange(false);
            }}
            className="text-xs text-gray-400 underline"
          >
            クリア
          </button>
        )}
      </div>

      {/* キャラクター絞り込み（トグルボタン） */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-400">キャラ:</span>
        {CHARACTERS.map((c) => {
          const active = selectedCharacter === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => onCharacterChange(active ? "" : c)}
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

      {/* 選択中タグのバッジ */}
      {selectedTag && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">絞り込み中:</span>
          <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {selectedTag}
            <button onClick={() => onTagChange("")} className="text-pink-400 hover:text-pink-600">×</button>
          </span>
        </div>
      )}
    </div>
  );
}
