import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@synthetic.odyssey.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "LocalOnly-2026!";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("http://127.0.0.1:3002/billing", { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (await page.getByLabel("Work email").isVisible()) {
    await page.getByLabel("Work email").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("heading", { name: "Billing management" })).toBeVisible({ timeout: 20_000 });
}

test("billing workspace and QR intake remain usable at desktop and mobile widths", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await expect(page.getByRole("link", { name: "Scan visit QR" })).toBeVisible();
  await page.screenshot({ path: "test-results/billing-workspace-desktop.png", fullPage: true });

  await page.getByRole("link", { name: "Scan visit QR" }).click();
  await expect(page.getByRole("heading", { name: "Scan visit invoice" })).toBeVisible();
  await expect(page.getByLabel("Invoice QR scanner")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Invoice QR scanner")).toBeVisible();
  await page.screenshot({ path: "test-results/billing-scanner-mobile.png", fullPage: true });
});
