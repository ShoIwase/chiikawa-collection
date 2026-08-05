import { fetchAuthSession } from "@/lib/auth";
import type { CollectionItem, MasterItem } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function authHeaders(): Promise<HeadersInit> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getCollectionItems(): Promise<CollectionItem[]> {
  const res = await fetch(`${API_URL}/items`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`GET /items failed: ${res.status}`);
  const data = await res.json();
  return data.items as CollectionItem[];
}

export async function getPendingItems(): Promise<MasterItem[]> {
  const res = await fetch(`${API_URL}/items/pending`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`GET /items/pending failed: ${res.status}`);
  const data = await res.json();
  return data.items as MasterItem[];
}

export async function updateItemStatus(itemName: string, owned: boolean): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/status`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ owned }),
  });
  if (!res.ok) throw new Error(`PUT /items/${itemName}/status failed: ${res.status}`);
}

export async function updateItemTags(itemName: string, tags: string[]): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/tags`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`PUT /items/${itemName}/tags failed: ${res.status}`);
}

// exact=商品まで確定 / partial=表記ゆれ込みで一致 / area=地域しか読めず候補止まり
export type ScanConfidence = "exact" | "partial" | "area";

export type ScanMatchedItem = {
  itemName: string;
  itemDetail: string; // 商品名コア（例「大阪 たこ焼」）。キャラ名と商品種別を除いた部分
  areaName: string;
  motif: string; // キャラ名（ちいかわ/ハチワレ/うさぎ）
  prefecture: string;
  imageUrl: string;
  confidence: ScanConfidence;
};

export type ScanResult = {
  areas: string[];
  matched: ScanMatchedItem[];
};

export async function scanPhoto(imageBase64: string, mimeType: string): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/scan`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ image: imageBase64, mimeType }),
  });
  if (!res.ok) throw new Error(`POST /scan failed: ${res.status}`);
  const body: { areas?: string[]; matched?: Partial<ScanMatchedItem>[] } = await res.json();

  // itemDetail / confidence は scanner Lambda 側の新フィールド。
  // フロントだけ先にデプロイされた状態でも壊れないよう、ここで既定値を補って
  // 呼び出し側には常に揃った形で渡す。
  return {
    areas: body.areas ?? [],
    matched: (body.matched ?? []).map((item) => ({
      itemName: item.itemName ?? "",
      itemDetail: item.itemDetail ?? "",
      areaName: item.areaName ?? "",
      motif: item.motif ?? "",
      prefecture: item.prefecture ?? "",
      imageUrl: item.imageUrl ?? "",
      confidence: item.confidence ?? "exact",
    })),
  };
}

export async function verifyItem(
  itemName: string,
  patch: { areaType?: string; areaName?: string; motif?: string }
): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/verify`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT /items/${itemName}/verify failed: ${res.status}`);
}
