"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { getCollectionItems } from "@/lib/api";
import type { CollectionItem } from "@/lib/types";
import { PREFECTURES, CHARACTERS, OTHER_AREA_LABEL } from "@/lib/types";

function pct(owned: number, total: number) {
  if (total === 0) return 0;
  return Math.round((owned / total) * 100);
}

function ProgressBar({ owned, total }: { owned: number; total: number }) {
  const p = pct(owned, total);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-pink-400 rounded-full transition-all"
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap w-20 text-right">
        {owned}/{total} ({p}%)
      </span>
    </div>
  );
}

export default function StatsPage() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCollectionItems()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalOwned = useMemo(() => items.filter((i) => i.Owned).length, [items]);
  const total = items.length;

  // キャラ別
  const charStats = useMemo(() =>
    CHARACTERS.map((c) => {
      const sub = items.filter((i) => i.Motif === c);
      return { char: c, owned: sub.filter((i) => i.Owned).length, total: sub.length };
    }), [items]);

  // 都道府県別（PREFECTURES 順 + その他）
  const prefStats = useMemo(() => {
    const map = new Map<string, { owned: number; total: number }>();
    items.forEach((i) => {
      const key = i.Prefecture || OTHER_AREA_LABEL;
      const s = map.get(key) ?? { owned: 0, total: 0 };
      s.total++;
      if (i.Owned) s.owned++;
      map.set(key, s);
    });

    const ordered: { pref: string; owned: number; total: number }[] = [];
    PREFECTURES.forEach((p) => {
      const s = map.get(p);
      if (s) ordered.push({ pref: p, ...s });
    });
    const other = map.get(OTHER_AREA_LABEL);
    if (other) ordered.push({ pref: OTHER_AREA_LABEL, ...other });
    return ordered;
  }, [items]);

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-pink-500">集計</h1>
          <Link href="/collection/" className="text-xs text-gray-400 underline">
            コレクションに戻る
          </Link>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && (
          <>
            {/* 全体 */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">全体</h2>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-pink-500">{totalOwned}</span>
                <span className="text-gray-400 text-lg mb-1">/ {total}</span>
                <span className="text-gray-400 text-sm mb-1.5">個</span>
                <span className="ml-auto text-2xl font-bold text-gray-700">{pct(totalOwned, total)}%</span>
              </div>
              <ProgressBar owned={totalOwned} total={total} />
            </section>

            {/* キャラ別 */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">キャラ別</h2>
              <div className="space-y-3">
                {charStats.map(({ char, owned, total: t }) => (
                  <div key={char} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">{char}</span>
                    </div>
                    <ProgressBar owned={owned} total={t} />
                  </div>
                ))}
              </div>
            </section>

            {/* 都道府県別 */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">エリア別</h2>
              <div className="space-y-3">
                {prefStats.map(({ pref, owned, total: t }) => (
                  <div key={pref} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700">{pref}</span>
                    </div>
                    <ProgressBar owned={owned} total={t} />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
