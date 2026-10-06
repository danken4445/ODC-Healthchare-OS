import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  getNbbPharmacyPosCatalog,
  createNbbPharmacyPosSale,
  nbbPosCartItemSchema,
  nbbPosCheckoutInputSchema,
  nbbPosCheckoutResultSchema,
  nbbPharmacyPosCatalogItemSchema,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const validOrgId = "10000000-0000-0000-0000-000000000001";
const validStockId = "92000000-0000-0000-0000-000000000001";
const validItemId = "91000000-0000-0000-0000-000000000001";

test("nbbPosCartItemSchema validates whole number positive quantities and UUIDs", () => {
  const valid = nbbPosCartItemSchema.safeParse({
    item_id: validItemId,
    quantity: 3,
  });
  assert.equal(valid.success, true);

  const zeroQty = nbbPosCartItemSchema.safeParse({
    item_id: validItemId,
    quantity: 0,
  });
  assert.equal(zeroQty.success, false);

  const negQty = nbbPosCartItemSchema.safeParse({
    item_id: validItemId,
    quantity: -2,
  });
  assert.equal(negQty.success, false);

  const fractionalQty = nbbPosCartItemSchema.safeParse({
    item_id: validItemId,
    quantity: 1.5,
  });
  assert.equal(fractionalQty.success, false);

  const malformedId = nbbPosCartItemSchema.safeParse({
    item_id: "invalid-uuid",
    quantity: 1,
  });
  assert.equal(malformedId.success, false);
});

test("nbbPosCheckoutInputSchema rejects empty cart and blank patient name", () => {
  const valid = nbbPosCheckoutInputSchema.safeParse({
    organizationId: validOrgId,
    patientName: "Juan Dela Cruz",
    items: [{ item_id: validItemId, quantity: 2 }],
  });
  assert.equal(valid.success, true);

  const blankName = nbbPosCheckoutInputSchema.safeParse({
    organizationId: validOrgId,
    patientName: "   ",
    items: [{ item_id: validItemId, quantity: 2 }],
  });
  assert.equal(blankName.success, false);

  const emptyCart = nbbPosCheckoutInputSchema.safeParse({
    organizationId: validOrgId,
    patientName: "Juan Dela Cruz",
    items: [],
  });
  assert.equal(emptyCart.success, false);

  const invalidOrg = nbbPosCheckoutInputSchema.safeParse({
    organizationId: "not-a-uuid",
    patientName: "Juan Dela Cruz",
    items: [{ item_id: validItemId, quantity: 1 }],
  });
  assert.equal(invalidOrg.success, false);
});

test("nbbPharmacyPosCatalogItemSchema validates catalog output shape", () => {
  const parsed = nbbPharmacyPosCatalogItemSchema.safeParse({
    stock_id: validStockId,
    item_id: validItemId,
    sku: "MED-01",
    name: "Paracetamol 500mg",
    unit_of_measure: "tablet",
    available_quantity: 50,
    standard_unit_price_in_centavos: 500,
    currency: "PHP",
  });
  assert.equal(parsed.success, true);
});

test("getNbbPharmacyPosCatalog invokes list_nbb_pharmacy_pos_catalog with exact parameters", async () => {
  let invokedRpc = "";
  let invokedParams: unknown = null;

  const client = asClient({
    rpc: async (name: string, params: unknown) => {
      invokedRpc = name;
      invokedParams = params;
      return {
        data: [
          {
            stock_id: validStockId,
            item_id: validItemId,
            sku: "MED-01",
            name: "Paracetamol 500mg",
            unit_of_measure: "tablet",
            available_quantity: 25,
            standard_unit_price_in_centavos: 750,
            currency: "PHP",
          },
        ],
        error: null,
      };
    },
  });

  const result = await getNbbPharmacyPosCatalog(client, validOrgId);
  assert.equal(result.error, null);
  assert.equal(invokedRpc, "list_nbb_pharmacy_pos_catalog");
  assert.deepEqual(invokedParams, { p_organization_id: validOrgId });
  assert.equal(result.data?.length, 1);
  assert.equal(result.data?.[0].standard_unit_price_in_centavos, 750);
});

test("createNbbPharmacyPosSale invokes create_nbb_pharmacy_pos_sale and verifies zero patient balance", async () => {
  let invokedRpc = "";
  let invokedParams: unknown = null;

  const checkoutPayload = {
    billing_event_id: "80000000-0000-0000-0000-000000000001",
    pos_sale_id: "81000000-0000-0000-0000-000000000001",
    invoice_id: "82000000-0000-0000-0000-000000000001",
    receipt_number: "POS-2026-0001",
    standard_total_in_centavos: 1500,
    patient_balance_due_in_centavos: 0,
  };

  const client = asClient({
    rpc: async (name: string, params: unknown) => {
      invokedRpc = name;
      invokedParams = params;
      return {
        data: checkoutPayload,
        error: null,
      };
    },
  });

  const result = await createNbbPharmacyPosSale(client, {
    organizationId: validOrgId,
    patientName: "Maria Clara",
    items: [{ item_id: validItemId, quantity: 2 }],
  });

  assert.equal(result.error, null);
  assert.equal(invokedRpc, "create_nbb_pharmacy_pos_sale");
  assert.deepEqual(invokedParams, {
    p_organization_id: validOrgId,
    p_items: [{ item_id: validItemId, quantity: 2 }],
    p_patient_name: "Maria Clara",
  });
  assert.equal(result.data?.patient_balance_due_in_centavos, 0);
  assert.equal(result.data?.standard_total_in_centavos, 1500);
});

test("listNbbPharmacyPosReceipts queries pos_sales, joins line items and invoices, and returns formatted history", async () => {
  const mockSales = [
    {
      id: "sale-1",
      billing_event_id: "event-1",
      receipt_number: "RCT-20261006-00001",
      customer_name: "Patient Juan",
      status: "completed",
      completed_at: "2026-10-06T10:00:00Z",
      created_at: "2026-10-06T10:00:00Z",
      standard_total_in_centavos: 25000,
    },
  ];

  const mockInvoices = [
    {
      id: "inv-1",
      billing_event_id: "event-1",
      invoice_number: "INV-2026-0001",
      standard_total_in_centavos: 25000,
      patient_balance_due_in_centavos: 0,
    },
  ];

  const mockLineItems = [
    {
      id: "line-1",
      billing_event_id: "event-1",
      description: "PARACETAMOL 500mg",
      quantity: 10,
      standard_unit_price_in_centavos: 2500,
      standard_line_total_in_centavos: 25000,
    },
  ];

  const client = asClient({
    from: (table: string) => {
      if (table === "pos_sales") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: mockSales, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "invoices") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mockInvoices, error: null }),
          }),
        };
      }
      if (table === "billing_line_items") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mockLineItems, error: null }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
  });

  const res = await (await import("../src/index.ts")).listNbbPharmacyPosReceipts(client, validOrgId);
  assert.equal(res.error, null);
  assert.equal(res.data?.length, 1);
  const item = res.data![0];
  assert.equal(item.receiptNumber, "RCT-20261006-00001");
  assert.equal(item.patientName, "Patient Juan");
  assert.equal(item.standardTotalInCentavos, 25000);
  assert.equal(item.patientBalanceDueCentavos, 0);
  assert.equal(item.items.length, 1);
  assert.equal(item.items[0].name, "PARACETAMOL 500mg");
  assert.equal(item.items[0].quantity, 10);
});

