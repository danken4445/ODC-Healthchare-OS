import { expect, test, type Page, type Route } from "@playwright/test";

const organizationId = "92000000-0000-0000-0000-000000000001";
const doctorRoleId = "92000000-0000-0000-0000-000000000101";
const otherDoctorRoleId = "92000000-0000-0000-0000-000000000102";
const nurseRoleId = "92000000-0000-0000-0000-000000000103";

type Persona = "manager" | "nurse";

const appointments = [
  {
    id: "92000000-0000-0000-0000-000000000201",
    organization_id: organizationId,
    patient_id: "92000000-0000-0000-0000-000000000301",
    practitioner_role_id: doctorRoleId,
    status: "arrived",
    service_type: "General consultation",
    appointment_type: "scheduled",
    start_at: "2099-01-01T09:00:00.000Z",
    end_at: "2099-01-01T09:30:00.000Z",
    minutes_duration: 30,
    description: null,
    patient_instruction: null,
    clinic_service_id: null,
    queue_date: "2099-01-01",
    queue_number: 1,
    delivery_mode: "in_person",
  },
  {
    id: "92000000-0000-0000-0000-000000000202",
    organization_id: organizationId,
    patient_id: "92000000-0000-0000-0000-000000000302",
    practitioner_role_id: otherDoctorRoleId,
    status: "arrived",
    service_type: "General consultation",
    appointment_type: "scheduled",
    start_at: "2099-01-01T09:30:00.000Z",
    end_at: "2099-01-01T10:00:00.000Z",
    minutes_duration: 30,
    description: null,
    patient_instruction: null,
    clinic_service_id: null,
    queue_date: "2099-01-01",
    queue_number: 2,
    delivery_mode: "in_person",
  },
];

const patients = [
  { id: appointments[0].patient_id, name: { text: "Patient Alpha" } },
  { id: appointments[1].patient_id, name: { text: "Patient Bravo" } },
];

const encounters = appointments.map((appointment, index) => ({
  id: `92000000-0000-0000-0000-00000000040${index + 1}`,
  organization_id: organizationId,
  patient_id: appointment.patient_id,
  appointment_id: appointment.id,
  practitioner_role_id: appointment.practitioner_role_id,
  status: "planned",
  class_code: "AMB",
  service_type: appointment.service_type,
  period_start: appointment.start_at,
  period_end: null,
  diagnosis: [],
}));

const observations = encounters.map((encounter, index) => ({
  id: `92000000-0000-0000-0000-00000000050${index + 1}`,
  organization_id: organizationId,
  patient_id: appointments[index].patient_id,
  encounter_id: encounter.id,
  status: "final",
  code: "TRIAGE-VITALS",
  code_display: "Triage vital signs",
  effective_at: appointments[index].start_at,
  issued_at: appointments[index].start_at,
  value: {},
  value_unit: null,
  supersedes_id: null,
  diagnostic_report_id: null,
  reference_range: null,
  note: null,
}));

