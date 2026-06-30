import { test, expect } from "@playwright/test";
import { mockAuth } from "../fixtures/auth";
import { mockApi } from "../fixtures/api";
import { MOCK_ITEMS } from "../fixtures/items";

test.describe("フィルター機能", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");
    // アイテム一覧が表示されるまで待つ
    await expect(page.getByText(MOCK_ITEMS[0].ItemName)).toBeVisible();
  });

  test("アイテム名で検索できる", async ({ page }) => {
    await page.getByPlaceholder("アイテム名・モチーフで検索...").fill("北海道");

    await expect(page.getByText("北海道 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("箱根 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("モチーフで検索できる", async ({ page }) => {
    await page.getByPlaceholder("アイテム名・モチーフで検索...").fill("ハチワレ");

    await expect(page.getByText("箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("エリア名で検索できる", async ({ page }) => {
    await page.getByPlaceholder("アイテム名・モチーフで検索...").fill("沖縄");

    await expect(page.getByText("沖縄 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("箱根 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("エリア種別でフィルタできる", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("市区町村");

    await expect(page.getByText("箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("エリア種別選択後にエリア名でフィルタできる（カスケード）", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("都道府県");

    const areaNameSelect = page.getByRole("combobox").nth(1);
    await expect(areaNameSelect).not.toBeDisabled();

    await areaNameSelect.selectOption("北海道");
    await expect(page.getByText("北海道 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("箱根 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("エリア種別未選択時はエリア名セレクトが無効", async ({ page }) => {
    const areaNameSelect = page.getByRole("combobox").nth(1);
    await expect(areaNameSelect).toBeDisabled();
  });

  test("エリア種別変更でエリア名がリセットされる", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("都道府県");
    await page.getByRole("combobox").nth(1).selectOption("北海道");

    await page.getByRole("combobox").first().selectOption("市区町村");

    // エリア名セレクトが空に戻っている
    await expect(page.getByRole("combobox").nth(1)).toHaveValue("");
  });

  test("キャラクターで絞り込める", async ({ page }) => {
    // 箱根=ハチワレ のみ表示される
    await page.getByRole("button", { name: "ハチワレ", exact: true }).click();

    await expect(page.getByText("箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("未所持のみ表示できる", async ({ page }) => {
    const unownedCount = MOCK_ITEMS.filter((i) => !i.Owned).length;
    await page.getByLabel("未所持のみ").check();

    const cards = page.getByRole("button").filter({ hasText: /ダイカットキーホルダー/ });
    await expect(cards).toHaveCount(unownedCount);

    const ownedItem = MOCK_ITEMS.find((i) => i.Owned)!;
    await expect(page.getByText(ownedItem.ItemName)).not.toBeVisible();
  });

  test("クリアボタンで全フィルタがリセットされる", async ({ page }) => {
    await page.getByPlaceholder("アイテム名・モチーフで検索...").fill("北海道");
    await expect(page.getByRole("button", { name: "クリア" })).toBeVisible();

    await page.getByRole("button", { name: "クリア" }).click();

    await expect(page.getByPlaceholder("アイテム名・モチーフで検索...")).toHaveValue("");
    for (const item of MOCK_ITEMS) {
      await expect(page.getByText(item.ItemName)).toBeVisible();
    }
  });

  test("フィルタ未適用時はクリアボタンが表示されない", async ({ page }) => {
    await expect(page.getByRole("button", { name: "クリア" })).not.toBeVisible();
  });

  test("検索結果が0件の場合はアイテムが表示されない", async ({ page }) => {
    await page.getByPlaceholder("アイテム名・モチーフで検索...").fill("存在しないアイテム");

    const cards = page.getByRole("button").filter({ hasText: /ダイカットキーホルダー/ });
    await expect(cards).toHaveCount(0);
  });
});
