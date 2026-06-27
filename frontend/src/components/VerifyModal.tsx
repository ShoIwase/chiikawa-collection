"use client";

import { useState } from "react";
import type { MasterItem } from "@/lib/types";
import { AREA_TYPES } from "@/lib/types";

type Props = {
  item: MasterItem;
  onConfirm: (itemName: string, patch: { areaType: string; areaName: string; motif: string }) => Promise<void>;
  onSkip: () => void;
};

export default function VerifyModal({ item, onConfirm, onSkip }: Props) {
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="font-bold text-lg mb-1 text-gray-800">アイテムを確認</h2>
        <p className="text-sm text-gray-500 mb-4 break-all">{item.ItemName}</p>

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

        <div className="flex gap-3 mt-6">
          <button
            onClick={onSkip}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            スキップ
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !areaType || !areaName}
            className="flex-1 bg-pink-400 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? "確定中..." : "確定"}
          </button>
        </div>
      </div>
    </div>
  );
}
