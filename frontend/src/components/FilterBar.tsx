"use client";

import { useMemo } from "react";
import type { CollectionItem } from "@/lib/types";

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTag: string;
  showOwnedOnly: boolean;
  onSearchTextChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onShowOwnedOnlyChange: (v: boolean) => void;
};

export default function FilterBar({
  items,
  searchText,
  selectedTag,
  showOwnedOnly,
  onSearchTextChange,
  onTagChange,
  onShowOwnedOnlyChange,
}: Props) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [items]);

  const hasFilter = searchText || selectedTag || showOwnedOnly;

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
              onShowOwnedOnlyChange(false);
            }}
            className="text-xs text-gray-400 underline"
          >
            クリア
          </button>
        )}
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
