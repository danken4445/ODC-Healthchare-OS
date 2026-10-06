import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactDir = "C:\\Users\\johnj\\.gemini\\antigravity-ide\\brain\\58900d09-dd94-49e6-8017-9c8b7a07915f";
const screenshotsDir = path.join(__dirname, "..", "analysis", "screenshots");

const localPassword = "LocalOnly-2026!";
const encounterId = "60000000-0000-0000-0000-000000000001";

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1480, height: 1000 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log("Navigating to provider web...");
  await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Check login
  const emailInput = page.getByLabel("Work email").or(page.getByLabel("Email"));
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Submitting login credentials...");
    await emailInput.first().fill("doctor@synthetic.odyssey.test");
    await page.getByLabel("Password").first().fill(localPassword);
    await page.getByRole("button", { name: /^Sign in/i }).click();
    console.log("Waiting for dashboard...");
    await page.waitForURL("http://localhost:3001/**", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }

  console.log("Navigating to encounter URL:", encounterId);
  await page.goto(`http://localhost:3001/encounters/${encounterId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // Switch to Specialist referral
  const referralTab = page.locator("button:has-text('Specialist referral')").first();
  if (await referralTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Found referral tab!");
    await referralTab.click();
    await page.waitForTimeout(1000);
  }

  // Select Specialist
  const specialistSelect = page.locator("#odc-referral-specialist-select, select[name='specialistRoleId']").first();
  if (await specialistSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    const count = await specialistSelect.locator("option").count();
    console.log("Specialist dropdown options count:", count);
    if (count > 1) {
      await specialistSelect.selectOption({ index: 1 });
    }
  }

  // Select Urgent Priority
  const prioritySelect = page.locator("select[name='priority']").last();
  if (await prioritySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await prioritySelect.selectOption("urgent");
  }

  // Fill referral note
  const referralNoteArea = page.locator("#odc-referral-note, textarea[name='note']").last();
  if (await referralNoteArea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await referralNoteArea.fill(
      "Referral to Cardiology Specialist (Dr. Maria Santos, MD, FPCP, FPCC):\n54yo patient presenting with refractory Stage 2 Essential Hypertension (Office BP 162/100 mmHg), palpitations, and Grade II aortic systolic murmur. Requesting formal cardiology consultation, echocardiogram, 24-hr Holter ECG, and cardiovascular risk stratification."
    );
  }

  // Capture Screenshot 1: Doctor Encounter with Specialist Referral Order Form
  const screenshotPathArtifact = path.join(artifactDir, "doctor_specialist_referral_encounter.png");
  await page.screenshot({ path: screenshotPathArtifact, fullPage: false });
  console.log("Saved doctor_specialist_referral_encounter.png successfully!");

  // Submit referral
  const placeReferralBtn = page.getByRole("button", { name: /Place referral/i }).first();
  if (await placeReferralBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Submitting referral...");
    await placeReferralBtn.click();
    await page.waitForTimeout(3000);

    // Capture Screenshot 2: Confirmation / Encounter Timeline with Placed Specialist Referral
    const confirmationScreenshotPath = path.join(artifactDir, "doctor_specialist_referral_confirmation.png");
    await page.screenshot({ path: confirmationScreenshotPath, fullPage: false });
    console.log("Saved doctor_specialist_referral_confirmation.png successfully!");
  }

  await browser.close();
}

runTest().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
