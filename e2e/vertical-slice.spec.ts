import { expect, test, type Page } from "@playwright/test";

const localPassword = "LocalOnly-2026!";
const patientEmail =
  process.env.E2E_PATIENT_EMAIL ?? "patient@synthetic.odyssey.test";
const patientPassword = process.env.E2E_PATIENT_PASSWORD ?? localPassword;
const providerEmail =
  process.env.E2E_PROVIDER_EMAIL ?? "doctor@synthetic.odyssey.test";
const providerPassword = process.env.E2E_PROVIDER_PASSWORD ?? localPassword;
const nurseEmail =
  process.env.E2E_NURSE_EMAIL ?? "nurse@synthetic.odyssey.test";
const nursePassword = process.env.E2E_NURSE_PASSWORD ?? localPassword;
const frontDeskEmail =
  process.env.E2E_FRONT_DESK_EMAIL ?? "front-desk@synthetic.odyssey.test";
const frontDeskPassword = process.env.E2E_FRONT_DESK_PASSWORD ?? localPassword;
const inventoryEmail =
  process.env.E2E_INVENTORY_EMAIL ?? "inventory@synthetic.odyssey.test";
const inventoryPassword = process.env.E2E_INVENTORY_PASSWORD ?? localPassword;
const labEmail = process.env.E2E_LAB_EMAIL ?? "lab@synthetic.odyssey.test";
const labPassword = process.env.E2E_LAB_PASSWORD ?? localPassword;
const specialistEmail =
  process.env.E2E_SPECIALIST_EMAIL ?? "specialist@synthetic.odyssey.test";
const specialistPassword = process.env.E2E_SPECIALIST_PASSWORD ?? localPassword;

async function signIn(
  page: Page,
  appUrl: string,
  email: string,
  password = localPassword,
) {
  await page.goto(appUrl);
  await page.getByLabel("Email").last().fill(email);
  await page.getByLabel("Password").last().fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
}

test("a patient can register", async ({ page }) => {
  const runId = `${Date.now()}`;
  const registrationEmail = `registration-${runId}@synthetic.odyssey.test`;
  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("Full name").fill(`Synthetic Registration ${runId}`);
  await page.getByLabel("Email").first().fill(registrationEmail);
  await page.getByLabel("Password").first().fill(localPassword);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("status")).toContainText(
    /Registration complete|Registration received/,
  );
});

test("the public portal exposes services and a privacy-safe queue", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000");
  await expect(
    page.getByRole("heading", { name: "Clinic services" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "General consultation" }),
  ).toBeVisible();

  await page.goto("http://127.0.0.1:3002/waiting-room");
  await expect(page.getByRole("heading", { name: /queue$/ })).toBeVisible();
  await expect(page.getByText("Patient names are never shown.")).toBeVisible();
});

test("a valid password cannot open a portal outside the assigned role", async ({
  browser,
}) => {
  const cases = [
    {
      appUrl: "http://127.0.0.1:3000",
      email: providerEmail,
      password: providerPassword,
      expected: "not authorized for the Patient portal",
    },
    {
      appUrl: "http://127.0.0.1:3001",
      email: frontDeskEmail,
      password: frontDeskPassword,
      expected: "not authorized for the Provider workspace",
    },
    {
      appUrl: "http://127.0.0.1:3002",
      email: patientEmail,
      password: patientPassword,
      expected: "not authorized for the administrative workspace",
    },
  ];

  for (const portal of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(portal.appUrl);
    await page.getByLabel("Email").last().fill(portal.email);
    await page.getByLabel("Password").last().fill(portal.password);
    await page.getByRole("button", { name: /^Sign in/ }).click();
    await expect(page.getByRole("status")).toContainText(portal.expected);
    await expect(page.getByText(`Signed in as ${portal.email}`)).toHaveCount(0);
    await context.close();
  }
});

