import assert from "node:assert/strict";
import test from "node:test";
import { filterPharmacyPrescriptionQueue, findNewPharmacyPrescriptionOrders, paginatePharmacyPrescriptionQueue } from "./pharmacy-prescription-queue-view.ts";

const orders = [
  {
    id: "1", priority: "urgent", status: "submitted", patient_reference: "Dan Test", ward_reference: "Ward A",
    physical_prescription_reference: "RX-123", prescriber_name: "Dr Test", lines: [{ original_medication: "Adenosine" }],
  },
  {
    id: "2", priority: "routine", status: "ready_to_dispense", patient_reference: "Maria Cruz", ward_reference: "Ward B",
    physical_prescription_reference: "RX-456", prescriber_name: "Dr Santos", lines: [{ original_medication: "Albumin" }],
  },
  {
    id: "3", priority: "routine", status: "completed", patient_reference: "Closed Case", ward_reference: null,
    physical_prescription_reference: "RX-789", prescriber_name: "Dr Santos", lines: [{ original_medication: "Insulin" }],
  },
] as const;

test("filters the queue by search, priority, and status", () => {
  assert.deepEqual(
    filterPharmacyPrescriptionQueue(orders, { query: "albumin", priority: "routine", status: "ready_to_dispense" }).map((order) => order.id),
    ["2"],
  );
});

test("keeps terminal orders out of the all-status active queue", () => {
  assert.deepEqual(
    filterPharmacyPrescriptionQueue(orders, { query: "", priority: "all", status: "all" }).map((order) => order.id),
    ["1", "2"],
  );
});

test("paginates queue results and bounds the requested page", () => {
  const result = paginatePharmacyPrescriptionQueue(orders.slice(0, 2), 2, 1);
  assert.deepEqual(result.items.map((order) => order.id), ["2"]);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
});

test("identifies each newly submitted prescription for realtime notifications", () => {
  assert.deepEqual(
    findNewPharmacyPrescriptionOrders(new Set(["1"]), orders).map((order) => order.id),
    ["2", "3"],
  );
});
