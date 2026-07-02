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

function ProgressBar({ owned, total, color = "pink" }: { owned: number; total: number; color?: "pink" | "green" | "gray" }) {
  const p = pct(owned, total);
  const barColor = color === "green" ? "bg-emerald-400" : color === "gray" ? "bg-gray-300" : "bg-pink-400";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums w-24 text-right">
        {owned}/{total}
        <span className="ml-1 font-semibold text-gray-700">({p}%)</span>
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

  const charStats = useMemo(() =>
    CHARACTERS.map((c) => {
      const sub = items.filter((i) => i.Motif === c);
      return { char: c, owned: sub.filter((i) => i.Owned).length, total: sub.length };
    }), [items]);

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

  const totalP = pct(totalOwned, total);

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-pink-500">🐾 集計</h1>
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
            <section className="bg-gradient-to-br from-pink-400 to-pink-500 rounded-2xl p-6 text-white shadow-md">
              <p className="text-sm font-medium opacity-80 mb-3">全体</p>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <span className="text-6xl font-extrabold leading-none">{totalOwned}</span>
                  <span className="text-2xl font-medium opacity-70 ml-2">/ {total}</span>
                </div>
                <span className="text-5xl font-extrabold opacity-90">{totalP}%</span>
              </div>
              <div className="bg-white/25 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${totalP}%` }}
                />
              </div>
            </section>

            {/* キャラ別 */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-700 mb-4">キャラ別</h2>
              <div className="space-y-4">
                {charStats.map(({ char, owned, total: t }) => {
                  const p = pct(owned, t);
                  return (
                    <div key={char}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-gray-700">{char}</span>
                        <span className="text-sm font-bold text-pink-500">{p}%</span>
                      </div>
                      <ProgressBar owned={owned} total={t} />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* エリア別 */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-700 mb-4">エリア別</h2>
              <div className="space-y-3">
                {prefStats.map(({ pref, owned, total: t }) => {
                  const p = pct(owned, t);
                  const color = p === 100 ? "green" : p === 0 ? "gray" : "pink";
                  return (
                    <div key={pref}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${p === 100 ? "text-emerald-600" : "text-gray-700"}`}>
                          {p === 100 && <span className="mr-1">✓</span>}{pref}
                        </span>
                        <span className={`text-sm font-bold ${p === 100 ? "text-emerald-500" : p === 0 ? "text-gray-400" : "text-pink-500"}`}>
                          {p}%
                        </span>
                      </div>
                      <ProgressBar owned={owned} total={t} color={color} />
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