function jsonHeaders() {
  return {
    "access-control-allow-headers":
      "authorization,apikey,content-type,x-client-info",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

async function installSupabaseMock(
  page: Page,
  persona: Persona,
  delayProviderRole = false,
) {
  const email =
    persona === "nurse" ? "nurse@example.test" : "manager@example.test";
  const userId = persona === "nurse" ? "user-nurse" : "user-manager";
  const roleId = persona === "nurse" ? nurseRoleId : doctorRoleId;
  let releaseProviderRole = () => undefined;
  const providerRoleReady = delayProviderRole
    ? new Promise<void>((resolve) => {
        releaseProviderRole = resolve;
      })
    : Promise.resolve();
  const jwtPayload = Buffer.from(
    JSON.stringify({ sub: userId, role: "authenticated", exp: 4_102_444_800 }),
  ).toString("base64url");
  const accessToken = `eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  };

  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: jsonHeaders() });
      return;
    }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/token")) {
      await fulfillJson(route, {
        access_token: accessToken,
        refresh_token: "mock-refresh-token",
        expires_in: 3600,
        expires_at: 4_102_444_800,
        token_type: "bearer",
        user,
      });
      return;
    }
    if (pathname.endsWith("/user")) {
      await fulfillJson(route, user);
      return;
    }
    if (pathname.endsWith("/logout")) {
      await fulfillJson(route, {});
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: jsonHeaders() });
      return;
    }
    const url = new URL(route.request().url());
    const resource = url.pathname.split("/").pop() ?? "";
    const body = route.request().postDataJSON?.() as Record<
      string,
      unknown
    > | null;

    if (url.pathname.includes("/rpc/")) {
      if (resource === "get_portal_access") {
        await fulfillJson(route, [
          {
            is_allowed: true,
            is_superadmin: false,
            organization_ids: [organizationId],
            role_codes: persona === "nurse" ? ["nurse"] : ["doctor"],
          },
        ]);
      } else if (resource === "get_current_staff_organization") {
        await fulfillJson(route, organizationId);
      } else if (resource === "get_current_staff_department") {
        await fulfillJson(route, null);
      } else if (resource === "get_current_provider_role_id") {
        await providerRoleReady;
        await fulfillJson(route, roleId);
      } else if (resource === "has_organization_permission") {
        const permission = String(body?.target_permission ?? "");
        const allowed =
          (persona === "manager" &&
            ["can_start_consultation", "can_manage_appointments"].includes(
              permission,
            )) ||
          (persona === "nurse" && permission === "can_record_triage");
        await fulfillJson(route, allowed);
      } else if (resource === "start_appointment_encounter") {
        await fulfillJson(
          route,
          {
            code: "P0002",
            details: null,
            hint: null,
            message: "Assigned appointment not found",
          },
          400,
        );
      } else {
        await fulfillJson(route, []);
      }
      return;
    }

    if (resource === "appointments") {
      await fulfillJson(route, appointments);
    } else if (resource === "patients") {
      await fulfillJson(route, patients);
    } else if (resource === "encounters") {
      await fulfillJson(route, encounters);
    } else if (resource === "observations") {
      await fulfillJson(route, observations);
    } else if (resource === "practitioner_roles") {
      await fulfillJson(route, [
        { id: doctorRoleId, practitioner_id: "practitioner-a" },
        { id: otherDoctorRoleId, practitioner_id: "practitioner-b" },
      ]);
    } else if (resource === "practitioners") {
      if (url.searchParams.has("auth_user_id")) {
        await fulfillJson(route, [
          {
            name: { text: persona === "nurse" ? "Nurse Casey" : "Doctor Ada" },
          },
        ]);
      } else {
        await fulfillJson(route, [
          { id: "practitioner-a", name: { text: "Doctor Ada" } },
          { id: "practitioner-b", name: { text: "Doctor Ben" } },
        ]);
      }
    } else {
      await fulfillJson(route, []);
    }
  });

  return { email, releaseProviderRole };
}

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("test-only-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Daily queue" })).toBeVisible();
  await page.getByRole("button", { name: "Daily queue" }).click();
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe("Loop A provider queue", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("manager doctor defaults to mine, keyboard-switches to All, filters doctors, and sees fallback errors", async ({
    page,
  }) => {
    const mock = await installSupabaseMock(page, "manager", true);
    await signIn(page, mock.email);

    await expect(
      page.getByText("Loading practitioner assignment…"),
    ).toBeVisible();
    mock.releaseProviderRole();

    const mine = page.getByRole("button", { name: "My patients" });
    const all = page.getByRole("button", { name: "All", exact: true });
    await expect(mine).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("row").filter({ hasText: "Patient Alpha" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Patient Bravo" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "Assigned Doctor" }),
    ).toBeVisible();

    await all.focus();
    await expect(all).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("row").filter({ hasText: "Patient Bravo" }),
    ).toBeVisible();

    const doctorFilter = page.getByLabel("Assigned doctor");
    await doctorFilter.selectOption(otherDoctorRoleId);
    const otherDoctorRow = page
      .getByRole("row")
      .filter({ hasText: "Patient Bravo" });
    await expect(otherDoctorRow).toContainText("Doctor Ben");
    await expect(otherDoctorRow).toContainText("Assigned to another doctor");
    await expect(
      otherDoctorRow.getByRole("button", { name: /Mark in progress/i }),
    ).toHaveCount(0);

    await doctorFilter.selectOption(doctorRoleId);
    const ownRow = page.getByRole("row").filter({ hasText: "Patient Alpha" });
    await ownRow
      .getByRole("button", { name: "Start appointment for Patient Alpha" })
      .click();
    await expect(page.getByRole("status").last()).toContainText(
      "This appointment is assigned to another doctor. Ask an authorized coordinator to reassign it.",
    );
    await expectNoHorizontalPageOverflow(page);
  });

  test("nurse queue renders assigned doctors without doctor scope controls at 375px", async ({
    page,
  }) => {
    const mock = await installSupabaseMock(page, "nurse");
    await signIn(page, mock.email);

    await expect(
      page.getByRole("heading", { name: "Nurse triage queue" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Patient Alpha" }),
    ).toContainText("Doctor Ada");
    await expect(
      page.getByRole("row").filter({ hasText: "Patient Bravo" }),
    ).toContainText("Doctor Ben");
    await expect(
      page.getByRole("group", { name: "Patient scope" }),
    ).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
  });
});
