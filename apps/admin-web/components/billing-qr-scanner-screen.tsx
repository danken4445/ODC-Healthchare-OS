"use client";

import { resolveInvoiceQr } from "@odyssey/supabase-client";
import type { InvoiceQrResolution } from "@odyssey/types";
import { QrCameraScanner } from "@odyssey/ui";
import { ArrowLeft, CheckCircle2, Clock3, QrCode, SearchX } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { PageHeader } from "./page-header";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function BillingQrScannerScreen() {
  const { client, email, loading: authLoading } = useAdminData();
  const [result, setResult] = useState<InvoiceQrResolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scan = useCallback(async (payload: string) => {
    setLoading(true); setError(null); setResult(null);
    const response = await resolveInvoiceQr(client, payload);
    if (response.error) setError(response.error.message); else setResult(response.data);
    setLoading(false);
  }, [client]);
  if (!authLoading && !email) return <AdminSignIn />;
  const icon = result?.status === "active" ? <QrCode /> : result?.status === "paid" ? <CheckCircle2 /> : result?.status === "expired" ? <Clock3 /> : <SearchX />;
  return <>
    <PageHeader eyebrow="Billing intake" title="Scan visit invoice" description="Only Odyssey invoice QR codes resolve here. Patient identity QR codes and payment-provider QR codes are deliberately rejected." actions={<Link className="billing-back-link" href="/billing"><ArrowLeft size={16} />Billing workspace</Link>} />
    <div className="billing-scan-layout">
      <QrCameraScanner onScan={(payload) => void scan(payload)} disabled={loading} />
      <section className="billing-scan-result" aria-live="polite">
        {loading ? <p>Resolving invoice…</p> : error ? <div role="alert"><SearchX /><h2>Unable to resolve</h2><p>{error}</p></div> : result ? <div className={`billing-resolution billing-resolution--${result.status}`}>{icon}<p className="eyebrow">{result.status.replaceAll("_", " ")}</p><h2>{result.invoice_number ?? "Invoice not found"}</h2>{result.patient_name ? <p>{result.patient_name}</p> : null}{result.billing_mode ? <span className={`billing-mode billing-mode--${result.billing_mode}`}>{result.billing_mode.toUpperCase()}</span> : null}{result.balance_due != null ? <dl><div><dt>Total charge</dt><dd>{money.format(result.total_due ?? 0)}</dd></div><div><dt>Balance</dt><dd>{money.format(result.balance_due)}</dd></div></dl> : null}{result.invoice_id && result.status !== "not_found" ? <Link className="billing-primary-link" href={`/billing/invoices/${result.invoice_id}`}>Open invoice</Link> : null}</div> : <div><QrCode /><h2>Ready to scan</h2><p>Position the visit QR inside the camera frame, or paste its payload.</p></div>}
      </section>
    </div>
  </>;
}
