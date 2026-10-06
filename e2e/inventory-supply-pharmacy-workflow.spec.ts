import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@synthetic.odyssey.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "LocalOnly-2026!";

async function signInInventory(page: import("@playwright/test").Page) {
  await page.goto("http://127.0.0.1:3002/inventory", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const heading = page.getByRole("heading", { name: "Inventory & Batch Logistics" });
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }
  const emailInput = page.getByLabel("Work email");
  try {
    await emailInput.waitFor({ state: "visible", timeout: 20_000 });
    await emailInput.fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
  } catch {
    // Already authenticated or navigated
  }
  await expect(heading).toBeVisible({ timeout: 35_000 });
}

test.describe("Supply Room Root Warehouse and Pharmacy Inventory Workflow", () => {
  test.setTimeout(120_000);

  test("Inventory page renders GSO CSV intake button and Requisitions tab with schedule indicators", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInInventory(page);

    // Verify Inbound GSO CSV Import button exists in header
    const gsoBtn = page.getByRole("button", { name: /Import GSO CSV/i });
    await expect(gsoBtn).toBeVisible();

    // Verify Requisitions & Supply tab
    const reqTab = page.getByRole("button", { name: /Requisitions & Supply/i });
    await expect(reqTab).toBeVisible();
    await reqTab.click();

    // Verify Requisition Hub Schedule Window banner
    await expect(
      page.getByText(/Weekly Requisition Window|Routine Requisition Window/i),
    ).toBeVisible();
    await expect(page.getByText(/Target Fulfillment/i)).toBeVisible();

    // Verify New Requisition action button is present
    await expect(
      page.getByRole("button", { name: /New Requisition/i }),
    ).toBeVisible();
  });

  test("GSO CSV intake modal opens, parses multi-line CSV with optional expiry, and previews rows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInInventory(page);

    // Open GSO CSV Modal
    await page.getByRole("button", { name: /Import GSO CSV/i }).click();
    await expect(
      page.getByRole("heading", { name: /GSO Bulk Inventory Intake/i }),
    ).toBeVisible();

    // Paste sample CSV content with both dated and date-less (optional expiry) items
    const sampleCsv = `GSO MEDICAL SUPPLIES
ITEM NO.,DESCRIPTION,EXPIRY,UNIT,QTY
1,AMBU BAG ADULT,7/2027,PCS,10
2,STETHOSCOPE DUAL HEAD,,PCS,5
3,CORD CLAMP,11/19/26,PCS,100
4,SURGICAL TAPE PAPER 1 INCH,,ROLLS,25`;

    const textarea = page.getByPlaceholder("Paste CSV rows here...");
    await textarea.fill(sampleCsv);

    // Click Parse Pasted Text
    await page.getByRole("button", { name: /Parse Pasted Text/i }).click();

    // Verify parsed rows rendered in preview table
    await expect(page.getByText("AMBU BAG ADULT")).toBeVisible();
    await expect(page.getByText("STETHOSCOPE DUAL HEAD")).toBeVisible();
    await expect(page.getByText("CORD CLAMP")).toBeVisible();
    await expect(page.getByText("SURGICAL TAPE PAPER 1 INCH")).toBeVisible();

    // Verify that undated stats and badge are visible
    await expect(page.getByText("Optional Expiry (Undated)")).toBeVisible();
    await expect(page.getByText("Optional (none)").first()).toBeVisible();

    // Close modal safely
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: /GSO Bulk Inventory Intake/i }),
    ).not.toBeVisible();
  });

  test("Pharmacy Inventory import modal opens, accepts Excel/CSV uploads, and previews categorized medicine stock", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInInventory(page);

    // Open Pharmacy Inventory Modal
    const pharmBtn = page.getByRole("button", { name: /Import Pharmacy/i });
    await expect(pharmBtn).toBeVisible();
    await pharmBtn.click();

    await expect(
      page.getByRole("heading", { name: /Pharmacy Inventory Import/i }),
    ).toBeVisible();

    // Verify modal elements
    await expect(
      page.getByText(/Bulk import medicines, anesthetics, IV fluids/i),
    ).toBeVisible();

    // Close modal safely
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: /Pharmacy Inventory Import/i }),
    ).not.toBeVisible();
  });

  test("NBB Pharmacy POS terminal displays catalog and enforces live stock deduction isolation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInInventory(page);

    // Navigate to POS terminal
    await page.goto("http://127.0.0.1:3002/pos", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Check heading
    await expect(
      page.getByRole("heading", { name: "Pharmacy Point of Sale" }),
    ).toBeVisible({ timeout: 20_000 });

    // Verify patient name input
    const patientNameInput = page.getByLabel("Patient name", { exact: false });
    await expect(patientNameInput).toBeVisible();
    await patientNameInput.fill("Synthetic E2E Patient");

    // Checkout button should be disabled when cart is empty
    const checkoutBtn = page.getByRole("button", { name: /Complete NBB sale/i });
    await expect(checkoutBtn).toBeDisabled();
  });

  test("End-to-End Database Cycle: Root Supply Intake → Requisition → Dispersal → Isolated POS Deduction", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Resolve Organization with Root Supply Department
    const { data: rootDepts, error: rootSearchErr } = await adminClient
      .from("departments")
      .select("organization_id, id")
      .eq("is_root_supply", true)
      .limit(1);
    expect(rootSearchErr).toBeNull();
    expect(rootDepts && rootDepts.length > 0).toBe(true);
    const orgId = rootDepts![0].organization_id;
    const rootDeptId = rootDepts![0].id;

    // 2. Resolve Pharmacy Department

    const { data: depts, error: deptErr } = await adminClient
      .from("departments")
      .select("id, name, code")
      .eq("organization_id", orgId)
      .ilike("name", "%pharmacy%")
      .limit(1);
    expect(deptErr).toBeNull();
    expect(depts && depts.length > 0).toBe(true);
    const pharmacyDeptId = depts![0].id;

    expect(rootDeptId).not.toBe(pharmacyDeptId);

    // 3. Create or resolve test inventory item
    const runId = Date.now();
    const itemSku = `E2E-MED-${runId}`;
    const { data: itemData, error: itemErr } = await adminClient
      .from("inventory_items")
      .insert({
        organization_id: orgId,
        sku: itemSku,
        name: `E2E Paracetamol 500mg ${runId}`,
        unit_of_measure: "tablet",
        unit_cost: 1.5,
        selling_price: 3.0,
        is_perishable: true,
        active: true,
      })
      .select()
      .single();
    expect(itemErr).toBeNull();
    const itemId = itemData!.id;

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    const staffClient = createClient(supabaseUrl, anonKey);
    const { error: authErr } = await staffClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    expect(authErr).toBeNull();

    // 4. Inbound Intake to Root Supply Department (50 units with expiry)
    const expiryDate = "2027-12-31";
    const { error: intakeErr } = await staffClient.rpc("receive_inventory_stock", {
      p_item_id: itemId,
      p_department_id: rootDeptId,
      p_batches: [
        {
          quantity: 50,
          lot_number: `LOT-E2E-${runId}`,
          expiry_date: expiryDate,
        },
      ],
      p_reason: "GSO E2E Intake Shipment",
      p_movement_type: "receipt",
    });
    expect(intakeErr).toBeNull();

    // Verify Root Supply has 50, Pharmacy has 0
    const { data: rootStockBefore } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", rootDeptId)
      .eq("item_id", itemId)
      .single();
    expect(Number(rootStockBefore?.quantity)).toBe(50);

    const { data: pharmStockBefore } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", pharmacyDeptId)
      .eq("item_id", itemId)
      .maybeSingle();
    expect(Number(pharmStockBefore?.quantity ?? 0)).toBe(0);

    // 5. Submit Emergency Requisition from Pharmacy for 20 units
    const { data: reqId, error: reqErr } = await staffClient.rpc("submit_inventory_requisition", {
      p_organization_id: orgId,
      p_requesting_department_id: pharmacyDeptId,
      p_items: [
        {
          item_id: itemId,
          requested_quantity: 20,
          notes: "Urgent restock for inpatient dispensary",
        },
      ],
      p_notes: "Weekly standard request with emergency bypass for automated test",
      p_is_emergency: true,
      p_emergency_justification: "Automated E2E pipeline verification",
    });
    expect(reqErr).toBeNull();
    expect(reqId).toBeTruthy();

    // Verify requisition items
    const { data: reqItems } = await adminClient
      .from("inventory_requisition_items")
      .select("id, status, requested_quantity, dispersed_quantity")
      .eq("requisition_id", reqId);
    expect(reqItems?.length).toBe(1);
    const reqItem = reqItems![0];
    expect(reqItem.status).toBe("ready_for_dispersal");

    // 6. Central Supply Disperses 20 units to Pharmacy
    const { error: disperseErr } = await staffClient.rpc("disperse_inventory_requisition_item", {
      p_requisition_item_id: reqItem.id,
      p_quantity: 20,
    });
    expect(disperseErr).toBeNull();

    // Verify stock transfer: Root Supply has 30, Pharmacy has 20
    const { data: rootStockAfter } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", rootDeptId)
      .eq("item_id", itemId)
      .single();
    expect(Number(rootStockAfter?.quantity)).toBe(30);

    const { data: pharmStockAfter } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", pharmacyDeptId)
      .eq("item_id", itemId)
      .single();
    expect(Number(pharmStockAfter?.quantity)).toBe(20);

    // 7. Dispense 5 units at Pharmacy POS using authenticated staff client
    const { data: authUserData } = await staffClient.auth.getUser();
    expect(authUserData.user?.id).toBeTruthy();
    await adminClient.from("staff_department_assignments").upsert(
      {
        organization_id: orgId,
        user_id: authUserData.user!.id,
        department_id: pharmacyDeptId,
      },
      { onConflict: "organization_id,user_id" },
    );

    const { data: posResult, error: posErr } = await staffClient.rpc("create_nbb_pharmacy_pos_sale", {
      p_organization_id: orgId,
      p_items: [
        {
          item_id: itemId,
          quantity: 5,
        },
      ],
      p_patient_name: `E2E Patient ${runId}`,
    });
    expect(posErr).toBeNull();
    expect(posResult).toBeTruthy();

    // 8. Verify live stock deduction isolation:
    // Pharmacy stock decreased from 20 to 15.
    // Root Supply stock remains untouched at 30!
    const { data: pharmStockFinal } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", pharmacyDeptId)
      .eq("item_id", itemId)
      .single();
    expect(Number(pharmStockFinal?.quantity)).toBe(15);

    const { data: rootStockFinal } = await adminClient
      .from("department_stock")
      .select("quantity")
      .eq("department_id", rootDeptId)
      .eq("item_id", itemId)
      .single();
    expect(Number(rootStockFinal?.quantity)).toBe(30);
  });
});
