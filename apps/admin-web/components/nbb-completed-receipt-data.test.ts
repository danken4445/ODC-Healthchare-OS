import assert from "node:assert/strict";
import test from "node:test";
import { buildNbbCompletedReceiptData } from "./nbb-completed-receipt-data.ts";

test("buildNbbCompletedReceiptData preserves prescription dispense receipt details", () => {
  const receipt = buildNbbCompletedReceiptData({
    result: {
      receipt_number: "RCT-20261008-00003",
      invoice_id: "invoice-123",
      standard_total_in_centavos: 588000,
      patient_balance_due_in_centavos: 0,
    },
    patientName: "jjj",
    items: [
      { name: "Adenosine (3mg/mL, 2mL vial)", quantity: 3, standardCentavos: 588000 },
    ],
    issuedAt: "2026-10-08T08:00:00.000Z",
  });

  assert.deepEqual(receipt, {
    receiptNumber: "RCT-20261008-00003",
    invoiceId: "invoice-123",
    patientName: "jjj",
    standardTotalCentavos: 588000,
    patientBalanceDueCentavos: 0,
    items: [
      { name: "Adenosine (3mg/mL, 2mL vial)", quantity: 3, standardCentavos: 588000 },
    ],
    issuedAt: "2026-10-08T08:00:00.000Z",
  });
});
