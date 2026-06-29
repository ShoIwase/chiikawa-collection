import { test, expect } from "@playwright/test";
import { mockAuth, mockUnauthenticated } from "../fixtures/auth";
import { mockApi } from "../fixtures/api";
import { MOCK_ITEMS, MOCK_PENDING } from "../fixtures/items";

test.describe("コレクションページ", () => {
  test("未認証の場合 /login/ にリダイレクト", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/collection/");
    await expect(page).toHaveURL(/\/login\//);
  });

  test("アイテム一覧が表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    for (const item of MOCK_ITEMS) {
      await expect(page.getByText(item.ItemName)).toBeVisible();
    }
  });

  test("所持数カウントが正しく表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const ownedCount = MOCK_ITEMS.filter((i) => i.Owned).length;
    await expect(
      page.getByText(`${ownedCount} / ${MOCK_ITEMS.length} 個所持`)
    ).toBeVisible();
  });

  test("未所持アイテムはグレーアウト表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByRole("button").filter({ hasText: unownedItem.ItemName });
    await expect(card).toHaveClass(/grayscale/);
    await expect(card).toHaveClass(/opacity-50/);
  });

  test("所持アイテムはリングつきで表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const ownedItem = MOCK_ITEMS.find((i) => i.Owned)!;
    const card = page.getByRole("button").filter({ hasText: ownedItem.ItemName });
    await expect(card).toHaveClass(/ring-pink-400/);
  });

  test("アイテムクリックで所持状態がトグルされる", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByRole("button").filter({ hasText: unownedItem.ItemName });

    await card.click();
    await expect(card).toHaveClass(/ring-pink-400/);
  });

  test("APIエラー時に所持状態がロールバックされる", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, statusError: true });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByRole("button").filter({ hasText: unownedItem.ItemName });

    await card.click();
    // 楽観的更新 → ロールバック後、グレーに戻る
    await expect(card).toHaveClass(/grayscale/);
  });

  test("未確認アイテムがある場合アラートバナーが表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/collection/");

    await expect(
      page.getByText(`未確認の新着アイテムが ${MOCK_PENDING.length} 件あります。タップして確認する`)
    ).toBeVisible();
  });

  test("アラートバナークリックで /verify/ に遷移する", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/collection/");

    await page.getByText(/未確認の新着アイテム/).click();
    await expect(page).toHaveURL(/\/verify\//);
  });

  test("未確認アイテムがない場合アラートバナーは表示されない", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: [] });
    await page.goto("/collection/");

    await expect(page.getByText(/未確認の新着アイテム/)).not.toBeVisible();
  });

  test("アイテム画像が src 属性を持つ", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");
    await expect(page.getByText(MOCK_ITEMS[0].ItemName)).toBeVisible();

    const imgs = await page.locator("img").all();
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      const src = await img.getAttribute("src");
      expect(src).toBeTruthy();
      expect(src).not.toContain("/images/images/");
    }
  });

  test("ログアウトで /login/ にリダイレクト", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/login\//);
  });
});
