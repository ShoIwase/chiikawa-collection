"use client";

import Image from "next/image";
import { useState } from "react";
import type { MasterItem } from "@/lib/types";
import { AREA_TYPES } from "@/lib/types";

const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "";

type Props = {
  item: MasterItem;
  onConfirm: (itemName: string, patch: { areaType: string; areaName: string; motif: string }) => Promise<void>;
  onSkip: () => void;
  onBulkApprove?: () => void;
  remainingCount?: number;
  bulkProgress?: number | null;
};

export default function VerifyModal({ item, onConfirm, onSkip, onBulkApprove, remainingCount, bulkProgress }: Props) {
  const [areaType, setAreaType] = useState(item.AreaType);
  const [areaName, setAreaName] = useState(item.AreaName);
  const [motif, setMotif] = useState(item.Motif);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(item.ItemName, { areaType, areaName, motif });
    } finally {
      setLoading(false);
    }
  }

  const imageUrl = item.ImageUrl ? `${CLOUDFRONT_URL}${item.ImageUrl}` : "/no-image.png";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="font-bold text-lg mb-1 text-gray-800">アイテムを確認</h2>
        <p className="text-sm text-gray-500 mb-3 break-all">{item.ItemName}</p>

        {/* 画像プレビュー */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-100 mb-4">
          <Image src={imageUrl} alt={item.ItemName} fill className="object-contain" unoptimized />
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="motif" className="block text-xs font-medium text-gray-500 mb-1">モチーフ</label>
            <input
              id="motif"
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          <div>
            <label htmlFor="areaType" className="block text-xs font-medium text-gray-500 mb-1">エリア種別</label>
            <select
              id="areaType"
              value={areaType}
              onChange={(e) => setAreaType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
            >
              {AREA_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="areaName" className="block text-xs font-medium text-gray-500 mb-1">エリア名</label>
            <input
              id="areaName"
              type="text"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <button
            onClick={handleConfirm}
            disabled={loading || !areaType || !areaName}
            className="w-full bg-pink-400 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-base transition-colors"
          >
            {loading ? "確定中..." : "確定"}
          </button>
          <button
            onClick={onSkip}
            className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
          >
            スキップ
          </button>
        </div>

        {onBulkApprove && remainingCount != null && (
          <div className="mt-3">
            {bulkProgress == null ? (
              <button
                onClick={onBulkApprove}
                className="w-full border border-gray-200 text-gray-400 rounded-lg py-2 text-xs hover:bg-gray-50 transition-colors"
              >
                すべてそのまま確定（残り {remainingCount} 件）
              </button>
            ) : (
              <div className="space-y-1">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-pink-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${(bulkProgress / remainingCount) * 100}%` }}
                  />
                </div>
                <p className="text-center text-xs text-gray-400">
                  {bulkProgress} / {remainingCount} 件処理中...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
