"use client";

import type { CollectionItem } from "@/lib/types";
import ItemCard from "./ItemCard";

type Props = {
  items: CollectionItem[];
  dirtyNames?: Set<string>;
  onToggle: (item: CollectionItem) => void;
  onZoom?: (imageUrl: string, alt: string) => void;
  onEditTags?: (item: CollectionItem) => void;
  onTagClick?: (tag: string) => void;
};

export default function CollectionGrid({ items, dirtyNames, onToggle, onZoom, onEditTags, onTagClick }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p>該当するアイテムがありません</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {items.map((item) => (
        <ItemCard key={item.ItemName} item={item} dirty={dirtyNames?.has(item.ItemName)} onToggle={onToggle} onZoom={onZoom} onEditTags={onEditTags} onTagClick={onTagClick} />
      ))}
    </div>
  );
}
