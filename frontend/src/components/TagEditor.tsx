"use client";

import { useRef, useState } from "react";
import type { CollectionItem } from "@/lib/types";

type Props = {
  item: CollectionItem;
  allTags: string[];
  onSave: (tags: string[]) => Promise<void>;
  onClose: () => void;
};

export default function TagEditor({ item, allTags, onSave, onClose }: Props) {
  const [tags, setTags] = useState<string[]>(item.Tags ?? []);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = allTags.filter(
    (t) => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t)
  );

  function addTag(tag: string) {
    const t = tag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t].sort());
    setInput("");
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(tags);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="font-bold text-lg mb-1 text-gray-800">タグを編集</h2>
        <p className="text-sm text-gray-500 mb-4 break-all">{item.ItemName}</p>

        {/* 現在のタグ */}
        <div className="flex flex-wrap gap-2 min-h-[2rem] mb-3">
          {tags.length === 0 && (
            <span className="text-sm text-gray-400">タグなし</span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                aria-label={`${tag} を削除`}
                className="text-pink-400 hover:text-pink-600 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* タグ入力 */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                e.preventDefault();
                addTag(input);
              }
            }}
            placeholder="タグを追加（Enter で確定）"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
          {/* サジェスト */}
          {input && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 z-10 max-h-40 overflow-y-auto">
              {suggestions.slice(0, 8).map((s) => (
                <li key={s}>
                  <button
                    onClick={() => addTag(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-pink-50 text-gray-700"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-pink-400 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={onClose}
            className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
