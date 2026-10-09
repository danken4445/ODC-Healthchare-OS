import assert from "node:assert/strict";
import test from "node:test";
import {
  completePharmacyPrescriptionOrder,
  createStandalonePharmacyInventoryOrder,
  createPharmacyPrescriptionTranscription,
  getPharmacyPrescriptionAvailability,
  listInventoryStaffNames,
  listPharmacyPrescriptionQueue,
} from "../src/index.ts";

function rpcClient(response: { data?: unknown; error?: unknown }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
      },
    } as never,
  };
}

const org = "10000000-0000-0000-0000-000000000001";
const patient = "20000000-0000-0000-0000-000000000001";
const encounter = "30000000-0000-0000-0000-000000000001";
const item = "40000000-0000-0000-0000-000000000001";

test("transcription wrapper rejects an empty physical prescription reference", async () => {
  const mock = rpcClient({ data: "50000000-0000-0000-0000-000000000001" });
  const result = await createPharmacyPrescriptionTranscription(mock.client, {
    organizationId: org,
    patientId: patient,
    encounterId: encounter,
    prescriptionReference: "   ",
    prescriberName: "Dr. Test",
    items: [{ originalMedication: "Paracetamol", itemId: item, quantity: 1 }],
  });
  assert.ok(result.error);
  assert.equal(mock.calls.length, 0);
});

test("standalone order wrapper sends free-text references without patient or encounter IDs", async () => {
  const mock = rpcClient({ data: "50000000-0000-0000-0000-000000000001" });
  const result = await createStandalonePharmacyInventoryOrder(mock.client, {
    organizationId: org,
    patientReference: "Ward B, Bed 12",
    wardReference: "Ward B",
    prescriptionReference: "RX-123",
    prescriberName: "Dr. Test",
    items: [{ originalMedication: "Paracetamol", itemId: item, quantity: 2 }],
  });

  assert.equal(result.error, null);
  assert.equal(mock.calls[0]?.name, "create_standalone_pharmacy_inventory_order");
  assert.deepEqual(mock.calls[0]?.args, {
    p_organization_id: org,
    p_patient_reference: "Ward B, Bed 12",
    p_ward_reference: "Ward B",
    p_prescription_reference: "RX-123",
    p_prescriber_name: "Dr. Test",
    p_items: [{
      original_medication: "Paracetamol",
      item_id: item,
      dosage_instruction: null,
      quantity: 2,
      unit_of_measure: null,
      notes: null,
    }],
    p_priority: "routine",
  });
});

test("standalone order wrapper allows a missing physical prescription reference", async () => {
  const mock = rpcClient({ data: "50000000-0000-0000-0000-000000000001" });
  const result = await createStandalonePharmacyInventoryOrder(mock.client, {
    organizationId: org,
    patientReference: "Ward B, Bed 12",
    prescriberName: "Dr. Test",
    items: [{ originalMedication: "Paracetamol", itemId: item, quantity: 1 }],
  });

  assert.equal(result.error, null);
  assert.equal(mock.calls[0]?.args.p_prescription_reference, null);
});

test("availability wrapper sends the exact item and quantity payload", async () => {
  const mock = rpcClient({ data: [{ item_id: item, requested_quantity: 2, available_quantity: 5, status: "available" }] });
  const result = await getPharmacyPrescriptionAvailability(mock.client, org, [
    { originalMedication: "Paracetamol", itemId: item, quantity: 2 },
  ]);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ item_id: item, requested_quantity: 2, available_quantity: 5, status: "available" }]);
  assert.equal(mock.calls[0]?.name, "get_pharmacy_prescription_availability");
  assert.deepEqual(mock.calls[0]?.args.p_items, [{ item_id: item, quantity: 2 }]);
});

test("completion wrapper preserves the typed terminal result", async () => {
  const mock = rpcClient({ data: {
    order_id: "50000000-0000-0000-0000-000000000001",
    status: "completed",
    completed: true,
    pos_sale_id: "80000000-0000-0000-0000-000000000001",
    invoice_id: "90000000-0000-0000-0000-000000000001",
    receipt_number: "RCT-20261008-00001",
    billing_mode: "nbb",
    standard_total_in_centavos: 12500,
    patient_balance_due_in_centavos: 0,
  } });
  const result = await completePharmacyPrescriptionOrder(mock.client, {
    orderId: "50000000-0000-0000-0000-000000000001",
    outcomes: [{ lineId: "60000000-0000-0000-0000-000000000001", action: "dispense", quantity: 1 }],
  });
  assert.equal(result.error, null);
  assert.equal(result.data?.status, "completed");
  assert.equal(result.data?.receipt_number, "RCT-20261008-00001");
  assert.equal(result.data?.billing_mode, "nbb");
  assert.equal(result.data?.patient_balance_due_in_centavos, 0);
  assert.equal(mock.calls[0]?.name, "complete_pharmacy_prescription_order");
  assert.deepEqual(mock.calls[0]?.args, {
    p_order_id: "50000000-0000-0000-0000-000000000001",
    p_outcomes: [{
      line_id: "60000000-0000-0000-0000-000000000001",
      action: "dispense",
      quantity: 1,
      reason: null,
    }],
  });
});

test("inventory staff names wrapper maps requesting-user names", async () => {
  const mock = rpcClient({ data: [{ user_id: "70000000-0000-0000-0000-000000000001", display_name: "Nurse Test" }] });
  const result = await listInventoryStaffNames(mock.client, org);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ userId: "70000000-0000-0000-0000-000000000001", displayName: "Nurse Test" }]);
  assert.equal(mock.calls[0]?.name, "list_inventory_staff_names");
  assert.deepEqual(mock.calls[0]?.args, { p_organization_id: org });
});

test("queue wrapper preserves each mapped inventory SKU for display", async () => {
  const mock = rpcClient({ data: [{
    id: "50000000-0000-0000-0000-000000000001",
    organization_id: org,
    priority: "routine",
    status: "ready_to_dispense",
    submitted_by: "70000000-0000-0000-0000-000000000001",
    submitted_at: "2026-10-09T00:00:00.000Z",
    lines: [{
      id: "60000000-0000-0000-0000-000000000001",
      organization_id: org,
      order_id: "50000000-0000-0000-0000-000000000001",
      item_id: item,
      item_sku: "ALB-50ML",
      original_medication: "Albumin, Human (20%, 50mL IV bottle)",
      requested_quantity: 6,
      dispensed_quantity: 0,
      status: "pharmacist_verified",
      created_at: "2026-10-09T00:00:00.000Z",
      updated_at: "2026-10-09T00:00:00.000Z",
    }],
    events: [],
  }] });

  const result = await listPharmacyPrescriptionQueue(mock.client, org);

  assert.equal(result.error, null);
  assert.equal(result.data?.[0]?.lines[0]?.item_sku, "ALB-50ML");
});
