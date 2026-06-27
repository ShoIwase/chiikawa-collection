import { test, expect } from "@playwright/test";
import { mockAuth, mockUnauthenticated } from "../fixtures/auth";
import { mockApi } from "../fixtures/api";

test.describe("ログインページ", () => {
  test("フォームが表示される", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/login/");
    await expect(page.getByLabel("ユーザー名")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toBeVisible();
    await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
  });

  test("正常ログインで /collection/ にリダイレクト", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page);
    await page.goto("/login/");
    await page.getByLabel("ユーザー名").fill("testuser");
    await page.getByLabel("パスワード").fill("password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/\/collection\//);
  });

  test("認証失敗でエラーメッセージ表示", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/login/");
    await page.getByLabel("ユーザー名").fill("wronguser");
    await page.getByLabel("パスワード").fill("wrongpass");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByText("Invalid credentials")).toBeVisible();
  });

  test("ログイン中はボタンが無効化される", async ({ page }) => {
    let resolveSignIn!: () => void;
    await page.addInitScript(() => {
      (window as Window & { __AMPLIFY_MOCK__?: unknown }).__AMPLIFY_MOCK__ = {
        getCurrentUser: () => Promise.reject(new Error("Not authenticated")),
        fetchAuthSession: () => Promise.reject(new Error("Not authenticated")),
        signIn: () =>
          new Promise<{ isSignedIn: boolean }>((resolve) => {
            (window as Window & { __resolveSignIn?: () => void }).__resolveSignIn = () =>
              resolve({ isSignedIn: true });
          }),
        signOut: () => Promise.resolve(),
      };
    });
    await page.goto("/login/");
    await page.getByLabel("ユーザー名").fill("testuser");
    await page.getByLabel("パスワード").fill("password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByRole("button", { name: "ログイン中..." })).toBeDisabled();
    resolveSignIn;
  });

  test("認証済みの場合 / へのアクセスで /collection/ にリダイレクト", async ({ page }) => {
    await mockAuth(page);
    await mockApi(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/collection\//);
  });

  test("未認証の場合 / へのアクセスで /login/ にリダイレクト", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\//);
  });
});
