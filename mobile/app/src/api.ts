import { API_URL } from "./config";
import type { CollectionItem, MasterItem } from "./types";

export class UnauthorizedError extends Error {}

function authHeaders(idToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

async function checkResponse(res: Response, label: string): Promise<void> {
  if (res.status === 401) throw new UnauthorizedError(`${label}: unauthorized`);
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
}

export async function getCollectionItems(idToken: string): Promise<CollectionItem[]> {
  const res = await fetch(`${API_URL}/items`, { headers: authHeaders(idToken) });
  await checkResponse(res, "GET /items");
  const data = await res.json();
  return data.items as CollectionItem[];
}

export async function setItemOwned(itemName: string, owned: boolean, idToken: string): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/status`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify({ owned }),
  });
  await checkResponse(res, `PUT /items/${itemName}/status`);
}

export async function setItemTags(itemName: string, tags: string[], idToken: string): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/tags`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify({ tags }),
  });
  await checkResponse(res, `PUT /items/${itemName}/tags`);
}

export async function getPendingItems(idToken: string): Promise<MasterItem[]> {
  const res = await fetch(`${API_URL}/items/pending`, { headers: authHeaders(idToken) });
  await checkResponse(res, "GET /items/pending");
  const data = await res.json();
  return data.items as MasterItem[];
}

export async function verifyItem(
  itemName: string,
  patch: { areaType: string; areaName: string; motif: string },
  idToken: string
): Promise<void> {
  const encoded = encodeURIComponent(itemName);
  const res = await fetch(`${API_URL}/items/${encoded}/verify`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(patch),
  });
  await checkResponse(res, `PUT /items/${itemName}/verify`);
}

// exact=商品まで確定 / partial=表記ゆれ込みで一致 / area=地域しか読めず候補止まり
export type ScanConfidence = "exact" | "partial" | "area";

export type ScanMatchedItem = {
  itemName: string;
  itemDetail: string;
  areaName: string;
  motif: string;
  prefecture: string;
  imageUrl: string;
  confidence: ScanConfidence;
};

export type ScanResult = {
  areas: string[];
  matched: ScanMatchedItem[];
};

export async function scanPhoto(imageBase64: string, mimeType: string, idToken: string): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/scan`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ image: imageBase64, mimeType }),
  });
  await checkResponse(res, "POST /scan");
  const body: { areas?: string[]; matched?: Partial<ScanMatchedItem>[] } = await res.json();

  // itemDetail / confidence がまだ無い旧バックエンドでも壊れないよう既定値を補う
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
