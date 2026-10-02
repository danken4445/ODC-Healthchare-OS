import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.join(__dirname, "screenshots");

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const localPassword = "LocalOnly-2026!";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  console.log("Capturing screenshots with load-based synchronization...");

  // 1. Patient Web - Booking & Portal
  try {
    const page = await context.newPage();
    console.log("Navigating to Patient Web (http://localhost:3000)...");
    await page.goto("http://localhost:3000", { timeout: 30000, waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, "patient-booking.png") });
    console.log("Saved patient-booking.png");

    // Sign in patient
    const emailField = page.getByLabel("Email").last();
    if (await emailField.isVisible({ timeout: 3000 })) {
      await emailField.fill("patient@synthetic.odyssey.test");
      await page.getByLabel("Password").last().fill(localPassword);
      await page.getByRole("button", { name: /^Sign in/i }).click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(screenshotsDir, "patient-portal.png") });
      console.log("Saved patient-portal.png");
    }
    await page.close();
  } catch (err) {
    console.error("Error capturing patient-web:", err.message);
  }

  // 2. Admin Web - Dashboard, Billing, Inventory, Roles
  try {
    const page = await context.newPage();
    console.log("Navigating to Admin Web (http://localhost:3002)...");
    await page.goto("http://localhost:3002", { timeout: 30000, waitUntil: "load" });
    await page.waitForTimeout(2000);

    // Sign in admin
    const emailField = page.getByLabel("Work email");
    if (await emailField.isVisible({ timeout: 3000 })) {
      await emailField.fill("admin@synthetic.odyssey.test");
      await page.getByLabel("Password").fill(localPassword);
      await page.getByRole("button", { name: /^Sign in/i }).click();
      await page.waitForTimeout(4000);
    }

    // Dashboard
    await page.screenshot({ path: path.join(screenshotsDir, "admin-dashboard.png") });
    console.log("Saved admin-dashboard.png");

    // Billing Workspace
    console.log("Navigating to Admin Billing (/billing)...");
    await page.goto("http://localhost:3002/billing", { timeout: 20000, waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, "admin-billing.png") });
    console.log("Saved admin-billing.png");

    // Inventory Hierarchy
    console.log("Navigating to Admin Inventory (/inventory)...");
    await page.goto("http://localhost:3002/inventory", { timeout: 20000, waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, "admin-inventory.png") });
    console.log("Saved admin-inventory.png");

    // Roles & Permissions CMS
    console.log("Navigating to Admin Roles (/roles)...");
    await page.goto("http://localhost:3002/roles", { timeout: 20000, waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, "admin-roles.png") });
    console.log("Saved admin-roles.png");

    await page.close();
  } catch (err) {
    console.error("Error capturing admin-web:", err.message);
  }

  // 3. Provider Web - Queue, Fees, Encounter
  try {
    const page = await context.newPage();
    console.log("Navigating to Provider Web (http://localhost:3001)...");
    await page.goto("http://localhost:3001", { timeout: 30000, waitUntil: "load" });
    await page.waitForTimeout(2000);

    // Sign in doctor
    const emailField = page.getByLabel("Work email").or(page.getByLabel("Email"));
    if (await emailField.isVisible({ timeout: 3000 })) {
      await emailField.first().fill("doctor@synthetic.odyssey.test");
      await page.getByLabel("Password").first().fill(localPassword);
      await page.getByRole("button", { name: /^Sign in/i }).click();
      await page.waitForTimeout(4000);
    }

    // Queue / Overview
    await page.screenshot({ path: path.join(screenshotsDir, "doctor-queue.png") });
    console.log("Saved doctor-queue.png");

    // Fees Tab
    const feesTab = page.getByRole("button", { name: /Fees/i }).or(page.getByRole("tab", { name: /Fees/i })).or(page.getByText(/Fees/i));
    if (await feesTab.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await feesTab.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(screenshotsDir, "doctor-fees.png") });
      console.log("Saved doctor-fees.png");
    }

    // Check for encounter link
    const encounterLink = page.locator('a[href*="/encounters/"]').first();
    if (await encounterLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await encounterLink.click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(screenshotsDir, "doctor-encounter.png") });
      console.log("Saved doctor-encounter.png");
    }

    await page.close();
  } catch (err) {
    console.error("Error capturing provider-web:", err.message);
  }

  await browser.close();
  console.log("All screenshots successfully captured in analysis/screenshots!");
}

capture().catch((e) => {
  console.error("Failed to capture screenshots:", e);
  process.exit(1);
});
