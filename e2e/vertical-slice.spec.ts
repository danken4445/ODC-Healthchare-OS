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

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(
    adminPage,
    "http://127.0.0.1:3002",
    frontDeskEmail,
    frontDeskPassword,
  );
  await expect(
    adminPage.getByRole("row").filter({ hasText: patientName }),
  ).toBeVisible();
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
