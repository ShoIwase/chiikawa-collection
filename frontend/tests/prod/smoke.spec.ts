import { test, expect } from "@playwright/test";

const USERNAME = process.env.CHIIKAWA_TEST_USERNAME ?? "e2e-test";
const PASSWORD = process.env.CHIIKAWA_TEST_PASSWORD ?? "";

test.beforeAll(() => {
  if (!PASSWORD) throw new Error("CHIIKAWA_TEST_PASSWORD が設定されていません");
});

test("ログインページが表示される", async ({ page }) => {
  await page.goto("/login/");
  await expect(page.getByLabel("ユーザー名")).toBeVisible();
  await expect(page.getByLabel("パスワード")).toBeVisible();
});

test("ログイン → コレクションページが開く", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });
  await expect(page.getByText("ちいかわコレクション")).toBeVisible();
});

test("コレクションページ: アイテム数・フィルターバーが表示される", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });

  // 「X / Y 個所持」のカウント表示
  await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });

  // フィルターバー
  await expect(page.getByPlaceholder("アイテム名・モチーフで検索...")).toBeVisible();
});

test("未認証で /collection/ にアクセスすると /login/ にリダイレクト", async ({ page }) => {
  await page.goto("/collection/");
  await expect(page).toHaveURL(/\/login\//, { timeout: 15_000 });
});

test("ログアウトで /login/ にリダイレクト", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login\//, { timeout: 15_000 });
});
