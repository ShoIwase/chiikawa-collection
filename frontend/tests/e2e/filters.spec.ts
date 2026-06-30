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

  test("都道府県でフィルタできる（市区町村は親県に集約される）", async ({ page }) => {
    // 箱根は市区町村だが神奈川県を選べば出る（集約）
    await page.getByRole("combobox").first().selectOption("神奈川県");

    await expect(page.getByText("箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("都道府県選択後に市区町村でさらに絞れる（カスケード）", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("神奈川県");

    const citySelect = page.getByRole("combobox").nth(1);
    await expect(citySelect).not.toBeDisabled();

    await citySelect.selectOption("箱根");
    await expect(page.getByText("箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByText("北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByText("沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("都道府県未選択時は市区町村セレクトが無効", async ({ page }) => {
    const citySelect = page.getByRole("combobox").nth(1);
    await expect(citySelect).toBeDisabled();
  });

  test("都道府県変更で市区町村がリセットされる", async ({ page }) => {
    await page.getByRole("combobox").first().selectOption("神奈川県");
    await page.getByRole("combobox").nth(1).selectOption("箱根");

    await page.getByRole("combobox").first().selectOption("北海道");

    // 市区町村セレクトが空に戻っている
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
