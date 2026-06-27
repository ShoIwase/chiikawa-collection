import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/prod",
  fullyParallel: false,
  timeout: 60_000,
  retries: 1,
  reporter: "html",

  use: {
    baseURL: "https://chiikawa.bar504.net",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
