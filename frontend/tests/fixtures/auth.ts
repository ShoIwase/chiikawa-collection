import type { Page } from "@playwright/test";

/**
 * Amplify の認証関数をモックして、認証済み状態にする。
 * page.goto() の前に呼び出すこと。
 */
export async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    // aws-amplify/auth モジュールをモック
    const mockSession = {
      tokens: {
        idToken: {
          toString: () => "mock-id-token",
        },
      },
    };

    // Amplify モジュールの読み込みをインターセプトするため
    // window オブジェクトにモックを事前注入
    (window as any).__AMPLIFY_MOCK__ = {
      getCurrentUser: () => Promise.resolve({ username: "testuser" }),
      fetchAuthSession: () => Promise.resolve(mockSession),
      signIn: (_opts: unknown) => Promise.resolve({ isSignedIn: true }),
      signOut: () => Promise.resolve(),
    };
  });
}

/**
 * Amplify の認証関数をモックして、未認証状態にする。
 */
export async function mockUnauthenticated(page: Page) {
  await page.addInitScript(() => {
    (window as any).__AMPLIFY_MOCK__ = {
      getCurrentUser: () => Promise.reject(new Error("Not authenticated")),
      fetchAuthSession: () => Promise.reject(new Error("Not authenticated")),
      signIn: () => Promise.reject(new Error("Invalid credentials")),
      signOut: () => Promise.resolve(),
    };
  });
}
