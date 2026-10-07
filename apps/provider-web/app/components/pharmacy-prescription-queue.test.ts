import assert from "node:assert/strict";
import test from "node:test";
import {
  getPharmacyOrderStatusLabel,
  pharmacyOrderStatusTone,
} from "./PharmacyPrescriptionQueue";

test("pharmacy order status labels stay operationally clear", () => {
  assert.equal(getPharmacyOrderStatusLabel("submitted"), "Awaiting pharmacist review");
  assert.equal(getPharmacyOrderStatusLabel("ready_to_dispense"), "Ready to dispense");
  assert.equal(getPharmacyOrderStatusLabel("partially_dispensed"), "Partially dispensed");
  assert.equal(pharmacyOrderStatusTone("completed"), "success");
  assert.equal(pharmacyOrderStatusTone("rejected"), "danger");
});
