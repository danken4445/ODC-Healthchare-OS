import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.LOOP_A_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(
    "LOOP_A_PORT must be set to the isolated port allocated by run-loop-a-playwright.mjs.",
  );
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "loop-a-provider-queue.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Cold isolated Next compilation can occur during the first navigation.
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
