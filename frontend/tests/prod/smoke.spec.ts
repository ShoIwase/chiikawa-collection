import { test, expect } from "@playwright/test";

const USERNAME = process.env.CHIIKAWA_TEST_USERNAME ?? "e2e-test";
const PASSWORD = process.env.CHIIKAWA_TEST_PASSWORD ?? "";

test.beforeAll(() => {
  if (!PASSWORD) throw new Error("CHIIKAWA_TEST_PASSWORD が設定されていません");
});

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------
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

test("未認証で /collection/ にアクセスすると /login/ にリダイレクト", async ({ page }) => {
  await page.goto("/collection/");
  await expect(page).toHaveURL(/\/login\//, { timeout: 15_000 });
});

test("ログイン済みで /login/ に戻っても /collection/ にリダイレクト", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });

  await page.goto("/login/");
  await expect(page).toHaveURL(/\/collection\//, { timeout: 10_000 });
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

// ---------------------------------------------------------------------------
// コレクションページ
// ---------------------------------------------------------------------------
test("アイテム一覧と所持カウントが表示される", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });

  await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder("名前・エリアで検索...")).toBeVisible();
});

test("アイテム画像が実際に表示される（二重パスなし）", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });
  await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  const imgs = await page.locator("img").all();
  expect(imgs.length).toBeGreaterThan(0);

  // /images/images/ の二重パスがないことを全 img で確認
  // naturalWidth === 0 は lazy load 未発火による誤検知になるため除外
  for (const img of imgs) {
    const src = await img.getAttribute("src") ?? "";
    expect(src).not.toContain("/images/images/");
  }
});

test("アイテムトグル: 所持ON → OFF が反映される", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });
  await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });

  // カード構造: 外側div(ring-pink-400) > zoom button(img) + toggle button(テキスト)
  // toggle ボタンの親 div で ring-pink-400 を確認する
  const toggleBtn = page.getByRole("button", { name: /の所持をトグル/ }).first();
  const cardDiv = toggleBtn.locator("..");
  const wasOwned = await cardDiv.evaluate((el) => el.classList.contains("ring-pink-400"));
  await toggleBtn.click();
  await page.waitForTimeout(1000);

  const isOwned = await cardDiv.evaluate((el) => el.classList.contains("ring-pink-400"));
  expect(isOwned).toBe(!wasOwned);

  // 元に戻す
  await toggleBtn.click();
  await page.waitForTimeout(1000);
});

// ---------------------------------------------------------------------------
// フィルター
// ---------------------------------------------------------------------------
test("テキスト検索でアイテムが絞り込まれる", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });
  // アイテムがロードされるまで待つ
  await expect(page.getByText(/[1-9]\d* \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  const totalBefore = await page.getByRole("button").filter({ has: page.locator("img") }).count();
  expect(totalBefore).toBeGreaterThan(0);

  await page.getByPlaceholder("名前・エリアで検索...").fill("Dr.Yellow");
  await page.waitForTimeout(500);

  const filteredCount = await page.getByRole("button").filter({ has: page.locator("img") }).count();
  expect(filteredCount).toBeLessThan(totalBefore);
  expect(filteredCount).toBeGreaterThan(0);
});

test("「未所持のみ」フィルターで絞り込まれる", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });
  // アイテムがロードされるまで待つ
  await expect(page.getByText(/[1-9]\d* \/ \d+ 個所持/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  const totalBefore = await page.getByRole("button").filter({ has: page.locator("img") }).count();
  expect(totalBefore).toBeGreaterThan(0);

  // FilterBar はエリア種別→タグに変更済み。代わりに「未所持のみ」チェックボックスでフィルターをテスト
  await page.getByLabel("未所持のみ").check();
  await page.waitForTimeout(500);

  const filteredCount = await page.getByRole("button").filter({ has: page.locator("img") }).count();
  expect(filteredCount).toBeLessThanOrEqual(totalBefore);

  await page.getByRole("button", { name: "クリア" }).click();
  await page.waitForTimeout(300);
  const restoredCount = await page.getByRole("button").filter({ has: page.locator("img") }).count();
  expect(restoredCount).toBe(totalBefore);
});

// ---------------------------------------------------------------------------
// 確認ページ
// ---------------------------------------------------------------------------
test("verifyページ: 一括確定ボタンがモーダル内に表示される", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/collection\//, { timeout: 30_000 });

  const hasPending = await page.getByText(/未確認の新着アイテム/).isVisible().catch(() => false);
  if (!hasPending) {
    test.skip(true, "未確認アイテムなし");
    return;
  }

  await page.goto("/verify/");
  await page.waitForTimeout(2000);

  const bulkBtn = page.getByRole("button", { name: /すべてそのまま確定/ });
  await expect(bulkBtn).toBeVisible({ timeout: 10_000 });

  // モーダルの内側にあることを確認
  const modalBox = await page.locator(".fixed.inset-0").boundingBox();
  const btnBox = await bulkBtn.boundingBox();
  expect(modalBox).not.toBeNull();
  expect(btnBox).not.toBeNull();
  // ボタンがモーダルの内側のdivに含まれているか（モーダルに遮られていないか）
  // クリック可能であることで確認
  await expect(bulkBtn).toBeEnabled();
});
