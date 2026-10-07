import assert from "node:assert/strict";
import test from "node:test";
import {
  completePharmacyPrescriptionOrder,
  createPharmacyPrescriptionTranscription,
  getPharmacyPrescriptionAvailability,
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
  const mock = rpcClient({ data: { order_id: "50000000-0000-0000-0000-000000000001", status: "completed", completed: true } });
  const result = await completePharmacyPrescriptionOrder(mock.client, {
    orderId: "50000000-0000-0000-0000-000000000001",
    outcomes: [{ lineId: "60000000-0000-0000-0000-000000000001", action: "dispense", quantity: 1 }],
  });
  assert.equal(result.error, null);
  assert.equal(result.data?.status, "completed");
  assert.equal(mock.calls[0]?.name, "complete_pharmacy_prescription_order");
});
