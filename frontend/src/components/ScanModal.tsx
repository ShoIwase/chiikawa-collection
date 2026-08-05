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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // HEIC など、ブラウザがデコードできない形式で発生する
      reject(new Error("この画像は読み込めませんでした。別の写真をお試しください"));
    };
    img.src = url;
  });
}

// キャラ表示順
const CHAR_ORDER: Record<string, number> = { ちいかわ: 0, ハチワレ: 1, うさぎ: 2 };

const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "";

export default function ScanModal({ onClose, onUpdated, ownedNames }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [matched, setMatched] = useState<ScanMatchedItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const resetResult = useCallback(() => {
    setAreas([]);
    setMatched([]);
    setChecked(new Set());
    setCollapsed(new Set());
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setScanError("");
      resetResult();

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
            a.itemDetail.localeCompare(b.itemDetail, "ja") ||
            (CHAR_ORDER[a.motif] ?? 9) - (CHAR_ORDER[b.motif] ?? 9)
        );
        setMatched(sorted);

        // 商品まで特定できた未所持のものだけ初期チェック。
        // 地域しか読めていない候補（confidence: "area"）は誤登録を防ぐため外す。
        setChecked(
          new Set(
            sorted
              .filter((i) => i.confidence !== "area" && !ownedNames.has(i.itemName))
              .map((i) => i.itemName)
          )
        );
        // 確度の低い地域グループは畳んでおく
        const lowAreas = [...new Set(sorted.map((i) => i.areaName))].filter((area) =>
          sorted.filter((i) => i.areaName === area).every((i) => i.confidence === "area")
        );
        setCollapsed(new Set(lowAreas));
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "スキャンに失敗しました");
      } finally {
        setScanning(false);
      }
    },
    [ownedNames, resetResult]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clearPhoto = () => {
    setPreview(null);
    setScanError("");
    resetResult();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  };

  const toggleItem = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // 選択可能（未所持）なアイテム名だけをまとめて反転する
  const toggleMany = (items: ScanMatchedItem[]) => {
    const names = items.filter((i) => !ownedNames.has(i.itemName)).map((i) => i.itemName);
    if (names.length === 0) return;
    const allChecked = names.every((n) => checked.has(n));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) names.forEach((n) => next.delete(n));
      else names.forEach((n) => next.add(n));
      return next;
    });
  };

  const toggleCollapsed = (areaName: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(areaName)) next.delete(areaName);
      else next.add(areaName);
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

  // エリア → 商品 の2階層でグループ化する
  const groupedAreas = [...new Set(matched.map((i) => i.areaName))];
  const unownedCount = matched.filter((i) => !ownedNames.has(i.itemName)).length;

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
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="border-2 border-dashed border-pink-200 rounded-xl py-8 text-center text-sm text-pink-400 hover:border-pink-400 hover:bg-pink-50 transition-colors"
              >
                📷<br />カメラで撮影
              </button>
              <button
                onClick={() => libraryInputRef.current?.click()}
                className="border-2 border-dashed border-pink-200 rounded-xl py-8 text-center text-sm text-pink-400 hover:border-pink-400 hover:bg-pink-50 transition-colors"
              >
                🖼️<br />写真を選ぶ
              </button>
            </div>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="スキャン対象" className="w-full rounded-xl object-contain max-h-48" />
              <button
                onClick={clearPhoto}
                className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full"
              >
                別の写真
              </button>
            </div>
          )}

          {/* カメラ起動用（capture 指定）と、保存済み写真から選ぶ用の2本立て。
              capture を付けた input だけだと端末によっては写真ライブラリを開けない。 */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleInputChange}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
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
                {areas.length}件を認識 · 該当 {matched.length}件（未登録 {unownedCount}件）
              </p>
              {groupedAreas.map((areaName) => {
                const areaItems = matched.filter((i) => i.areaName === areaName);
                const products = [...new Set(areaItems.map((i) => i.itemDetail))];
                const isCandidate = areaItems.every((i) => i.confidence === "area");
                const selectable = areaItems.filter((i) => !ownedNames.has(i.itemName));
                const allChecked =
                  selectable.length > 0 && selectable.every((i) => checked.has(i.itemName));
                const isCollapsed = collapsed.has(areaName);

                return (
                  <div key={areaName} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                      <button
                        className="flex-1 flex items-center gap-2 text-left"
                        onClick={() => toggleCollapsed(areaName)}
                        aria-expanded={!isCollapsed}
                      >
                        <span className="text-xs text-gray-400">{isCollapsed ? "▶" : "▼"}</span>
                        <span className="text-sm font-medium text-gray-700">{areaName}</span>
                        {isCandidate && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            地域のみ一致
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => toggleMany(areaItems)}
                        aria-label={`${areaName}をまとめて選択`}
                        aria-pressed={allChecked}
                        disabled={selectable.length === 0}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center disabled:opacity-40 ${allChecked ? "bg-pink-400 border-pink-400" : "border-gray-300"}`}
                      >
                        {allChecked && <span className="text-white text-xs">✓</span>}
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="divide-y divide-gray-100">
                        {products.map((detail) => {
                          const productItems = areaItems.filter((i) => i.itemDetail === detail);
                          return (
                            <div key={detail}>
                              <button
                                onClick={() => toggleMany(productItems)}
                                className="w-full text-left px-4 pt-2 pb-1 text-xs font-medium text-gray-500 hover:text-pink-500"
                              >
                                {detail || "（商品名なし）"}
                              </button>
                              <div className="divide-y divide-gray-50">
                                {productItems.map((item) => {
                                  const alreadyOwned = ownedNames.has(item.itemName);
                                  return (
                                    <label
                                      key={item.itemName}
                                      className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 ${alreadyOwned ? "opacity-60" : ""}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked.has(item.itemName)}
                                        onChange={() => toggleItem(item.itemName)}
                                        disabled={alreadyOwned}
                                        className="accent-pink-400"
                                      />
                                      {item.imageUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={`${CLOUDFRONT_URL}${item.imageUrl}`}
                                          alt={`${item.itemDetail} ${item.motif}`}
                                          className="w-9 h-9 rounded object-cover flex-shrink-0 bg-gray-100"
                                        />
                                      )}
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
              認識した内容: {areas.join("、")}（DBに該当なし）
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
