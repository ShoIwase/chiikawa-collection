import type { MasterItem } from "./types";

// ItemName先頭のキャラ名と末尾の「ダイカットキーホルダー」表記を除いた表示用文字列を作る
// (frontend/src/lib/format.ts と同じロジック)
export function splitItemDisplay(item: Pick<MasterItem, "ItemName" | "Motif">) {
  let detail = item.ItemName.replace(/[\s　]*ダイカットキーホルダー$/, "");
  if (item.Motif && detail.startsWith(item.Motif)) {
    detail = detail.slice(item.Motif.length).replace(/^[\s　]+/, "");
  }
  return { motif: item.Motif, detail };
}

// JSTでYYYY/MM/DD HH:mm形式に整形する (frontend/src/lib/format.ts と同じロジック)
export function formatDateTimeJst(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
