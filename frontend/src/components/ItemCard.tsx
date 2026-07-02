"use client";

import Image from "next/image";
import type { CollectionItem } from "@/lib/types";
import { WANT_TAG, FAV_TAG } from "@/lib/types";

type Props = {
  item: CollectionItem;
  dirty?: boolean;
  onToggle: (item: CollectionItem) => void;
  onZoom?: (imageUrl: string, alt: string) => void;
  onEditTags?: (item: CollectionItem) => void;
  onToggleWant?: (item: CollectionItem) => void;
  onToggleFav?: (item: CollectionItem) => void;
};

const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "";

export default function ItemCard({ item, dirty, onToggle, onZoom, onEditTags, onToggleWant, onToggleFav }: Props) {
  const imageUrl = item.ImageUrl ? `${CLOUDFRONT_URL}${item.ImageUrl}` : "/no-image.png";

  const isWanted = item.Tags?.includes(WANT_TAG) ?? false;
  const isFav = item.Tags?.includes(FAV_TAG) ?? false;

  // 未保存(dirty)は琥珀色リングで強調、確定済みの所持はピンクリング
  const ringClass = dirty
    ? "ring-2 ring-amber-400"
    : item.Owned
    ? "ring-2 ring-pink-400"
    : "";
  const dimClass = item.Owned ? "" : "opacity-50 grayscale";

  return (
    <div
      data-testid={`card-${item.ItemName}`}
      className={`relative rounded-2xl overflow-hidden shadow-sm transition-all ${dimClass} ${ringClass}`}
    >
      {/* 状態バッジ（左上・クリックを妨げない）: 未保存 > 所持 */}
      {dirty ? (
        <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none bg-amber-400 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
          未保存
        </div>
      ) : item.Owned ? (
        <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none bg-pink-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
          ✓ 所持
        </div>
      ) : null}

      {/* カード全体が所持トグル（ネイティブ button なのでキーボード操作も対応） */}
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-pressed={item.Owned}
        aria-label={`${item.ItemName} の所持をトグル`}
        className="block w-full text-left active:scale-[0.98] transition-transform"
      >
        <div className="w-full aspect-square bg-gray-100 relative">
          <Image src={imageUrl} alt={item.ItemName} fill className="object-cover" unoptimized />
        </div>
        <div className="p-2 pb-8 bg-white">
          <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
            {item.ItemName}
          </p>
          {item.Tags && item.Tags.filter((t) => t !== WANT_TAG && t !== FAV_TAG).length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.Tags.filter((t) => t !== WANT_TAG && t !== FAV_TAG).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-pink-50 text-pink-600 rounded px-1.5 py-0.5 leading-none"
                >
                  {tag}
                </span>
              ))}
              {item.Tags.filter((t) => t !== WANT_TAG && t !== FAV_TAG).length > 3 && (
                <span className="text-[10px] text-gray-400">+{item.Tags.filter((t) => t !== WANT_TAG && t !== FAV_TAG).length - 3}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">{item.AreaName}</p>
          )}
        </div>
      </button>

      {/* 拡大ボタン（右上） */}
      <button
        type="button"
        onClick={() => onZoom?.(imageUrl, item.ItemName)}
        aria-label={`${item.ItemName} を拡大`}
        className="absolute top-1.5 right-1.5 z-20 bg-black/45 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm active:scale-90"
      >
        🔍
      </button>

      {/* 欲しい / お気に入りボタン（左下） */}
      <div className="absolute bottom-1.5 left-1.5 z-20 flex gap-1">
        {onToggleWant && (
          <button
            type="button"
            onClick={() => onToggleWant(item)}
            aria-label={isWanted ? "欲しいを解除" : "欲しいに追加"}
            aria-pressed={isWanted}
            className="bg-white/90 rounded-full w-7 h-7 flex items-center justify-center text-sm shadow-sm active:scale-90"
          >
            {isWanted ? "❤️" : "🤍"}
          </button>
        )}
        {onToggleFav && (
          <button
            type="button"
            onClick={() => onToggleFav(item)}
            aria-label={isFav ? "お気に入りを解除" : "お気に入りに追加"}
            aria-pressed={isFav}
            className="bg-white/90 rounded-full w-7 h-7 flex items-center justify-center text-sm shadow-sm active:scale-90"
          >
            {isFav ? "⭐" : "☆"}
          </button>
        )}
      </div>

      {/* タグ編集ボタン（右下） */}
      {onEditTags && (
        <button
          type="button"
          onClick={() => onEditTags(item)}
          aria-label={`${item.ItemName} のタグを編集`}
          className="absolute bottom-1.5 right-1.5 z-20 bg-white/90 text-gray-500 text-xs rounded-full w-7 h-7 flex items-center justify-center shadow-sm hover:bg-white active:scale-90"
        >
          ✏️
        </button>
      )}
    </div>
  );
}
