import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNbbPharmacyReceiptPrintDocument,
  formatReceiptCentavos,
  type NbbReceiptDocumentData,
} from "./nbb-pharmacy-receipt-document.ts";

const sampleReceipt: NbbReceiptDocumentData = {
  organizationName: "General Hospital <NBB>",
  receiptNumber: "RCT-20261006-00003",
  invoiceId: "426eb7da-e351-469b-97ca-e644e797940d",
  patientName: "Juan & Maria Dela Cruz",
  coverageType: "PhilHealth No-Balance-Billing (NBB)",
  standardTotalCentavos: 15000, // ₱150.00
  patientBalanceDueCentavos: 0,
  items: [
    {
      name: "ALCOHOL 70% <500ml>",
      quantity: 2,
      standardCentavos: 15000,
    },
  ],
  issuedAt: "2026-10-06T19:00:00.000Z",
};

test("formatReceiptCentavos formats zero and non-zero centavos to PHP string", () => {
  assert.match(formatReceiptCentavos(0), /0\.00/);
  assert.match(formatReceiptCentavos(15000), /150\.00/);
});

test("buildNbbPharmacyReceiptPrintDocument outputs compact 76mm printable receipt slip with escaped text", () => {
  const html = buildNbbPharmacyReceiptPrintDocument(sampleReceipt);

  // Escaping assertions
  assert.match(html, /General Hospital &lt;NBB&gt;/);
  assert.match(html, /Juan &amp; Maria Dela Cruz/);
  assert.match(html, /ALCOHOL 70% &lt;500ml&gt;/);
  assert.doesNotMatch(html, /<500ml>/);

  // Receipt content assertions
  assert.match(html, /RCT-20261006-00003/);
  assert.match(html, /426eb7da-e351-469b-97ca-e644e797940d/);
  assert.match(html, /PhilHealth NBB Guarantee/);
  assert.match(html, /PATIENT AMOUNT DUE:/);

  // Sizing assertions - ensuring small receipt width (76mm) and cut boundary
  assert.match(html, /width:\s*76mm;/);
  assert.match(html, /max-width:\s*76mm;/);
  assert.match(html, /Cut along line/);
});