test("patient booking → live doctor queue → encounter, plus walk-in booking", async ({
  browser,
}) => {
  const runId = `${Date.now()}`;
  const patientName = "Synthetic Registered Patient";
  const walkInName = `Synthetic E2E Walk-In ${runId}`;

  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await signIn(
    providerPage,
    "http://127.0.0.1:3001",
    providerEmail,
    providerPassword,
  );
  await expect(providerPage.getByText("Live queue")).toBeVisible({
    timeout: 15_000,
  });

  const nurseContext = await browser.newContext();
  const nursePage = await nurseContext.newPage();
  await signIn(nursePage, "http://127.0.0.1:3001", nurseEmail, nursePassword);
  await expect(nursePage.getByText("Live queue")).toBeVisible({
    timeout: 15_000,
  });

  const inventoryContext = await browser.newContext();
  const inventoryPage = await inventoryContext.newPage();
  await signIn(
    inventoryPage,
    "http://127.0.0.1:3002/inventory",
    inventoryEmail,
    inventoryPassword,
  );
  await expect(inventoryPage.getByText("Live stock")).toBeVisible({
    timeout: 15_000,
  });

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await signIn(
    patientPage,
    "http://127.0.0.1:3000",
    patientEmail,
    patientPassword,
  );
  await patientPage
    .getByRole("button", { name: /^Book / })
    .first()
    .click();
  await expect(
    patientPage.getByText(
      "Appointment booked. It is now in the doctor's live queue.",
    ),
  ).toBeVisible();
  await expect(
    patientPage.getByRole("table").filter({ hasText: "Appointments visible" }),
  ).toContainText("Booked");

  await expect(
    providerPage.getByRole("row").filter({ hasText: patientName }).last(),
  ).toContainText("Awaiting nurse triage", {
    timeout: 15_000,
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(
    adminPage,
    "http://127.0.0.1:3002",
    frontDeskEmail,
    frontDeskPassword,
  );
  await expect(adminPage.getByText("Live schedule")).toBeVisible({
    timeout: 15_000,
  });
  const scheduledPatientRow = adminPage
    .getByRole("row")
    .filter({ hasText: patientName })
    .filter({ has: adminPage.getByRole("button", { name: "Check in" }) })
    .last();
  await expect(scheduledPatientRow).toBeVisible();
  const queueLabel = (
    await scheduledPatientRow.getByText(/^A-\d{3}$/).innerText()
  ).trim();

  const waitingPage = await adminContext.newPage();
  await waitingPage.goto("http://127.0.0.1:3002/waiting-room");
  await expect(waitingPage.getByText("Live", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await scheduledPatientRow.getByRole("button", { name: "Check in" }).click();
  await expect(adminPage.getByRole("status")).toContainText("marked arrived");
  await expect(waitingPage.getByText(queueLabel)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    patientPage.getByRole("table").filter({ hasText: "Appointments visible" }),
  ).toContainText("Arrived", { timeout: 15_000 });

  const nursePatientRow = nursePage
    .getByRole("row")
    .filter({ hasText: patientName })
    .filter({
      has: nursePage.getByRole("button", {
        name: `Record triage for ${patientName}`,
      }),
    })
    .last();
  await expect(nursePatientRow).toBeVisible({ timeout: 15_000 });
  await nursePatientRow
    .getByRole("button", { name: `Record triage for ${patientName}` })
    .click();
  await expect(
    nursePage.getByRole("heading", { name: "Triage assessment" }),
  ).toBeVisible();
  await nursePage.getByLabel("Systolic blood pressure (mmHg)").fill("120");
  await nursePage.getByLabel("Diastolic blood pressure (mmHg)").fill("80");
  await nursePage.getByLabel("Pulse (bpm)").fill("72");
  await nursePage.getByLabel("Respiratory rate (breaths/min)").fill("16");
  await nursePage.getByLabel("Temperature (°C)").fill("36.8");
  await nursePage.getByLabel("Oxygen saturation (%)").fill("98");
  await nursePage.getByLabel("Chief complaint").fill("Synthetic check-in");
  await nursePage.getByRole("button", { name: "Complete triage" }).click();
  await expect(nursePage.getByRole("status")).toContainText(
    "Triage complete. The appointment is ready for the doctor.",
  );

  const patientQueueRow = providerPage
    .getByRole("row")
    .filter({ hasText: patientName })
    .filter({
      has: providerPage.getByRole("button", {
        name: `Start appointment for ${patientName}`,
      }),
    })
    .last();
  await patientQueueRow
    .getByRole("button", { name: `Start appointment for ${patientName}` })
    .click();
  await expect(patientQueueRow).toContainText("In progress");
  await expect(providerPage.getByRole("status")).toContainText(
    "is in progress",
  );
  await expect(
    waitingPage
      .getByRole("region", { name: "Now serving" })
      .getByText(queueLabel),
  ).toBeVisible({ timeout: 15_000 });

  const soapText = `Synthetic subjective note ${runId}`;
  const medication = `Synthetic medication ${runId}`;
  const certificateStatement = `Synthetic certificate statement ${runId}`;
  await expect(
    providerPage.getByRole("heading", { name: "Consultation chart" }),
  ).toBeVisible();
  await expect(
    providerPage.getByRole("heading", { name: "Patient medical history" }),
  ).toBeVisible();
  await expect(providerPage.getByText("synthetic-observation")).toBeVisible();

  const outpatientSyringeRow = inventoryPage
    .getByRole("row")
    .filter({ hasText: "Syringe 5 mL" })
    .filter({ hasText: "Outpatient Department" });
  const startingStockText = await outpatientSyringeRow
    .getByRole("cell")
    .nth(2)
    .innerText();
  const startingStock = Number(
    startingStockText.match(/[\d,.]+/)?.[0].replaceAll(",", ""),
  );
  expect(Number.isFinite(startingStock)).toBe(true);
  const syringeStockOption = providerPage
    .getByLabel("Item and department")
    .locator("option")
    .filter({ hasText: "Syringe 5 mL" })
    .filter({ hasText: "Outpatient Department" });
  const syringeStockId = await syringeStockOption.getAttribute("value");
  expect(syringeStockId).toBeTruthy();
  await providerPage
    .getByLabel("Item and department")
    .selectOption(syringeStockId!);
  await providerPage.getByLabel("Quantity used").fill("2");
  await providerPage.getByRole("button", { name: "Tag consumable" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Consumable tagged and department stock decremented",
  );
  await expect(outpatientSyringeRow.getByRole("cell").nth(2)).toContainText(
    String(startingStock - 2),
    { timeout: 15_000 },
  );
  await expect(
    providerPage.getByText("PHP 30.00 billable usage"),
  ).toBeVisible();

  await providerPage.getByLabel("Complete SOAP note").fill(soapText);
  await providerPage.getByRole("button", { name: "Save SOAP note" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "SOAP note saved",
  );

  const revisedSoapText = `${soapText} revised`;
  await providerPage.getByLabel("Complete SOAP note").fill(revisedSoapText);
  await providerPage.getByRole("button", { name: "Save SOAP note" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "SOAP note revision saved",
  );

  await providerPage.getByLabel("Medication").fill(medication);
  await providerPage
    .getByLabel("Dosage and directions")
    .fill("One synthetic unit daily for two days");
  await providerPage
    .getByRole("button", { name: "Issue prescription" })
    .click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Prescription issued",
  );

  await providerPage
    .getByLabel("Certificate title")
    .fill(`Synthetic certificate ${runId}`);
  await providerPage.getByLabel("Statement").fill(certificateStatement);
  await providerPage.getByRole("button", { name: "Issue certificate" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Medical certificate issued",
  );

  // No patient refresh: these assertions cover the clinical Realtime chain.
  await expect(patientPage.getByText(revisedSoapText)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    patientPage.getByText(`Prescription: ${medication}`),
  ).toBeVisible({ timeout: 15_000 });
  await expect(patientPage.getByText(certificateStatement)).toBeVisible({
    timeout: 15_000,
  });
  const certificateBlock = patientPage
    .getByText(certificateStatement)
    .locator("..");
  const downloadPromise = patientPage.waitForEvent("download");
  await certificateBlock
    .getByRole("button", { name: "Download certificate" })
    .click();
  const certificateDownload = await downloadPromise;
  expect(certificateDownload.suggestedFilename()).toContain(
    "Synthetic-certificate",
  );

  await providerPage
    .getByRole("button", { name: "Complete encounter" })
    .click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Encounter completed",
  );
  await expect(patientPage.getByText(/finished/i)).toBeVisible({
    timeout: 15_000,
  });

  await patientPage.getByLabel("Phone").fill("+63 900 000 0000");
  await patientPage.getByLabel("Address").fill(`Synthetic address ${runId}`);
  await patientPage.getByRole("button", { name: "Save profile" }).click();
  await expect(patientPage.getByRole("status")).toContainText(
    "Profile updated",
  );

  const future = new Date();
  future.setDate(future.getDate() + 2);
  const weekday = future.toLocaleDateString("en-US", { weekday: "long" });
  await providerPage.getByLabel("Service").selectOption({ index: 1 });
  await providerPage.getByRole("checkbox", { name: weekday }).check();
  await providerPage.getByLabel(`${weekday} start time`).fill("10:00");
  await providerPage.getByLabel(`${weekday} end time`).fill("11:00");
  await providerPage.getByRole("button", { name: "Add availability" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Weekly availability saved",
  );

  await adminPage.getByLabel("Patient name").fill(walkInName);
  await adminPage
    .getByLabel("Available appointment slot")
    .selectOption({ index: 1 });
  await adminPage
    .getByRole("button", { name: "Create walk-in and book" })
    .click();
  await expect(adminPage.getByRole("status")).toContainText(
    "Walk-in patient and appointment created.",
  );
  await expect(adminPage.getByText(/^WK-\d{4}-\d{6}$/)).toBeVisible();
  await expect(adminPage.getByText(/^PIN: \d{4}$/)).toBeVisible();

  await adminPage.getByLabel("Patient", { exact: true }).selectOption({
    label: patientName,
  });
  await adminPage.getByLabel("Appointment slot").selectOption({ index: 1 });
  await adminPage.getByRole("button", { name: "Schedule appointment" }).click();
  await expect(adminPage.getByRole("status")).toContainText(
    "Appointment scheduled for the selected patient.",
  );

  // No provider refresh: this assertion is the Realtime regression guard.
  await expect(
    providerPage.getByRole("row").filter({ hasText: walkInName }),
  ).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    patientContext.close(),
    adminContext.close(),
    inventoryContext.close(),
    nurseContext.close(),
    providerContext.close(),
  ]);
});

test("doctor order → lab result and specialist referral → patient history", async ({
  browser,
}) => {
  const runId = String(Date.now());
  const labOrder = `Synthetic CBC ${runId}`;
  const referral = `Synthetic cardiology referral ${runId}`;
  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();
  await signIn(
    doctorPage,
    "http://127.0.0.1:3001",
    providerEmail,
    providerPassword,
  );
  await doctorPage.getByRole("button", { name: "Open chart" }).first().click();

  const labContext = await browser.newContext();
  const labPage = await labContext.newPage();
  await signIn(labPage, "http://127.0.0.1:3001", labEmail, labPassword);
  await expect(
    labPage.getByRole("heading", { name: "Laboratory worklist" }),
  ).toBeVisible();
  const specialistContext = await browser.newContext();
  const specialistPage = await specialistContext.newPage();
  await signIn(
    specialistPage,
    "http://127.0.0.1:3001",
    specialistEmail,
    specialistPassword,
  );
  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await signIn(
    patientPage,
    "http://127.0.0.1:3000",
    patientEmail,
    patientPassword,
  );

  const orderCard = doctorPage
    .getByRole("heading", { name: "Lab order or referral" })
    .locator("..");
  await orderCard.getByLabel("Clinical code").fill(`CBC-${runId}`);
  await orderCard.getByLabel("Order / referral").fill(labOrder);
  await orderCard.getByRole("button", { name: "Place request" }).click();
  const labCard = labPage
    .getByRole("heading", { name: labOrder })
    .locator("..");
  await expect(labCard).toBeVisible({ timeout: 15_000 });
  await labCard.getByLabel("Result code").fill("HGB");
  await labCard.getByLabel("Result name").fill("Hemoglobin");
  await labCard.getByLabel("Value").fill("140");
  await labCard.getByLabel("Unit").fill("g/L");
  await labCard.getByRole("button", { name: "Publish final report" }).click();
  await expect(patientPage.getByText(`Lab result: ${labOrder}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(doctorPage.getByText("Laboratory result ready")).toBeVisible({
    timeout: 15_000,
  });

  await orderCard.getByLabel("Request type").selectOption("referral");
  await orderCard.getByLabel("Clinical code").fill(`CARD-${runId}`);
  await orderCard.getByLabel("Order / referral").fill(referral);
  await orderCard
    .getByLabel("Specialist")
    .selectOption({ label: "Synthetic Specialist" });
  await orderCard.getByRole("button", { name: "Place request" }).click();
  const referralRow = specialistPage
    .getByRole("row")
    .filter({ hasText: referral });
  await expect(referralRow).toBeVisible({ timeout: 15_000 });
  await referralRow.getByRole("button", { name: "Complete" }).click();
  await expect(patientPage.getByText(`Referral: ${referral}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(doctorPage.getByText("Referral updated")).toBeVisible({
    timeout: 15_000,
  });

  await Promise.all([
    doctorContext.close(),
    labContext.close(),
    specialistContext.close(),
    patientContext.close(),
  ]);
});
