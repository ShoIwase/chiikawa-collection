"use client";

import { useCallback, useRef, useState } from "react";
import { scanPhoto, updateItemStatus, type ScanMatchedItem } from "@/lib/api";

type Props = {
  onClose: () => void;
  onUpdated: (itemNames: string[]) => void;
  ownedNames: Set<string>;
};

const MAX_PX = 1600;

async function resizeAndEncode(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const mimeType = "image/jpeg";
      const base64 = canvas.toDataURL(mimeType).split(",")[1];
      resolve({ base64, mimeType });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// キャラ表示順
const CHAR_ORDER: Record<string, number> = { ちいかわ: 0, ハチワレ: 1, うさぎ: 2 };

export default function ScanModal({ onClose, onUpdated, ownedNames }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [matched, setMatched] = useState<ScanMatchedItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleFile = useCallback(async (file: File) => {
    setScanError("");
    setAreas([]);
    setMatched([]);
    setChecked(new Set());

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setScanning(true);

    try {
      const { base64, mimeType } = await resizeAndEncode(file);
      const result = await scanPhoto(base64, mimeType);
      setAreas(result.areas);

      const sorted = [...result.matched].sort(
        (a, b) =>
          a.areaName.localeCompare(b.areaName, "ja") ||
          (CHAR_ORDER[a.motif] ?? 9) - (CHAR_ORDER[b.motif] ?? 9)
      );
      setMatched(sorted);
      // 未所持のものだけ初期チェック
      setChecked(new Set(sorted.filter((i) => !ownedNames.has(i.itemName)).map((i) => i.itemName)));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "スキャンに失敗しました");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const toggleItem = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleArea = (areaName: string) => {
    const areaItems = matched.filter((i) => i.areaName === areaName).map((i) => i.itemName);
    const allChecked = areaItems.every((n) => checked.has(n));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) areaItems.forEach((n) => next.delete(n));
      else areaItems.forEach((n) => next.add(n));
      return next;
    });
  };

  const handleSave = async () => {
    const names = [...checked];
    if (names.length === 0) return;
    setSaving(true);
    setSaveError("");
    try {
      await Promise.all(names.map((name) => updateItemStatus(name, true)));
      onUpdated(names);
      onClose();
    } catch {
      setSaveError("一部の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // エリアごとにグループ化
  const groupedAreas = [...new Set(matched.map((i) => i.areaName))];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90dvh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">写真でスキャン</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 写真選択エリア */}
          {!preview ? (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-pink-200 rounded-xl py-10 text-center text-sm text-pink-400 hover:border-pink-400 hover:bg-pink-50 transition-colors"
            >
              写真を選択 / カメラで撮影
            </button>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="スキャン対象" className="w-full rounded-xl object-contain max-h-48" />
              <button
                onClick={() => {
                  setPreview(null);
                  setAreas([]);
                  setMatched([]);
                  setChecked(new Set());
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full"
              >
                別の写真
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleInputChange}
          />

          {/* スキャン中 */}
          {scanning && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-400" />
              スキャン中...
            </div>
          )}

          {scanError && <p className="text-sm text-red-500">{scanError}</p>}

          {/* スキャン結果 */}
          {!scanning && matched.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {areas.length} エリアを認識 · {groupedAreas.length} アイテムにマッチ
              </p>
              {groupedAreas.map((areaName) => {
                const items = matched.filter((i) => i.areaName === areaName);
                const allChecked = items.every((i) => checked.has(i.itemName));
                return (
                  <div key={areaName} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-left"
                      onClick={() => toggleArea(areaName)}
                    >
                      <span className="text-sm font-medium text-gray-700">{areaName}</span>
                      <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${allChecked ? "bg-pink-400 border-pink-400" : "border-gray-300"}`}>
                        {allChecked && <span className="text-white text-xs">✓</span>}
                      </span>
                    </button>
                    <div className="divide-y divide-gray-50">
                      {items.map((item) => {
                        const alreadyOwned = ownedNames.has(item.itemName);
                        return (
                          <label key={item.itemName} className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 ${alreadyOwned ? "opacity-60" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked.has(item.itemName)}
                              onChange={() => toggleItem(item.itemName)}
                              disabled={alreadyOwned}
                              className="accent-pink-400"
                            />
                            <span className="text-sm text-gray-600">{item.motif}</span>
                            {alreadyOwned && (
                              <span className="ml-auto text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">登録済み</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!scanning && preview && matched.length === 0 && areas.length === 0 && !scanError && (
            <p className="text-sm text-gray-400 text-center py-2">キーホルダーが認識できませんでした</p>
          )}

          {!scanning && preview && areas.length > 0 && matched.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">
              認識した地域: {areas.join("、")}（DBに該当なし）
            </p>
          )}
        </div>

        {/* フッター */}
        {matched.length > 0 && !scanning && (
          <div className="px-5 py-4 border-t border-gray-100 space-y-2">
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <button
              onClick={handleSave}
              disabled={saving || checked.size === 0}
              className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              {saving ? "保存中..." : `${checked.size}件を所持状態に反映`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
