"use client";

import { confirmPaymentAttempt, createPaymentAttempt, getInvoiceDetail, voidBillingLineItem } from "@odyssey/supabase-client";
import type { InvoiceDetail, PaymentMethod } from "@odyssey/types";
import { Button, Input, Select } from "@odyssey/ui";
import { ArrowLeft, Ban, CheckCircle2, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { PageHeader } from "./page-header";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export function BillingInvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  const { client, email, loading: authLoading, permissions } = useAdminData();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = permissions.includes("can_manage_billing");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const result = await getInvoiceDetail(client, invoiceId);
    if (result.error) setError(result.error.message);
    else {
      setDetail(result.data);
      setPaymentId(result.data.payments.find((payment) => payment.status === "pending")?.id ?? null);
    }
    setLoading(false);
  }, [client, invoiceId]);
  useEffect(() => { void load(); }, [load]);

  const createAttempt = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setMessage(null);
    const result = await createPaymentAttempt(client, invoiceId, method, reference);
    if (result.error) setError(result.error.message); else { setPaymentId(result.data); setMessage("Payment attempt created. Confirm only after the full amount has been received."); await load(); }
    setSaving(false);
  };
  const confirm = async () => {
    if (!paymentId) return;
    setSaving(true); setError(null); setMessage(null);
    const result = await confirmPaymentAttempt(client, paymentId);
    if (result.error) setError(result.error.message); else { setMessage("Payment confirmed and the appointment is financially cleared."); setPaymentId(null); await load(); }
    setSaving(false);
  };
  const voidLine = async (lineId: string) => {
    const reason = window.prompt("Reason for voiding this charge (required):");
    if (!reason) return;
    setSaving(true); setError(null);
    const result = await voidBillingLineItem(client, lineId, reason);
    if (result.error) setError(result.error.message); else { setMessage("Charge voided. Any tagged physical inventory was restored exactly once."); await load(); }
    setSaving(false);
  };

  if (!authLoading && !email) return <AdminSignIn />;
  const invoice = detail?.invoice;
  return <>
    <PageHeader eyebrow="Invoice operations" title={invoice?.invoice_number ?? "Invoice detail"} description="Review the source ledger, payment state, and immutable settlement history." actions={<div className="billing-header-actions"><Link className="billing-back-link" href="/billing"><ArrowLeft size={16} />All invoices</Link><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Refresh</Button></div>} />
    {error ? <section className="data-error" role="alert"><strong>Invoice action failed.</strong><p>{error}</p></section> : null}
    {message ? <div className="billing-notice billing-notice--success" role="status"><CheckCircle2 size={18} />{message}</div> : null}
    {loading ? <section className="data-loading">Loading invoice…</section> : invoice ? <>
      <section className="billing-invoice-summary">
        <div><span>Patient</span><strong>{invoice.patient_name}</strong></div>
        <div><span>Billing mode</span><strong className={`billing-mode billing-mode--${invoice.billing_mode}`}>{invoice.billing_mode.toUpperCase()}</strong><small>{invoice.billing_mode_source?.replaceAll("_", " ")}</small></div>
        <div><span>Total charge</span><strong>{money.format(Number(invoice.subtotal))}</strong></div>
        <div><span>Patient balance</span><strong>{money.format(Number(invoice.balance_due))}</strong></div>
        <div><span>Status</span><strong className={`billing-status billing-status--${invoice.status}`}>{invoice.status.replaceAll("_", " ")}</strong></div>
      </section>
      {invoice.billing_mode === "nbb" ? <div className="billing-notice"><ShieldCheck size={18} /><span><strong>No Balance Billing:</strong> charges remain auditable but are written off from the patient balance.</span></div> : null}
      <div className="billing-detail-grid">
        <section className="billing-table-card">
          <div className="billing-table-card__header"><div><h2>Charge ledger</h2><p>Source-linked charges and their settlement state.</p></div></div>
          <div className="billing-table-scroll"><table><thead><tr><th>Description</th><th>Source</th><th>Qty</th><th className="numeric">Unit price</th><th className="numeric">Total</th><th>Status</th><th></th></tr></thead><tbody>
            {detail.line_items.map((line) => <tr key={line.id} className={line.payment_status === "voided" ? "billing-line--voided" : undefined}><td><strong>{line.description}</strong>{line.void_reason ? <small>{line.void_reason}</small> : null}</td><td>{line.source_type.replaceAll("_", " ")}</td><td>{line.quantity}</td><td className="numeric">{money.format(Number(line.unit_price))}</td><td className="numeric">{money.format(Number(line.line_total))}</td><td><span className={`billing-status billing-status--${line.payment_status}`}>{line.payment_status.replaceAll("_", " ")}</span></td><td>{canManage && line.payment_status === "unpaid" ? <button className="billing-icon-action" onClick={() => void voidLine(line.id)} disabled={saving} title="Void charge"><Ban size={15} /><span className="sr-only">Void {line.description}</span></button> : null}</td></tr>)}
          </tbody></table></div>
        </section>
        <aside className="billing-payment-card">
          <CreditCard aria-hidden="true" />
          <h2>Full payment</h2>
          {invoice.status === "paid" ? <p className="billing-payment-complete"><CheckCircle2 size={18} />Settled {invoice.paid_at ? dateTime.format(new Date(invoice.paid_at)) : ""}</p> : invoice.billing_mode === "nbb" ? <p>No patient payment is collected for this NBB invoice.</p> : canManage ? <>
            <p>Amount due: <strong>{money.format(Number(invoice.balance_due))}</strong>. Partial payments are not accepted.</p>
            <form onSubmit={(event) => void createAttempt(event)}>
              <label>Method<Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} disabled={Boolean(paymentId)}><option value="cash">Cash</option><option value="card">Card</option><option value="qr_ewallet">QR / e-wallet</option><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></Select></label>
              <label>Reference<Input value={reference} onChange={(event) => setReference(event.target.value)} disabled={Boolean(paymentId)} /></label>
              {!paymentId ? <Button type="submit" disabled={saving}>Create payment attempt</Button> : <Button type="button" onClick={() => void confirm()} disabled={saving}>Confirm full payment received</Button>}
            </form>
          </> : <p>View-only access. A billing manager must confirm payment.</p>}
          <h3>Payment history</h3>
          <ul className="billing-payment-history">{detail.payments.map((payment) => <li key={payment.id}><span>{payment.method.replaceAll("_", " ")} · {payment.status}</span><strong>{money.format(Number(payment.amount))}</strong><small>{dateTime.format(new Date(payment.created_at))}</small></li>)}{!detail.payments.length ? <li>No payment attempts.</li> : null}</ul>
        </aside>
      </div>
    </> : null}
  </>;
}
