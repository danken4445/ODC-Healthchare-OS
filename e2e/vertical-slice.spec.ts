import { expect, test, type Page } from "@playwright/test";

const localPassword = "LocalOnly-2026!";
const patientEmail =
  process.env.E2E_PATIENT_EMAIL ?? "patient@synthetic.odyssey.test";
const patientPassword = process.env.E2E_PATIENT_PASSWORD ?? localPassword;
const providerEmail =
  process.env.E2E_PROVIDER_EMAIL ?? "doctor@synthetic.odyssey.test";
const providerPassword = process.env.E2E_PROVIDER_PASSWORD ?? localPassword;
const frontDeskEmail =
  process.env.E2E_FRONT_DESK_EMAIL ?? "front-desk@synthetic.odyssey.test";
const frontDeskPassword = process.env.E2E_FRONT_DESK_PASSWORD ?? localPassword;

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

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  const startButtons = providerPage.getByRole("button", {
    name: `Start appointment for ${patientName}`,
  });
  const startButtonCount = await startButtons.count();
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

  await expect(startButtons).toHaveCount(startButtonCount + 1, {
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
  await expect(providerPage.getByRole("heading", { name: "Consultation chart" })).toBeVisible();
  await providerPage.getByLabel("Section").selectOption("S");
  await providerPage.getByLabel("Clinical note").fill(soapText);
  await providerPage.getByRole("button", { name: "Save note" }).click();
  await expect(providerPage.getByRole("status")).toContainText("SOAP note saved");

  await providerPage.getByLabel("Medication").fill(medication);
  await providerPage.getByLabel("Dosage and directions").fill("One synthetic unit daily for two days");
  await providerPage.getByRole("button", { name: "Issue prescription" }).click();
  await expect(providerPage.getByRole("status")).toContainText("Prescription issued");

  await providerPage.getByLabel("Certificate title").fill(`Synthetic certificate ${runId}`);
  await providerPage.getByLabel("Statement").fill(certificateStatement);
  await providerPage.getByRole("button", { name: "Issue certificate" }).click();
  await expect(providerPage.getByRole("status")).toContainText("Medical certificate issued");

  // No patient refresh: these assertions cover the clinical Realtime chain.
  await expect(patientPage.getByText(soapText)).toBeVisible({ timeout: 15_000 });
  await expect(patientPage.getByText(`Prescription: ${medication}`)).toBeVisible({ timeout: 15_000 });
  await expect(patientPage.getByText(certificateStatement)).toBeVisible({ timeout: 15_000 });

  await providerPage.getByRole("button", { name: "Complete encounter" }).click();
  await expect(providerPage.getByRole("status")).toContainText("Encounter completed");
  await expect(patientPage.getByText(/finished/i)).toBeVisible({ timeout: 15_000 });

  const future = new Date();
  future.setDate(future.getDate() + 2);
  future.setHours(10, 0, 0, 0);
  const localInput = new Date(
    future.getTime() - future.getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 16);
  await providerPage.getByLabel("Service").selectOption({ index: 1 });
  await providerPage.getByLabel("Start time").fill(localInput);
  await providerPage.getByRole("button", { name: "Add availability" }).click();
  await expect(providerPage.getByRole("status")).toContainText(
    "Availability added",
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
    providerContext.close(),
  ]);
});
