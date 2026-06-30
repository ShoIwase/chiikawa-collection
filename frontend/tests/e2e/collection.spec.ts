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
    const card = page.getByTestId(`card-${unownedItem.ItemName}`);
    await expect(card).toHaveClass(/grayscale/);
    await expect(card).toHaveClass(/opacity-50/);
  });

  test("所持アイテムはリングつきで表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const ownedItem = MOCK_ITEMS.find((i) => i.Owned)!;
    const card = page.getByTestId(`card-${ownedItem.ItemName}`);
    await expect(card).toHaveClass(/ring-pink-400/);
  });

  test("タップは未保存（保存するまでサーバーに送られない）", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const toggle = page.getByRole("button", { name: `${unownedItem.ItemName} の所持をトグル` });
    const card = page.getByTestId(`card-${unownedItem.ItemName}`);

    await toggle.click();
    // 未保存ハイライト（琥珀リング）と保存バーが出る
    await expect(card).toHaveClass(/ring-amber-400/);
    await expect(page.getByText(/未保存の変更/)).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
  });

  test("保存ボタンで所持状態が確定される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByTestId(`card-${unownedItem.ItemName}`);

    await page.getByRole("button", { name: `${unownedItem.ItemName} の所持をトグル` }).click();
    await page.getByRole("button", { name: "保存" }).click();

    // 確定後はピンクリング、保存バーは消える
    await expect(card).toHaveClass(/ring-pink-400/);
    await expect(page.getByText(/未保存の変更/)).not.toBeVisible();
  });

  test("取消ボタンで未保存の変更が破棄される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByTestId(`card-${unownedItem.ItemName}`);

    await page.getByRole("button", { name: `${unownedItem.ItemName} の所持をトグル` }).click();
    await page.getByRole("button", { name: "取消" }).click();

    // 元のグレーアウトに戻り、保存バーが消える
    await expect(card).toHaveClass(/grayscale/);
    await expect(page.getByText(/未保存の変更/)).not.toBeVisible();
  });

  test("保存失敗時は未保存のまま残りエラーが出る", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, statusError: true });
    await page.goto("/collection/");

    const unownedItem = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByTestId(`card-${unownedItem.ItemName}`);

    await page.getByRole("button", { name: `${unownedItem.ItemName} の所持をトグル` }).click();
    await page.getByRole("button", { name: "保存" }).click();

    // 失敗 → 未保存（琥珀リング）のまま、エラー表示
    await expect(card).toHaveClass(/ring-amber-400/);
    await expect(page.getByText(/保存に失敗/)).toBeVisible();
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
