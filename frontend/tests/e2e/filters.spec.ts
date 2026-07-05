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
    await expect(page.getByTestId(`card-${MOCK_ITEMS[0].ItemName}`)).toBeVisible();
  });

  test("アイテム名で検索できる", async ({ page }) => {
    await page.getByPlaceholder("名前・エリアで検索...").fill("北海道");

    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("モチーフで検索できる", async ({ page }) => {
    await page.getByPlaceholder("名前・エリアで検索...").fill("ハチワレ");

    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("エリア名で検索できる", async ({ page }) => {
    await page.getByPlaceholder("名前・エリアで検索...").fill("沖縄");

    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("都道府県でフィルタできる（市区町村は親県に集約される）", async ({ page }) => {
    // 箱根は市区町村だが神奈川県を選べば出る（集約）
    await page.getByRole("button", { name: "絞り込み" }).click();
    await page.getByLabel("都道府県で絞り込み").selectOption("神奈川県");

    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("都道府県選択後に市区町村でさらに絞れる（カスケード）", async ({ page }) => {
    await page.getByRole("button", { name: "絞り込み" }).click();
    await page.getByLabel("都道府県で絞り込み").selectOption("神奈川県");

    const citySelect = page.getByLabel("市区町村で絞り込み");
    await expect(citySelect).not.toBeDisabled();

    await citySelect.selectOption("箱根");
    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("都道府県未選択時は市区町村セレクトが無効", async ({ page }) => {
    await page.getByRole("button", { name: "絞り込み" }).click();
    const citySelect = page.getByLabel("市区町村で絞り込み");
    await expect(citySelect).toBeDisabled();
  });

  test("都道府県変更で市区町村がリセットされる", async ({ page }) => {
    await page.getByRole("button", { name: "絞り込み" }).click();
    await page.getByLabel("都道府県で絞り込み").selectOption("神奈川県");
    await page.getByLabel("市区町村で絞り込み").selectOption("箱根");

    await page.getByLabel("都道府県で絞り込み").selectOption("北海道");

    // 市区町村セレクトが空に戻っている
    await expect(page.getByLabel("市区町村で絞り込み")).toHaveValue("");
  });

  test("キャラクターで絞り込める", async ({ page }) => {
    await page.getByRole("button", { name: "絞り込み" }).click();
    // 箱根=ハチワレ のみ表示される
    await page.getByRole("button", { name: "ハチワレ", exact: true }).click();

    await expect(page.getByTestId("card-箱根 ダイカットキーホルダー")).toBeVisible();
    await expect(page.getByTestId("card-北海道 ダイカットキーホルダー")).not.toBeVisible();
    await expect(page.getByTestId("card-沖縄 ダイカットキーホルダー")).not.toBeVisible();
  });

  test("未所持のみ表示できる", async ({ page }) => {
    const unownedCount = MOCK_ITEMS.filter((i) => !i.Owned).length;
    await page.getByRole("button", { name: "絞り込み" }).click();
    await page.getByRole("button", { name: "未所持のみ", exact: true }).click();

    const cards = page.getByRole("button", { name: /の所持をトグル$/ });
    await expect(cards).toHaveCount(unownedCount);

    const ownedItem = MOCK_ITEMS.find((i) => i.Owned)!;
    await expect(page.getByTestId(`card-${ownedItem.ItemName}`)).not.toBeVisible();
  });

  test("クリアボタンで全フィルタがリセットされる", async ({ page }) => {
    await page.getByRole("button", { name: "絞り込み" }).click();
    await page.getByPlaceholder("名前・エリアで検索...").fill("北海道");
    await expect(page.getByRole("button", { name: "クリア" })).toBeVisible();

    await page.getByRole("button", { name: "クリア" }).click();

    await expect(page.getByPlaceholder("名前・エリアで検索...")).toHaveValue("");
    for (const item of MOCK_ITEMS) {
      await expect(page.getByTestId(`card-${item.ItemName}`)).toBeVisible();
    }
  });

  test("フィルタ未適用時はクリアボタンが表示されない", async ({ page }) => {
    await expect(page.getByRole("button", { name: "クリア" })).not.toBeVisible();
  });

  test("検索結果が0件の場合はアイテムが表示されない", async ({ page }) => {
    await page.getByPlaceholder("名前・エリアで検索...").fill("存在しないアイテム");

    const cards = page.getByRole("button", { name: /の所持をトグル$/ });
    await expect(cards).toHaveCount(0);
  });
});
