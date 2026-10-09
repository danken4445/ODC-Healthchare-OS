"use client";

import { Button } from "@odyssey/ui";
import { CheckCircle2, ClipboardList, Plus, Printer } from "lucide-react";
import { useCallback } from "react";
import { buildNbbPharmacyReceiptPrintDocument } from "./nbb-pharmacy-receipt-document";
import type { NbbCompletedReceiptData } from "./nbb-completed-receipt-data";

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCentavos(centavos: number | bigint): string {
  const num = typeof centavos === "bigint" ? Number(centavos) : centavos;
  return money.format(num / 100);
}

export function printNbbCompletedReceipt(data: NbbCompletedReceiptData, organizationName?: string) {
  const html = buildNbbPharmacyReceiptPrintDocument({
    organizationName,
    receiptNumber: data.receiptNumber,
    invoiceId: data.invoiceId,
    patientName: data.patientName,
    standardTotalCentavos: data.standardTotalCentavos,
    patientBalanceDueCentavos: data.patientBalanceDueCentavos,
    items: data.items,
    issuedAt: data.issuedAt,
  });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    }
  }, 200);
}

interface NbbCompletedReceiptProps {
  data: NbbCompletedReceiptData;
  organizationName?: string;
  onNewSale?: () => void;
  newSaleLabel?: string;
  onViewHistory?: () => void;
}

export function NbbCompletedReceipt({
  data,
  organizationName,
  onNewSale,
  newSaleLabel = "New NBB Sale",
  onViewHistory,
}: NbbCompletedReceiptProps) {
  const handlePrint = useCallback(() => printNbbCompletedReceipt(data, organizationName), [data, organizationName]);

  return (
    <section
      className="nbb-receipt-card"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "2rem",
        maxWidth: "700px",
        margin: "2rem auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
    >
      <style>{`@media print {
        @page { size: auto; margin: 4mm; }
        body { background: #ffffff !important; color: #000000 !important; margin: 0 !important; padding: 0 !important; }
        .sidebar, .mobile-header, .org-context-bar, .page-header, .no-print, .no-print *, button, .appointment-notification-toast { display: none !important; }
        .workspace, .workspace__main, .nbb-pos-container, .pharmacy-workspace { margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; }
        .nbb-receipt-card { width: 76mm !important; max-width: 76mm !important; margin: 0 !important; padding: 3.5mm 3mm !important; box-shadow: none !important; border: 1px dashed #333333 !important; border-radius: 0 !important; background: #ffffff !important; color: #000000 !important; page-break-inside: avoid !important; break-inside: avoid !important; font-size: 10px !important; }
        .nbb-receipt-card * { color: #000000 !important; border-color: #333333 !important; }
        .nbb-print-cut-line { display: block !important; margin-top: 8px; padding-top: 3px; border-top: 1px dashed #666666; font-size: 8px; text-align: center; color: #444444 !important; }
      }`}</style>

      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <CheckCircle2 size={56} color="var(--status-success)" style={{ margin: "0 auto 0.75rem" }} />
        <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>NBB Pharmacy Dispense Completed</h2>
        <p style={{ color: "var(--muted-foreground)", margin: 0 }}>
          Receipt Number: <strong>{data.receiptNumber}</strong>
        </p>
      </div>

      <div
        style={{
          background: "var(--status-success-bg)",
          border: "1px solid var(--status-success-border)",
          borderRadius: "0.5rem",
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontSize: "0.875rem", color: "var(--status-success)", fontWeight: 500 }}>
            Patient Liability (NBB Guarantee)
          </span>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--status-success)" }}>
            {formatCentavos(data.patientBalanceDueCentavos)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Standard Audit Charges</span>
          <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>{formatCentavos(data.standardTotalCentavos)}</div>
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--muted-foreground)" }}>Patient Name</span>
          <strong style={{ fontWeight: 600 }}>{data.patientName}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--muted-foreground)" }}>Coverage Type</span>
          <span>PhilHealth No-Balance-Billing (NBB)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--muted-foreground)" }}>Invoice Reference</span>
          <code>{data.invoiceId}</code>
        </div>
      </div>

      <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Dispensed Items</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted-foreground)" }}>
            <th style={{ padding: "0.5rem 0" }}>Item</th>
            <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
            <th style={{ padding: "0.5rem 0", textAlign: "right" }}>Standard Charge</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={`${item.name}-${index}`} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0.5rem 0" }}>{item.name}</td>
              <td style={{ padding: "0.5rem", textAlign: "center" }}>{item.quantity}</td>
              <td style={{ padding: "0.5rem 0", textAlign: "right" }}>{formatCentavos(item.standardCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="nbb-print-cut-line" style={{ display: "none" }}>✂ - - - - - - - - - Cut along line - - - - - - - - - ✂</div>

      <div className="no-print" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginTop: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap", width: "100%" }}>
          <Button onClick={handlePrint} style={{ minWidth: "160px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            <Printer size={16} /> Print Receipt
          </Button>
          {onNewSale ? (
            <Button variant="outline" onClick={onNewSale} style={{ minWidth: "160px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <Plus size={16} /> {newSaleLabel}
            </Button>
          ) : null}
          {onViewHistory ? (
            <Button variant="outline" onClick={onViewHistory} style={{ minWidth: "160px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <ClipboardList size={16} /> View in History
            </Button>
          ) : null}
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0, textAlign: "center" }}>
          Compact receipt slip format: sized for 80mm thermal printers or standard bond paper without occupying the whole sheet.
        </p>
      </div>
    </section>
  );
}
