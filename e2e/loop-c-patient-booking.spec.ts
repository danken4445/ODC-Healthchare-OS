import { expect, test } from "@playwright/test";

test("patient books through service, doctor, date, and time", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").last().fill("patient@synthetic.odyssey.test");
  await page.getByLabel("Password").last().fill("LocalOnly-2026!");
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await expect(page.getByRole("heading", { name: "Book an appointment" })).toBeVisible();
  await page.locator(".booking-service-option").first().click();
  await expect(page.getByRole("heading", { name: "2. Choose your doctor" })).toBeVisible();
  await page.getByRole("button", { name: /Synthetic Doctor/ }).click();
  await expect(page.getByRole("heading", { name: "3. Choose a date and time" })).toBeVisible();

  await page.locator(".slots-calendar__grid button:not([disabled])").first().click();
  await page.getByRole("button", { name: "Book for a Clinic Visit" }).first().click();
  await expect(page.getByText("Confirm your Clinic Visit")).toBeVisible();
  await expect(page.getByText(/Synthetic Doctor/).last()).toBeVisible();
  await page.getByRole("button", { name: "Confirm Clinic Visit" }).click();
  await expect(page.getByRole("status")).toContainText("Appointment reserved. Your bill is ready; confirmation follows payment.");
});
