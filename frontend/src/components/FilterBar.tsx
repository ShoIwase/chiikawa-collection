"use client";

import { useMemo, useState } from "react";
import type { CollectionItem } from "@/lib/types";
import { CHARACTERS, PREFECTURES, OTHER_AREA_LABEL, WANT_TAG, FAV_TAG, bucketOf } from "@/lib/types";

export type SortKey = "name" | "area" | "character" | "owned-first" | "unowned-first";

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTags: string[];
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
  const [expanded, setExpanded] = useState(false);

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
    const ordered = PREFECTURES.filter((p) => set.has(p)) as string[];
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

  // 検索テキスト以外のアクティブフィルタ数
  const activeCount =
    selectedTags.length +
    (selectedPrefecture ? 1 : 0) +
    (selectedCity ? 1 : 0) +
    selectedCharacters.length +
    (showOwnedOnly ? 1 : 0) +
    (showWanted ? 1 : 0) +
    (showFavorite ? 1 : 0);

  const hasAnyFilter = !!searchText || activeCount > 0;

  // アクティブフィルタのチップ定義
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...selectedCharacters.map((c) => ({ key: `char:${c}`, label: c, onRemove: () => onCharacterToggle(c) })),
    ...(selectedPrefecture ? [{ key: "pref", label: selectedPrefecture, onRemove: () => onPrefectureChange("") }] : []),
    ...(selectedCity ? [{ key: "city", label: selectedCity, onRemove: () => onCityChange("") }] : []),
    ...selectedTags.map((t) => ({ key: `tag:${t}`, label: `#${t}`, onRemove: () => onTagToggle(t) })),
    ...(showWanted ? [{ key: "wanted", label: "❤️ 欲しい", onRemove: () => onShowWantedChange(false) }] : []),
    ...(showFavorite ? [{ key: "fav", label: "⭐ お気に入り", onRemove: () => onShowFavoriteChange(false) }] : []),
    ...(showOwnedOnly ? [{ key: "unowned", label: "未所持のみ", onRemove: () => onShowOwnedOnlyChange(false) }] : []),
  ];

  return (
    <div className="space-y-2">
      {/* 行1: 検索 + 並べ替え + 絞り込みトグル */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="名前・エリアで検索..."
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <select
          value={sortKey}
          aria-label="並べ替え"
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300 shrink-0"
        >
          <option value="name">名前順</option>
          <option value="area">地域順</option>
          <option value="character">キャラ順</option>
          <option value="owned-first">所持済み優先</option>
          <option value="unowned-first">未所持優先</option>
        </select>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`relative shrink-0 border rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeCount > 0
              ? "border-pink-400 bg-pink-50 text-pink-600"
              : "border-gray-300 bg-white text-gray-500"
          }`}
        >
          絞り込み
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-pink-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
          <span className="ml-1 text-xs">{expanded ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* 折りたたみパネル */}
      {expanded && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
          {/* エリア */}
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium">エリア</p>
            <div className="flex gap-2 flex-wrap">
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
            </div>
          </div>

          {/* キャラ */}
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium">キャラ</p>
            <div className="flex gap-2">
              {CHARACTERS.map((c) => {
                const active = selectedCharacters.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onCharacterToggle(c)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                      active
                        ? "bg-pink-400 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-pink-300"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* タグ */}
          {allTags.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 font-medium">タグ</p>
              <select
                value=""
                aria-label="タグで絞り込み"
                onChange={(e) => { if (e.target.value) onTagToggle(e.target.value); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                <option value="">タグを追加...</option>
                {allTags.map((t) => (
                  <option key={t} value={t} disabled={selectedTags.includes(t)}>
                    {t}{selectedTags.includes(t) ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* その他 */}
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium">その他</p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                aria-pressed={showWanted}
                onClick={() => onShowWantedChange(!showWanted)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  showWanted
                    ? "bg-red-100 text-red-500 border border-red-200"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-pink-300"
                }`}
              >
                ❤️ 欲しい
              </button>
              <button
                type="button"
                aria-pressed={showFavorite}
                onClick={() => onShowFavoriteChange(!showFavorite)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  showFavorite
                    ? "bg-yellow-100 text-yellow-600 border border-yellow-200"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-pink-300"
                }`}
              >
                ⭐ お気に入り
              </button>
              <button
                type="button"
                aria-pressed={showOwnedOnly}
                onClick={() => onShowOwnedOnlyChange(!showOwnedOnly)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  showOwnedOnly
                    ? "bg-pink-100 text-pink-600 border border-pink-200"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-pink-300"
                }`}
              >
                未所持のみ
              </button>
            </div>
          </div>

          {/* クリア */}
          {hasAnyFilter && (
            <button
              onClick={() => { onClearAll(); setExpanded(false); }}
              className="text-xs text-gray-400 underline"
            >
              すべてクリア
            </button>
          )}
        </div>
      )}

      {/* アクティブフィルタのチップ（常時表示） */}
      {activeChips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {chip.label}
              <button
                onClick={chip.onRemove}
                aria-label={`${chip.label}を解除`}
                className="text-pink-400 hover:text-pink-600 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
