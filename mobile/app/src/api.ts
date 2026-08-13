import { API_URL } from "./config";
import type { CollectionItem } from "./types";

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
