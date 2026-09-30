import { defineConfig, devices } from "@playwright/test";

const usesExternalServer = process.env.LOOP_A_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: ".",
  testMatch: "loop-a-provider-queue.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: usesExternalServer
    ? undefined
    : {
        command: "corepack pnpm --filter @odyssey/provider-web dev",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
