export interface NbbReceiptItemData {
  name: string;
  quantity: number;
  standardCentavos: number | bigint;
}

export interface NbbReceiptDocumentData {
  organizationName?: string;
  receiptNumber: string;
  invoiceId: string;
  patientName: string;
  coverageType?: string;
  standardTotalCentavos: number | bigint;
  patientBalanceDueCentavos: number | bigint;
  items: NbbReceiptItemData[];
  issuedAt?: string | Date;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export function formatReceiptCentavos(centavos: number | bigint): string {
  const num = typeof centavos === "bigint" ? Number(centavos) : Number(centavos || 0);
  return moneyFormatter.format(num / 100);
}

function formatReceiptTimestamp(value?: string | Date): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.valueOf())) return String(value || "");
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Builds a compact, printable receipt HTML document.
 * Sized to 76mm width (standard 80mm POS receipt / compact slip)
 * so it occupies only necessary space on a bond paper sheet or thermal roll.
 */
export function buildNbbPharmacyReceiptPrintDocument(receipt: NbbReceiptDocumentData): string {
  const orgName = escapeHtml(receipt.organizationName || "Odyssey Healthcare");
  const receiptNum = escapeHtml(receipt.receiptNumber);
  const invoiceId = escapeHtml(receipt.invoiceId);
  const patientName = escapeHtml(receipt.patientName || "Patient");
  const coverage = escapeHtml(receipt.coverageType || "PhilHealth No-Balance-Billing (NBB)");
  const timestamp = escapeHtml(formatReceiptTimestamp(receipt.issuedAt));
  const standardTotalStr = formatReceiptCentavos(receipt.standardTotalCentavos);
  const patientDueStr = formatReceiptCentavos(receipt.patientBalanceDueCentavos);

  const itemRows = receipt.items
    .map(
      (item) => `
        <tr>
          <td class="col-item">${escapeHtml(item.name)}</td>
          <td class="col-qty">${escapeHtml(item.quantity)}</td>
          <td class="col-amt">${formatReceiptCentavos(item.standardCentavos)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${receiptNum}</title>
    <style>
      @page {
        size: auto;
        margin: 4mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #000000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace, sans-serif;
        font-size: 10.5px;
        line-height: 1.3;
      }
      /* Compact receipt container: 76mm width ensures it only occupies the necessary corner/top space on bond paper */
      .receipt-slip {
        width: 76mm;
        max-width: 76mm;
        margin: 0;
        padding: 3.5mm 3mm;
        background: #ffffff;
        color: #000000;
        border: 1px dashed #333333;
      }
      .receipt-header {
        text-align: center;
        border-bottom: 1px dashed #000000;
        padding-bottom: 4px;
        margin-bottom: 5px;
      }
      .receipt-org {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        line-height: 1.2;
      }
      .receipt-sub {
        font-size: 9.5px;
        color: #333333;
        margin-top: 1px;
      }
      .receipt-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        margin-top: 3px;
        letter-spacing: 0.5px;
      }
      .receipt-pill {
        display: inline-block;
        font-size: 8.5px;
        font-weight: 700;
        border: 1px solid #000000;
        padding: 1px 4px;
        margin-top: 3px;
        text-transform: uppercase;
      }
      .meta-block {
        border-bottom: 1px dashed #000000;
        padding-bottom: 4px;
        margin-bottom: 5px;
        font-size: 10px;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1.5px;
      }
      .meta-lbl {
        color: #444444;
        white-space: nowrap;
        padding-right: 4px;
      }
      .meta-val {
        font-weight: 600;
        text-align: right;
        word-break: break-all;
      }
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 5px;
        font-size: 10px;
      }
      .items-table th {
        border-bottom: 1px solid #000000;
        text-align: left;
        padding: 2px 0;
        font-size: 9px;
        text-transform: uppercase;
        font-weight: 700;
      }
      .items-table td {
        padding: 2.5px 0;
        vertical-align: top;
        border-bottom: 1px dotted #cccccc;
      }
      .col-item {
        word-break: break-word;
      }
      .col-qty {
        text-align: center;
        width: 10mm;
        white-space: nowrap;
      }
      .col-amt {
        text-align: right;
        width: 20mm;
        white-space: nowrap;
      }
      .totals-block {
        border-top: 1px solid #000000;
        border-bottom: 1px solid #000000;
        padding: 4px 0;
        margin-bottom: 5px;
        font-size: 10px;
      }
      .tot-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1.5px;
      }
      .tot-row.highlight {
        font-size: 11.5px;
        font-weight: 800;
        border-top: 1px dashed #000000;
        padding-top: 3px;
        margin-top: 3px;
      }
      .guarantee-note {
        font-size: 8.5px;
        text-align: center;
        line-height: 1.25;
        margin-bottom: 6px;
        color: #222222;
      }
      .signatures {
        margin-top: 6px;
        font-size: 9px;
      }
      .sig-line {
        margin-top: 8px;
        border-top: 1px solid #666666;
        padding-top: 1px;
        display: flex;
        justify-content: space-between;
        font-size: 8.5px;
        color: #333333;
      }
      .cut-line {
        margin-top: 8px;
        padding-top: 3px;
        border-top: 1px dashed #888888;
        font-size: 8px;
        color: #666666;
        text-align: center;
        letter-spacing: 0.3px;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt-slip">
      <header class="receipt-header">
        <div class="receipt-org">${orgName}</div>
        <div class="receipt-sub">Hospital &amp; Clinical Pharmacy Services</div>
        <div class="receipt-title">Dispense Receipt</div>
        <div class="receipt-pill">PhilHealth NBB Guarantee</div>
      </header>

      <section class="meta-block">
        <div class="meta-row">
          <span class="meta-lbl">Receipt #:</span>
          <span class="meta-val">${receiptNum}</span>
        </div>
        <div class="meta-row">
          <span class="meta-lbl">Date:</span>
          <span class="meta-val">${timestamp}</span>
        </div>
        <div class="meta-row">
          <span class="meta-lbl">Patient:</span>
          <span class="meta-val">${patientName}</span>
        </div>
        <div class="meta-row">
          <span class="meta-lbl">Coverage:</span>
          <span class="meta-val">${coverage}</span>
        </div>
        <div class="meta-row">
          <span class="meta-lbl">Invoice Ref:</span>
          <span class="meta-val" style="font-size: 8.5px; font-family: monospace;">${invoiceId}</span>
        </div>
      </section>

      <table class="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th class="col-qty">Qty</th>
            <th class="col-amt">Standard</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <section class="totals-block">
        <div class="tot-row">
          <span>Standard Charges:</span>
          <span>${standardTotalStr}</span>
        </div>
        <div class="tot-row">
          <span>PhilHealth NBB Subsidy:</span>
          <span>-${standardTotalStr}</span>
        </div>
        <div class="tot-row highlight">
          <span>PATIENT AMOUNT DUE:</span>
          <span>${patientDueStr}</span>
        </div>
        <div class="tot-row" style="font-size: 9px; color: #444444;">
          <span>Tendered / Change:</span>
          <span>₱0.00 / ₱0.00</span>
        </div>
      </section>

      <div class="guarantee-note">
        <strong>Zero Out-of-Pocket Liability:</strong> Covered 100% under PhilHealth No-Balance-Billing (NBB) policy.
      </div>

      <div class="signatures">
        <div class="sig-line">
          <span>Dispensed by / Pharmacist</span>
          <span>Patient / Representative</span>
        </div>
      </div>

      <div class="cut-line">
        ✂ - - - - - - - - - Cut along line - - - - - - - - - ✂
      </div>
    </div>
  </body>
</html>`;
}
