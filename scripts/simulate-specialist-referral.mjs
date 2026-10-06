import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const artifactDir = "C:\\Users\\johnj\\.gemini\\antigravity-ide\\brain\\58900d09-dd94-49e6-8017-9c8b7a07915f";
const screenshotsDir = path.join(__dirname, "..", "analysis", "screenshots");

if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const localPassword = "LocalOnly-2026!";

async function runSimulation() {
  console.log("Launching Chromium for Doctor Encounter Simulation...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log("Navigating to Provider Web (http://localhost:3001)...");
  await page.goto("http://localhost:3001", { timeout: 30000, waitUntil: "load" });
  await page.waitForTimeout(2000);

  // Sign in if on login page
  const emailInput = page.getByLabel("Work email").or(page.getByLabel("Email"));
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Signing in as doctor...");
    await emailInput.first().fill("doctor@synthetic.odyssey.test");
    await page.getByLabel("Password").first().fill(localPassword);
    await page.getByRole("button", { name: /^Sign in/i }).click();
    await page.waitForTimeout(3000);
  }

  console.log("On provider workspace page. Checking patient queue and encounters...");
  await page.screenshot({ path: path.join(screenshotsDir, "provider-dashboard.png") });

  // Find encounter link
  let encounterLink = page.locator('a[href*="/encounters/"]').first();
  const hasEncounter = await encounterLink.isVisible({ timeout: 3000 }).catch(() => false);

  if (!hasEncounter) {
    console.log("Looking for start encounter button in queue...");
    const startEncounterBtn = page.getByRole("button", { name: /Start encounter|Resume encounter|Open encounter|Record encounter/i }).first();
    if (await startEncounterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startEncounterBtn.click();
      await page.waitForTimeout(3000);
    }
  } else {
    console.log("Clicking encounter link...");
    await encounterLink.click();
    await page.waitForTimeout(3000);
  }

  // Ensure we are on an encounter page or find a way to enter
  console.log("Current URL:", page.url());

  // If still on main page, check if any patient card or queue action can open encounter
  if (!page.url().includes("/encounters/")) {
    const anyEncounterAnchor = page.locator('a[href^="/encounters/"]').first();
    if (await anyEncounterAnchor.count() > 0) {
      await anyEncounterAnchor.click();
      await page.waitForTimeout(3000);
    }
  }

  console.log("Waiting for encounter recording page elements...");
  await page.waitForTimeout(2000);

  // Activate Easter Egg / Dev fill or populate SOAP note if present
  const soapTextarea = page.locator("#soap-note-input, textarea[name='soapText'], textarea").first();
  if (await soapTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Entering SOAP clinical assessment notes...");
    await soapTextarea.fill(
      `Subjective:
Patient is a 52-year-old presenting with recurrent severe headaches, palpitations, and elevated home blood pressure readings ranging from 155/95 to 168/102 mmHg over the past 3 weeks. Reports mild exertional dyspnea when climbing two flights of stairs. Denies chest pressure, syncope, or orthopnea. Currently on Amlodipine 5mg OD with inadequate control.

Objective:
Vitals: BP: 158/98 mmHg (Right arm, seated), HR: 84 bpm regular, RR: 16 cpm, Temp: 36.6°C, SpO2: 98% room air.
Cardiovascular: Normal S1/S2, regular rhythm, no murmurs, no S3/S4 gallop. Peripheral pulses intact. No peripheral edema.
Lungs: Clear to auscultation bilaterally.

Assessment:
1. Essential Hypertension, Stage 2 - Uncontrolled on monotherapy (ICD-10: I10)
2. Suspected secondary etiology or hypertensive cardiovascular risk - For specialist stratification

Plan:
1. Add Losartan 50mg PO OD.
2. Refer to Specialist in Cardiology for comprehensive cardiac workup (24h Holter/ABPM & Echocardiogram).`
    );
    await page.waitForTimeout(1000);
  }

  // Click on "Specialist referral" tab under actions
  console.log("Looking for Specialist referral action tab...");
  const referralTab = page.getByRole("tab", { name: /Specialist referral/i })
    .or(page.getByRole("button", { name: /Specialist referral/i }))
    .or(page.locator("button:has-text('Specialist referral')"))
    .first();

  if (await referralTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await referralTab.click();
    await page.waitForTimeout(1500);
  }

  // Check specialist select dropdown
  const specialistSelect = page.locator("#odc-referral-specialist-select, select[name='specialistRoleId']").first();
  if (await specialistSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Selecting specialist from dropdown...");
    const options = await specialistSelect.locator("option").all();
    console.log(`Found ${options.length} specialist options.`);
    if (options.length > 1) {
      const optionValue = await options[1].getAttribute("value");
      if (optionValue) {
        await specialistSelect.selectOption(optionValue);
      }
    }
  }

  // Fill referral note
  const referralNoteTextarea = page.locator("#odc-referral-note, textarea[name='note']").last();
  if (await referralNoteTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Filling specialist referral clinical note...");
    await referralNoteTextarea.fill(
      "Referral to Cardiology Specialist: 52yo patient with Stage 2 Hypertension uncontrolled on monotherapy, presenting with persistent tension cephalalgia and exertional dyspnea. Requesting formal cardiology consultation, echocardiogram, 24-hr ambulatory BP monitoring, and cardiovascular risk stratification."
    );
    await page.waitForTimeout(1000);
  }

  // Capture Screenshot 1: Encounter in progress with Specialist Referral form filled
  const encounterFormScreenshotArtifact = path.join(artifactDir, "doctor-specialist-referral-form.png");
  const encounterFormScreenshotLocal = path.join(screenshotsDir, "doctor-specialist-referral-form.png");

  await page.screenshot({ path: encounterFormScreenshotArtifact, fullPage: false });
  await page.screenshot({ path: encounterFormScreenshotLocal, fullPage: false });
  console.log("Saved doctor-specialist-referral-form.png to artifact & analysis dirs.");

  // Click "Place referral" button
  const placeReferralBtn = page.getByRole("button", { name: /Place referral/i }).first();
  if (await placeReferralBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Submitting specialist referral...");
    await placeReferralBtn.click();
    await page.waitForTimeout(3000);
  }

  // Capture Screenshot 2: Confirmation Modal / Encounter Timeline updated with Specialist Referral
  const referralPlacedScreenshotArtifact = path.join(artifactDir, "doctor-specialist-referral-placed.png");
  const referralPlacedScreenshotLocal = path.join(screenshotsDir, "doctor-specialist-referral-placed.png");

  await page.screenshot({ path: referralPlacedScreenshotArtifact, fullPage: false });
  await page.screenshot({ path: referralPlacedScreenshotLocal, fullPage: false });
  console.log("Saved doctor-specialist-referral-placed.png to artifact & analysis dirs.");

  await browser.close();
  console.log("Simulation complete!");
}

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
