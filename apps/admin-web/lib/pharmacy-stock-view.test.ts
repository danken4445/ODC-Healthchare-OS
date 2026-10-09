import assert from "node:assert/strict";
import test from "node:test";
import { filterPharmacyStock, paginatePharmacyStock } from "./pharmacy-stock-view.ts";

const items = [
  { name: "Amoxicillin", sku: "AMOX", unit_of_measure: "capsule", available_quantity: 12 },
  { name: "Paracetamol", sku: "PARA", unit_of_measure: "tablet", available_quantity: 3 },
  { name: "Insulin", sku: "INS", unit_of_measure: "vial", available_quantity: 0 },
];

test("filters pharmacy stock by search, unit, and stock state", () => {
  assert.deepEqual(
    filterPharmacyStock(items, { query: "para", unit: "tablet", stock: "low" }).map((item) => item.name),
    ["Paracetamol"],
  );
});

test("paginates pharmacy stock with a bounded page", () => {
  const result = paginatePharmacyStock(items, 2, 2);
  assert.deepEqual(result.items.map((item) => item.name), ["Insulin"]);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
});
