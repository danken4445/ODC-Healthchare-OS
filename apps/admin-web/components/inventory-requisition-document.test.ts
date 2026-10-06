import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequisitionCsv,
  buildRequisitionPrintDocument,
} from "./inventory-requisition-document.ts";

const requisition = {
  requisition_number: "REQ-20261007-0001",
  requesting_department_name: "Pharmacy",
  supply_department_name: "Central Supply",
  target_delivery_week: "2026-10-12",
  submitted_at: "2026-10-07T08:00:00.000Z",
  notes: "Keep <dry>",
  items: [
    {
      item_name: "ALCOHOL 70%",
      unit_of_measure: "gal",
      requested_quantity: 10,
      dispersed_quantity: 10,
      notes: '=HYPERLINK("https://unsafe.example")',
    },
  ],
};

test("buildRequisitionCsv creates a portable, spreadsheet-safe copy of a dispersed requisition", () => {
  const csv = buildRequisitionCsv(requisition);

  assert.match(csv, /"Requisition #","Requesting department","Supply department"/);
  assert.match(csv, /"REQ-20261007-0001","Pharmacy","Central Supply"/);
  assert.match(csv, /"ALCOHOL 70%","gal","10","10","Dispersed","'=HYPERLINK\(""https:\/\/unsafe\.example""\)"/);
});

test("buildRequisitionPrintDocument creates a compact, escaped A5 PDF-ready slip", () => {
  const document = buildRequisitionPrintDocument(requisition);

  assert.match(document, /@page\s*\{\s*size:\s*A5 portrait;/);
  assert.match(document, /REQ-20261007-0001/);
  assert.match(document, /Keep &lt;dry&gt;/);
  assert.match(document, /ALCOHOL 70%/);
  assert.doesNotMatch(document, /Keep <dry>/);
});
