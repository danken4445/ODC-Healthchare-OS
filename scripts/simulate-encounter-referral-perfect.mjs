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

async function runPerfectSimulation() {
  console.log("Launching Chromium for Doctor Encounter & Specialist Referral Simulation...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1480, height: 980 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log("Navigating to provider web login...");
  await page.goto("http://localhost:3001", { timeout: 45000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Sign in doctor
  const emailInput = page.getByLabel("Work email").or(page.getByLabel("Email"));
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Signing in as synthetic doctor...");
    await emailInput.first().fill("doctor@synthetic.odyssey.test");
    await page.getByLabel("Password").first().fill(localPassword);
    await page.getByRole("button", { name: /^Sign in/i }).click();
    await page.waitForTimeout(4000);
  }

  // Navigate to encounter
  console.log(`Navigating to encounter URL: http://localhost:3001/encounters/${encounterId}`);
  await page.goto(`http://localhost:3001/encounters/${encounterId}`, { timeout: 45000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // Click on "Specialist referral" action tab
  console.log("Clicking Specialist Referral tab...");
  const referralTab = page.locator("button:has-text('Specialist referral')").first();
  if (await referralTab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await referralTab.click();
    await page.waitForTimeout(1500);
  }

  // Select Cardiology Specialist
  const specialistSelect = page.locator("#odc-referral-specialist-select, select[name='specialistRoleId']").first();
  if (await specialistSelect.isVisible({ timeout: 4000 }).catch(() => false)) {
    console.log("Selecting Cardiology Specialist in dropdown...");
    const optionCount = await specialistSelect.locator("option").count();
    console.log("Dropdown option count:", optionCount);
    if (optionCount > 1) {
      await specialistSelect.selectOption({ index: 1 });
    }
    await page.waitForTimeout(500);
  }

  // Set Priority to Urgent
  const prioritySelect = page.locator("select[name='priority']").last();
  if (await prioritySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Setting priority to Urgent...");
    await prioritySelect.selectOption("urgent");
    await page.waitForTimeout(500);
  }

  // Fill Referral Note
  const referralNoteText = page.locator("#odc-referral-note, textarea[name='note']").last();
  if (await referralNoteText.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Entering clinical referral note...");
    await referralNoteText.fill(
      "Referral to Cardiology Specialist (Dr. Maria Santos, MD, FPCP, FPCC):\nPatient is a 54yo with Stage 2 Essential Hypertension uncontrolled on Amlodipine monotherapy (Office BP 162/100 mmHg), presenting with persistent palpitations, occipital cephalalgia, and Grade II aortic systolic murmur. Requesting formal cardiology consultation for secondary hypertension workup, 2-D Echocardiogram with Doppler, 24-hr Holter ECG, and subspecialty medication optimization."
    );
    await page.waitForTimeout(1000);
  }

  // Capture Main High-Resolution Screenshot
  const screenshotPathArtifact = path.join(artifactDir, "doctor_encounter_specialist_referral.png");
  const screenshotPathAnalysis = path.join(screenshotsDir, "doctor_encounter_specialist_referral.png");

  await page.screenshot({ path: screenshotPathArtifact, fullPage: false });
  await page.screenshot({ path: screenshotPathAnalysis, fullPage: false });
  console.log("Screenshot successfully captured and saved to:", screenshotPathArtifact);

  await page.waitForTimeout(1000);
  await browser.close();
  console.log("Doctor encounter specialist referral simulation completed!");
}

runPerfectSimulation().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
