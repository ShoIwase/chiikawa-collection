import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAuth, mockUnauthenticated } from "../fixtures/auth";
import { mockApi } from "../fixtures/api";
import { MOCK_ITEMS, MOCK_PENDING } from "../fixtures/items";

// ---------------------------------------------------------------------------
// アクセシビリティ
// ---------------------------------------------------------------------------
test.describe("アクセシビリティ", () => {
  test("ログインページ: a11y違反なし", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/login/");
    await expect(page.getByLabel("ユーザー名")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"]) // Tailwind の動的クラスはCI環境で誤検知が多い
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("コレクションページ: a11y違反なし", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");
    await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("ログインフォームはキーボードで操作できる", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page);
    await page.goto("/login/");

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("ユーザー名")).toBeFocused();

    await page.keyboard.type("testuser");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("パスワード")).toBeFocused();

    await page.keyboard.type("password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "ログイン" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/collection\//);
  });
});

// ---------------------------------------------------------------------------
// レスポンシブデザイン
// ---------------------------------------------------------------------------
test.describe("レスポンシブ", () => {
  test("タブレット(768px): コレクションが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    await expect(page.getByText("ちいかわコレクション")).toBeVisible();
    await expect(page.getByPlaceholder("名前・エリアで検索...")).toBeVisible();
    const grid = page.locator(".grid");
    await expect(grid).toBeVisible();
  });
  test("モバイル: ログインフォームが収まる", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockUnauthenticated(page);
    await page.goto("/login/");

    const form = page.locator("form");
    await expect(form).toBeVisible();
    const box = await form.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
    expect(box!.x).toBeGreaterThanOrEqual(0);
  });

  test("モバイル: コレクションが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    await expect(page.getByText("ちいかわコレクション")).toBeVisible();
    await expect(page.getByPlaceholder("名前・エリアで検索...")).toBeVisible();
  });

  test("デスクトップ: コレクションが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    await expect(page.getByText("ちいかわコレクション")).toBeVisible();
    const grid = page.locator(".grid");
    await expect(grid).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ローディング状態
// ---------------------------------------------------------------------------
test.describe("ローディング状態", () => {
  test("コレクション読み込み中にスピナーが表示される", async ({ page }) => {
    await mockAuth(page);

    // API レスポンスを遅延させる
    await page.route("https://api.chiikawa.test/items", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      route.fulfill({ json: { items: MOCK_ITEMS } });
    });
    await page.route("https://api.chiikawa.test/items/pending", (route) =>
      route.fulfill({ json: { items: [] } })
    );

    await page.goto("/collection/");
    await expect(page.locator(".animate-spin")).toBeVisible();
    await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible({ timeout: 10_000 });
  });

  test("ログイン中にボタンが「ログイン中...」に変わる", async ({ page }) => {
    let resolve!: () => void;
    await page.addInitScript(() => {
      (window as Window & { __AMPLIFY_MOCK__?: unknown }).__AMPLIFY_MOCK__ = {
        getCurrentUser: () => Promise.reject(new Error("Not authenticated")),
        fetchAuthSession: () => Promise.reject(new Error("Not authenticated")),
        signIn: () => new Promise<{ isSignedIn: boolean }>((res) => {
          (window as Window & { __signInResolve?: () => void }).__signInResolve = () =>
            res({ isSignedIn: true });
        }),
        signOut: () => Promise.resolve(),
      };
    });

    await page.goto("/login/");
    await page.getByLabel("ユーザー名").fill("testuser");
    await page.getByLabel("パスワード").fill("password");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page.getByRole("button", { name: "ログイン中..." })).toBeVisible();
    await expect(page.getByRole("button", { name: "ログイン中..." })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 視覚フィードバック
// ---------------------------------------------------------------------------
test.describe("視覚フィードバック", () => {
  test("未所持アイテムはグレーアウト、所持アイテムはピンクリング", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");
    await expect(page.getByText(/\d+ \/ \d+ 個所持/)).toBeVisible();

    const owned = MOCK_ITEMS.find((i) => i.Owned)!;
    const unowned = MOCK_ITEMS.find((i) => !i.Owned)!;

    const ownedCard = page.getByTestId(`card-${owned.ItemName}`);
    const ownedToggle = page.getByRole("button", { name: `${owned.ItemName} の所持をトグル` });
    const unownedToggle = page.getByRole("button", { name: `${unowned.ItemName} の所持をトグル` });

    await expect(ownedCard).toHaveClass(/ring-pink-400/);
    await expect(ownedToggle).not.toHaveClass(/grayscale/);
    await expect(unownedToggle).toHaveClass(/grayscale/);
    await expect(unownedToggle).toHaveClass(/opacity-50/);
  });

  test("タップで即座に未保存ハイライトに切り替わる", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS });
    await page.goto("/collection/");

    const unowned = MOCK_ITEMS.find((i) => !i.Owned)!;
    const card = page.getByTestId(`card-${unowned.ItemName}`);

    await page.getByRole("button", { name: `${unowned.ItemName} の所持をトグル` }).click();
    // タップは即ローカル反映（未保存=琥珀リング）。保存するまでAPIには送られない
    await expect(card).toHaveClass(/ring-amber-400/, { timeout: 500 });
  });

  test("アラートバナーが黄色で目立つ", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page, { items: MOCK_ITEMS, pending: MOCK_PENDING });
    await page.goto("/collection/");

    const banner = page.getByText(/未確認の新着アイテム/).locator("..");
    await expect(banner).toHaveClass(/bg-yellow-100/);
    await expect(banner).toHaveClass(/border-yellow-300/);
  });

  test("エラー時に赤いメッセージが表示される", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/login/");
    await page.getByLabel("ユーザー名").fill("wronguser");
    await page.getByLabel("パスワード").fill("wrongpass");
    await page.getByRole("button", { name: "ログイン" }).click();

    const error = page.getByText("Invalid credentials");
    await expect(error).toBeVisible();
    await expect(error).toHaveClass(/text-red-500/);
  });
});
