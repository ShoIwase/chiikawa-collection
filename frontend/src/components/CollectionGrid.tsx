"use client";

import type { CollectionItem } from "@/lib/types";
import { bucketOf } from "@/lib/types";
import ItemCard from "./ItemCard";

type Props = {
  items: CollectionItem[];
  dirtyNames?: Set<string>;
  groupByPrefecture?: boolean;
  onToggle: (item: CollectionItem) => void;
  onZoom?: (imageUrl: string, alt: string) => void;
  onEditTags?: (item: CollectionItem) => void;
  onToggleWant?: (item: CollectionItem) => void;
  onToggleFav?: (item: CollectionItem) => void;
};

function groupConsecutiveByPrefecture(items: CollectionItem[]) {
  const groups: { label: string; items: CollectionItem[] }[] = [];
  for (const item of items) {
    const label = bucketOf(item);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export default function CollectionGrid({ items, dirtyNames, groupByPrefecture, onToggle, onZoom, onEditTags, onToggleWant, onToggleFav }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p>該当するアイテムがありません</p>
      </div>
    );
  }

  const cardProps = { dirtyNames, onToggle, onZoom, onEditTags, onToggleWant, onToggleFav };

  if (groupByPrefecture) {
    const groups = groupConsecutiveByPrefecture(items);
    return (
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={`${group.label}-${group.items[0].ItemName}`}>
            <h2 className="px-4 py-1.5 mb-3 rounded-xl bg-pink-400 text-white text-sm font-bold flex items-center gap-2">
              {group.label}
              <span className="text-xs font-normal text-pink-100">{group.items.length}件</span>
            </h2>
            <ItemGrid items={group.items} {...cardProps} />
          </div>
        ))}
      </div>
    );
  }

  return <ItemGrid items={items} {...cardProps} />;
}

function ItemGrid({
  items,
  dirtyNames,
  onToggle,
  onZoom,
  onEditTags,
  onToggleWant,
  onToggleFav,
}: Pick<Props, "items" | "dirtyNames" | "onToggle" | "onZoom" | "onEditTags" | "onToggleWant" | "onToggleFav">) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {items.map((item) => (
        <ItemCard
          key={item.ItemName}
          item={item}
          dirty={dirtyNames?.has(item.ItemName)}
          onToggle={onToggle}
          onZoom={onZoom}
          onEditTags={onEditTags}
          onToggleWant={onToggleWant}
          onToggleFav={onToggleFav}
        />
      ))}
    </div>
  );
}
