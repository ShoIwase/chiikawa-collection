"use client";

import Image from "next/image";
import type { CollectionItem } from "@/lib/types";

type Props = {
  item: CollectionItem;
  onToggle: (item: CollectionItem) => void;
  onZoom?: (imageUrl: string, alt: string) => void;
};

const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "";

export default function ItemCard({ item, onToggle, onZoom }: Props) {
  const imageUrl = item.ImageUrl ? `${CLOUDFRONT_URL}${item.ImageUrl}` : "/no-image.png";

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-sm transition-all ${
        item.Owned ? "ring-2 ring-pink-400" : "opacity-50 grayscale"
      }`}
    >
      {/* 画像エリア: タップで拡大 */}
      <button
        onClick={() => onZoom?.(imageUrl, item.ItemName)}
        className="w-full aspect-square bg-gray-100 relative block active:scale-95 transition-transform"
        aria-label={`${item.ItemName} を拡大`}
      >
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
        <div className="absolute bottom-1 right-1 bg-black/40 text-white text-xs rounded px-1">
          🔍
        </div>
      </button>

      {/* テキストエリア: タップで所持トグル */}
      <button
        onClick={() => onToggle(item)}
        className="w-full p-2 bg-white text-left active:bg-pink-50 transition-colors"
        aria-label={`${item.ItemName} の所持をトグル`}
      >
        <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
          {item.ItemName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{item.AreaName}</p>
      </button>
    </div>
  );
}
