import type { NbbReceiptItemData } from "./nbb-pharmacy-receipt-document";

export interface NbbCompletedReceiptData {
  receiptNumber: string;
  invoiceId: string;
  patientName: string;
  standardTotalCentavos: number | bigint;
  patientBalanceDueCentavos: number | bigint;
  items: NbbReceiptItemData[];
  issuedAt?: string | Date;
}

export function buildNbbCompletedReceiptData(input: {
  result: {
    receipt_number?: string | null;
    invoice_id?: string | null;
    standard_total_in_centavos?: number | bigint | null;
    patient_balance_due_in_centavos?: number | bigint | null;
  };
  patientName: string;
  items: NbbReceiptItemData[];
  issuedAt?: string | Date;
}): NbbCompletedReceiptData {
  return {
    receiptNumber: input.result.receipt_number ?? "—",
    invoiceId: input.result.invoice_id ?? "—",
    patientName: input.patientName,
    standardTotalCentavos: input.result.standard_total_in_centavos ?? 0,
    patientBalanceDueCentavos: input.result.patient_balance_due_in_centavos ?? 0,
    items: input.items,
    issuedAt: input.issuedAt,
  };
}
