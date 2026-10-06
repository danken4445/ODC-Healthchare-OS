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

async function runEncounterSimulation() {
  console.log("Launching Chromium for Doctor Encounter & Specialist Referral Simulation...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log("Navigating to login / home...");
  await page.goto("http://localhost:3001", { timeout: 30000, waitUntil: "load" });
  await page.waitForTimeout(1500);

  // Sign in doctor
  const emailInput = page.getByLabel("Work email").or(page.getByLabel("Email"));
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Signing in as synthetic doctor...");
    await emailInput.first().fill("doctor@synthetic.odyssey.test");
    await page.getByLabel("Password").first().fill(localPassword);
    await page.getByRole("button", { name: /^Sign in/i }).click();
    await page.waitForTimeout(3000);
  }

  // Navigate directly to the active in-progress encounter
  console.log(`Navigating to encounter URL: http://localhost:3001/encounters/${encounterId}`);
  await page.goto(`http://localhost:3001/encounters/${encounterId}`, { timeout: 30000, waitUntil: "load" });
  await page.waitForTimeout(3000);

  // Check if we are on the encounter page
  console.log("Page title / status:", await page.title());

  // Check for SOAP textarea and fill it
  const soapTextarea = page.locator("textarea.odyssey-input").first();
  if (await soapTextarea.isVisible({ timeout: 4000 }).catch(() => false)) {
    console.log("Populating SOAP documentation with cardiology consult case...");
    await soapTextarea.fill(
`Subjective:
Patient is a 54-year-old executive presenting with a 3-week history of throbbing occipital headaches, exertional shortness of breath, and irregular palpitations during moderate physical activity. Home automated BP log shows sustained elevations (155/98 to 172/104 mmHg) despite adherence to Amlodipine 5mg OD. Denies syncope, visual field deficits, or acute chest pressure.

Objective:
Vitals: BP: 162/100 mmHg (Right Arm, Sitting), HR: 88 bpm (irregular beats noted), RR: 18 cpm, Temp: 36.7°C, SpO2: 98% room air. BMI: 28.4 kg/m².
HEENT: Arteriolar narrowing on fundoscopy, no papilledema.
CVS: S1, S2 audible; soft grade II/VI systolic murmur over aortic area. No peripheral edema.
Lungs: Clear to auscultation bilaterally, no crackles or wheezing.

Assessment:
1. Stage 2 Essential Hypertension - Uncontrolled / High Cardiovascular Risk (ICD-10: I10)
2. Symptomatic Palpitations / Murmur - Suspected Hypertensive Heart Disease (ICD-10: I11.9)

Plan:
1. Intensify anti-hypertensive regimen with Losartan Potassium 50mg PO OD.
2. Urgent referral to Cardiology for 24-hr Holter ECG, 2-D Echocardiography with Doppler, and subspecialty titration.
3. Order baseline Complete Blood Count, Serum Electrolytes, and Renal Function Panel.`
    );
    await page.waitForTimeout(1000);

    // Click Save SOAP note if present
    const saveSoapBtn = page.getByRole("button", { name: /Save note|Save SOAP note/i }).first();
    if (await saveSoapBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Saving SOAP note...");
      await saveSoapBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Look for the "Specialist referral" tab in the orders section
  console.log("Clicking Specialist Referral tab...");
  const referralTabBtn = page.getByRole("tab", { name: /Specialist referral/i })
    .or(page.getByRole("button", { name: /Specialist referral/i }))
    .or(page.locator("button:has-text('Specialist referral')"))
    .first();

  if (await referralTabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await referralTabBtn.click();
    await page.waitForTimeout(1500);
  }

  // If there are specialists in dropdown, select one, or populate the specialist select
  const specialistSelect = page.locator("#odc-referral-specialist-select, select[name='specialistRoleId']").first();
  if (await specialistSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    const options = await specialistSelect.locator("option").all();
    console.log(`Found ${options.length} options in specialist dropdown.`);
    if (options.length > 1) {
      await specialistSelect.selectOption({ index: 1 });
    }
  }

  // Set priority to "urgent"
  const prioritySelect = page.locator("select[name='priority']").last();
  if (await prioritySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await prioritySelect.selectOption("urgent");
  }

  // Fill referral note
  const referralNoteArea = page.locator("#odc-referral-note, textarea[name='note']").last();
  if (await referralNoteArea.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Filling referral note...");
    await referralNoteArea.fill(
      "Referral to Specialist / Cardiology Consultant:\n54yo patient with refractory Stage 2 Hypertension (BP 162/100 mmHg), palpitations, and Grade II systolic murmur. Kindly evaluate for secondary hypertension etiology, hypertensive cardiovascular remodeling, and perform 2-D Echocardiogram + 24-hr Holter ECG."
    );
    await page.waitForTimeout(1000);
  }

  // Capture Main Screenshot of Doctor Encounter with Specialist Referral Form filled
  const encounterFormScreenshotArtifact = path.join(artifactDir, "doctor_specialist_referral_encounter.png");
  const encounterFormScreenshotLocal = path.join(screenshotsDir, "doctor_specialist_referral_encounter.png");

  await page.screenshot({ path: encounterFormScreenshotArtifact, fullPage: false });
  await page.screenshot({ path: encounterFormScreenshotLocal, fullPage: false });
  console.log("Saved doctor_specialist_referral_encounter.png");

  // Click "Place referral"
  const placeReferralBtn = page.getByRole("button", { name: /Place referral/i }).first();
  if (await placeReferralBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Placing specialist referral...");
    await placeReferralBtn.click();
    await page.waitForTimeout(3000);

    // Capture confirmation / updated encounter chart
    const confirmedScreenshotArtifact = path.join(artifactDir, "doctor_specialist_referral_confirmation.png");
    const confirmedScreenshotLocal = path.join(screenshotsDir, "doctor_specialist_referral_confirmation.png");

    await page.screenshot({ path: confirmedScreenshotArtifact, fullPage: false });
    await page.screenshot({ path: confirmedScreenshotLocal, fullPage: false });
    console.log("Saved doctor_specialist_referral_confirmation.png");
  }

  await browser.close();
  console.log("Simulation finished successfully!");
}

runEncounterSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
