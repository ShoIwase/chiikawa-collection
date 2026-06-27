import { test, expect } from "@playwright/test";
import { mockAuth, mockUnauthenticated } from "../fixtures/auth";
import { mockApi } from "../fixtures/api";
import { MOCK_ITEMS, MOCK_PENDING } from "../fixtures/items";

test.describe("確認ページ", () => {
  test("未認証の場合 /login/ にリダイレクト", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/verify/");
    await expect(page).toHaveURL(/\/login\//);
  });

  test("未確認アイテムが表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/verify/");

    const item = MOCK_PENDING[0];
    await expect(page.getByText(item.ItemName)).toBeVisible();
    await expect(page.getByLabel("モチーフ")).toHaveValue(item.Motif);
    await expect(page.getByLabel("エリア名")).toHaveValue(item.AreaName);
  });

  test("進捗カウンターが表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/verify/");

    await expect(page.getByText(`1 / ${MOCK_PENDING.length} 件`)).toBeVisible();
  });

  test("スキップで次のアイテムに進む（最後のアイテムでは /collection/ にリダイレクト）", async ({
    page,
  }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/verify/");

    await page.getByRole("button", { name: "スキップ" }).click();
    await expect(page).toHaveURL(/\/collection\//);
  });

  test("確定で /items/*/verify が呼ばれて次へ進む", async ({ page }) => {
    let verifyCalled = false;
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.route("https://api.chiikawa.test/items/*/verify", (route) => {
      verifyCalled = true;
      route.fulfill({ status: 200, json: {} });
    });
    await page.goto("/verify/");

    await page.getByRole("button", { name: "確定" }).click();
    await expect(page).toHaveURL(/\/collection\//);
    expect(verifyCalled).toBe(true);
  });

  test("モーダルでメタデータを編集できる", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/verify/");

    const motifInput = page.getByLabel("モチーフ");
    await motifInput.fill("うさぎ");
    await expect(motifInput).toHaveValue("うさぎ");

    const areaNameInput = page.getByLabel("エリア名");
    await areaNameInput.fill("行徳");
    await expect(areaNameInput).toHaveValue("行徳");
  });

  test("エリア名が空の場合は確定ボタンが無効化される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/verify/");

    await page.getByLabel("エリア名").clear();
    await expect(page.getByRole("button", { name: "確定" })).toBeDisabled();
  });

  test("未確認アイテムが0件の場合は空状態メッセージが表示される", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: [] });
    await page.goto("/verify/");

    await expect(page.getByText("未確認のアイテムはありません")).toBeVisible();
  });

  test("複数アイテムがある場合にスキップで次のアイテムへ進む", async ({ page }) => {
    const multiPending = [
      ...MOCK_PENDING,
      {
        ...MOCK_PENDING[0],
        ItemName: "京都 ダイカットキーホルダー",
        AreaName: "京都",
        AreaType: "都道府県" as const,
      },
    ];
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: multiPending });
    await page.goto("/verify/");

    await expect(page.getByText("1 / 2 件")).toBeVisible();
    await page.getByRole("button", { name: "スキップ" }).click();
    await expect(page.getByText("2 / 2 件")).toBeVisible();
    await expect(page.getByText("京都 ダイカットキーホルダー")).toBeVisible();
  });
});
