import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3010";

export default defineConfig({
  testDir: ".",
  testMatch: "loop-c-patient-booking.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "corepack pnpm --filter @odyssey/patient-web dev",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: "3010",
    },
  },
});
