"use client";

import { useMemo } from "react";
import type { CollectionItem } from "@/lib/types";
import { AREA_TYPES, CHARACTERS } from "@/lib/types";

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTag: string;
  selectedAreaType: string;
  selectedAreaName: string;
  selectedCharacter: string;
  showOwnedOnly: boolean;
  onSearchTextChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onAreaTypeChange: (v: string) => void;
  onAreaNameChange: (v: string) => void;
  onCharacterChange: (v: string) => void;
  onShowOwnedOnlyChange: (v: boolean) => void;
};

export default function FilterBar({
  items,
  searchText,
  selectedTag,
  selectedAreaType,
  selectedAreaName,
  selectedCharacter,
  showOwnedOnly,
  onSearchTextChange,
  onTagChange,
  onAreaTypeChange,
  onAreaNameChange,
  onCharacterChange,
  onShowOwnedOnlyChange,
}: Props) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [items]);

  // エリア種別ごとのエリア名リスト（カスケード用）
  const areaNamesByType = useMemo(() => {
    const map = new Map<string, Set<string>>();
    items.forEach((i) => {
      if (!i.AreaType || !i.AreaName) return;
      if (!map.has(i.AreaType)) map.set(i.AreaType, new Set());
      map.get(i.AreaType)!.add(i.AreaName);
    });
    return map;
  }, [items]);

  const areaNames = selectedAreaType
    ? [...(areaNamesByType.get(selectedAreaType) ?? [])].sort()
    : [];

  const hasFilter =
    searchText ||
    selectedTag ||
    selectedAreaType ||
    selectedAreaName ||
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
        {/* エリア種別 → エリア名（カスケード） */}
        <select
          value={selectedAreaType}
          aria-label="エリア種別で絞り込み"
          onChange={(e) => onAreaTypeChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="">エリア種別</option>
          {AREA_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={selectedAreaName}
          aria-label="エリア名で絞り込み"
          disabled={!selectedAreaType}
          onChange={(e) => onAreaNameChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">エリア名</option>
          {areaNames.map((n) => (
            <option key={n} value={n}>{n}</option>
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
              onAreaTypeChange("");
              onAreaNameChange("");
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
