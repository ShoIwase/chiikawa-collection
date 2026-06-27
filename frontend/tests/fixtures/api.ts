import type { Page } from "@playwright/test";
import type { CollectionItem, MasterItem } from "../../src/lib/types";
import { MOCK_ITEMS, MOCK_PENDING } from "./items";

const API = "https://api.chiikawa.test";

type MockApiOptions = {
  items?: CollectionItem[];
  pending?: MasterItem[];
  statusError?: boolean;
  verifyError?: boolean;
};

export async function mockApi(page: Page, options: MockApiOptions = {}) {
  const items = options.items ?? MOCK_ITEMS;
  const pending = options.pending ?? [];

  await page.route(`${API}/items`, (route) =>
    route.fulfill({ json: { items } })
  );
  await page.route(`${API}/items/pending`, (route) =>
    route.fulfill({ json: { items: pending } })
  );
  await page.route(`${API}/items/*/status`, (route) => {
    if (options.statusError) {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    } else {
      route.fulfill({ status: 200, json: {} });
    }
  });
  await page.route(`${API}/items/*/verify`, (route) => {
    if (options.verifyError) {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    } else {
      route.fulfill({ status: 200, json: {} });
    }
  });
}
