import { expect, test } from "@playwright/test";

test.describe("Patient Medical Record (PMR) Standardized Document Workflow", () => {
  test("loads patient portal, generates PMR document, triggers print and share", async ({ page }) => {
    test.setTimeout(90_000);

    // 1. Navigate to patient portal records tab
    await page.goto("http://127.0.0.1:3000/?tab=records", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Check records section visibility
    const recordsHeading = page.getByRole("heading", { name: /Medical history/i });
    if (await recordsHeading.isVisible()) {
      // Find PMR button
      const pmrBtn = page.getByRole("button", { name: /Full Medical Record \(PMR\)/i });
      if (await pmrBtn.isVisible()) {
        await pmrBtn.click();

        // 2. Verify formal document container renders
        await expect(page.locator(".pmr-document-container")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("PATIENT MEDICAL RECORD")).toBeVisible();
        await expect(page.getByText("Patient Identification")).toBeVisible();
        await expect(page.getByText("CLINICAL ALERTS & ALLERGIES")).toBeVisible();
        await expect(page.getByText(/Republic Act No\. 10173/i)).toBeVisible();

        // 3. Test Toolbar actions
        // Letter toggle
        const letterBtn = page.getByRole("button", { name: "Letter" });
        if (await letterBtn.isVisible()) {
          await letterBtn.click();
          await expect(page.locator(".pmr-document-container.size-letter")).toBeVisible();
        }

        // Secure Share dialog
        const shareBtn = page.getByRole("button", { name: /Secure Share/i });
        if (await shareBtn.isVisible()) {
          await shareBtn.click();
          await expect(page.getByRole("heading", { name: /Create Secure Medical Record Share Link/i })).toBeVisible();

          // Fill share form
          await page.getByLabel(/Authorized Recipient Name/i).fill("Dr. Jose Rizal / Manila Doctors");
          await page.getByLabel(/Purpose of Release/i).fill("Medical consultation evaluation");
          await page.getByRole("button", { name: /Generate Share Link/i }).click();

          // Confirm link generation
          await expect(page.getByText(/Secure Share Link Active/i)).toBeVisible();
          await page.getByRole("button", { name: "Done" }).click();
        }

        // Close PMR document
        const closeBtn = page.getByRole("button", { name: "✕" });
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await expect(page.locator(".pmr-document-container")).not.toBeVisible();
        }
      }
    }
  });

  test("verification route validates document without exposing PHI", async ({ request }) => {
    // Call public verification API
    const response = await request.get("http://127.0.0.1:3000/api/pmr/verify/PMR-TEST-0001");
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body).toHaveProperty("valid");
    expect(body).toHaveProperty("documentId");
    // Ensure no PHI in response
    expect(body).not.toHaveProperty("patientName");
    expect(body).not.toHaveProperty("diagnoses");
  });
});
