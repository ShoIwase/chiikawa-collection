"use client";

import Image from "next/image";
import type { CollectionItem } from "@/lib/types";

type Props = {
  item: CollectionItem;
  onToggle: (item: CollectionItem) => void;
};

const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "";

export default function ItemCard({ item, onToggle }: Props) {
  const imageUrl = item.ImageUrl ? `${CLOUDFRONT_URL}${item.ImageUrl}` : "/no-image.png";

  return (
    <button
      onClick={() => onToggle(item)}
      className={`relative rounded-2xl overflow-hidden shadow-sm transition-all active:scale-95 ${
        item.Owned
          ? "ring-2 ring-pink-400 opacity-100"
          : "opacity-50 grayscale"
      }`}
    >
      <div className="aspect-square bg-gray-100 relative">
        <Image
          src={imageUrl}
          alt={item.ItemName}
          fill
          className="object-cover"
          unoptimized
        />
        {item.Owned && (
          <div className="absolute top-1 right-1 bg-pink-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            ✓
          </div>
        )}
      </div>
      <div className="p-2 bg-white text-left">
        <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
          {item.ItemName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{item.AreaName}</p>
      </div>
    </button>
  );
}
