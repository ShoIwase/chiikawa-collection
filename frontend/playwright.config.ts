import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  retries: 1,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  // Next.js dev server をテスト前に起動
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_API_URL: "https://api.chiikawa.test",
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: "ap-northeast-1_test",
      NEXT_PUBLIC_COGNITO_CLIENT_ID: "test-client-id",
      NEXT_PUBLIC_CLOUDFRONT_URL: "https://cdn.chiikawa.test",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
