"use client";

import { useMemo } from "react";
import type { CollectionItem } from "@/lib/types";
import { AREA_TYPES } from "@/lib/types";

type Props = {
  items: CollectionItem[];
  areaType: string;
  areaName: string;
  searchText: string;
  showOwnedOnly: boolean;
  onAreaTypeChange: (v: string) => void;
  onAreaNameChange: (v: string) => void;
  onSearchTextChange: (v: string) => void;
  onShowOwnedOnlyChange: (v: boolean) => void;
};

export default function FilterBar({
  items,
  areaType,
  areaName,
  searchText,
  showOwnedOnly,
  onAreaTypeChange,
  onAreaNameChange,
  onSearchTextChange,
  onShowOwnedOnlyChange,
}: Props) {
  const areaNames = useMemo(() => {
    const filtered = areaType
      ? items.filter((i) => i.AreaType === areaType)
      : items;
    return [...new Set(filtered.map((i) => i.AreaName))].sort();
  }, [items, areaType]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder="アイテム名・モチーフで検索..."
        value={searchText}
        onChange={(e) => onSearchTextChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
      />
      <div className="flex gap-2 flex-wrap">
        <select
          value={areaType}
          onChange={(e) => {
            onAreaTypeChange(e.target.value);
            onAreaNameChange("");
          }}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="">エリア種別</option>
          {AREA_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={areaName}
          onChange={(e) => onAreaNameChange(e.target.value)}
          disabled={!areaType}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
        >
          <option value="">エリア名</option>
          {areaNames.map((n) => (
            <option key={n} value={n}>{n}</option>
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

        {(areaType || areaName || searchText || showOwnedOnly) && (
          <button
            onClick={() => {
              onAreaTypeChange("");
              onAreaNameChange("");
              onSearchTextChange("");
              onShowOwnedOnlyChange(false);
            }}
            className="text-xs text-gray-400 underline"
          >
            クリア
          </button>
        )}
      </div>
    </div>
  );
}
