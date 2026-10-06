import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactDir = "C:\\Users\\johnj\\.gemini\\antigravity-ide\\brain\\58900d09-dd94-49e6-8017-9c8b7a07915f";
const screenshotsDir = path.join(__dirname, "..", "analysis", "screenshots");

const localPassword = "Test123!";
const appointmentId = "bb03d83b-88b5-478f-b666-86768337e08d";

async function runTeleconsultSimulation() {
  console.log("Launching Chromium for Teleconsultation Simulation...");
  
  // Use use fake ui for media stream to allow WebRTC camera/mic without prompt
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const patientContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    permissions: ['camera', 'microphone']
  });

  const doctorContext = await browser.newContext({
    viewport: { width: 1480, height: 980 },
    deviceScaleFactor: 2,
    permissions: ['camera', 'microphone']
  });

  const patientPage = await patientContext.newPage();
  const doctorPage = await doctorContext.newPage();

  // ----- Patient Login -----
  console.log("Navigating to patient web login...");
  await patientPage.goto("http://localhost:3000", { timeout: 45000, waitUntil: "domcontentloaded" });
  await patientPage.waitForTimeout(2000);

  const pEmailInput = patientPage.getByLabel("Email");
  if (await pEmailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Signing in as patient1@odc.com...");
    await pEmailInput.first().fill("patient1@odc.com");
    await patientPage.getByLabel("Password").first().fill(localPassword);
    await patientPage.getByRole("button", { name: /^Sign in/i }).click();
    await patientPage.waitForTimeout(4000);
  } else {
      console.log("Patient already signed in or login form not found");
  }

  // ----- Doctor Login -----
  console.log("Navigating to provider web login...");
  await doctorPage.goto("http://localhost:3001", { timeout: 45000, waitUntil: "domcontentloaded" });
  await doctorPage.waitForTimeout(2000);

  const dEmailInput = doctorPage.getByLabel("Work email").or(doctorPage.getByLabel("Email"));
  if (await dEmailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Signing in as doctor1@odc.com...");
    await dEmailInput.first().fill("doctor1@odc.com");
    await doctorPage.getByLabel("Password").first().fill(localPassword);
    await doctorPage.getByRole("button", { name: /^Sign in/i }).click();
    await doctorPage.waitForTimeout(4000);
  } else {
      console.log("Doctor already signed in or login form not found");
  }

  // ----- Navigate to Teleconsultation Room -----
  console.log(`Navigating patient to teleconsult room...`);
  await patientPage.goto(`http://localhost:3000/teleconsult/${appointmentId}`);
  
  console.log(`Navigating doctor to teleconsult room...`);
  await doctorPage.goto(`http://localhost:3001/teleconsult/${appointmentId}`);

  console.log("Waiting for WebRTC connections to establish...");
  await patientPage.waitForTimeout(8000); // Wait for signaling and video feed

  // Create dirs if they don't exist
  if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Capture Screenshots
  console.log("Taking screenshots...");
  
  const doctorArtifact = path.join(artifactDir, "doctor_teleconsult_room.png");
  const doctorAnalysis = path.join(screenshotsDir, "doctor_teleconsult_room.png");
  
  const patientArtifact = path.join(artifactDir, "patient_teleconsult_room.png");
  const patientAnalysis = path.join(screenshotsDir, "patient_teleconsult_room.png");

  await doctorPage.screenshot({ path: doctorArtifact, fullPage: false });
  await doctorPage.screenshot({ path: doctorAnalysis, fullPage: false });
  console.log("Doctor screenshot saved to:", doctorArtifact);

  await patientPage.screenshot({ path: patientArtifact, fullPage: false });
  await patientPage.screenshot({ path: patientAnalysis, fullPage: false });
  console.log("Patient screenshot saved to:", patientArtifact);

  await browser.close();
  console.log("Teleconsultation simulation completed!");
}

runTeleconsultSimulation().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
