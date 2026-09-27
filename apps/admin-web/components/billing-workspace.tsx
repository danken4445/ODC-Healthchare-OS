"use client";

import { getBillingWorkspace } from "@odyssey/supabase-client";
import type { InvoiceSummary } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import { QrCode, RefreshCw, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { PageHeader } from "./page-header";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export function BillingWorkspaceScreen() {
  const { client, email, loading: authLoading, organization, permissions } = useAdminData();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = permissions.includes("can_manage_billing");

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    const result = await getBillingWorkspace(client, organization.id);
    if (result.error) setError(result.error.message);
    else setInvoices(result.data.invoices);
    setLoading(false);
  }, [client, organization]);

  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => ({
    gross: invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0),
    outstanding: invoices.reduce((sum, invoice) => sum + Number(invoice.balance_due), 0),
    nbb: invoices.filter((invoice) => invoice.billing_mode === "nbb").reduce((sum, invoice) => sum + Number(invoice.subtotal), 0),
  }), [invoices]);

  if (!authLoading && !email) return <AdminSignIn />;
  return (
    <>
      <PageHeader
        eyebrow="Revenue operations"
        title="Billing management"
        description="Resolve visit charges, confirm full payments, and audit NBB write-offs without mixing patient, inventory, and payment ledgers."
        actions={<div className="billing-header-actions">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" size={16} />Refresh</Button>
          <Link className="billing-primary-link" href="/billing/scan"><QrCode aria-hidden="true" size={16} />Scan visit QR</Link>
        </div>}
      />
      <section className="billing-kpis" aria-label="Billing summary">
        <article><ReceiptText aria-hidden="true" /><span>Gross charges</span><strong>{money.format(totals.gross)}</strong><small>{invoices.length} invoices</small></article>
        <article><WalletCards aria-hidden="true" /><span>Outstanding</span><strong>{money.format(totals.outstanding)}</strong><small>Full payment required</small></article>
        <article><ShieldCheck aria-hidden="true" /><span>NBB protected</span><strong>{money.format(totals.nbb)}</strong><small>Written off from patient balance</small></article>
      </section>
      {!canManage ? <div className="billing-notice" role="status"><ShieldCheck aria-hidden="true" size={18} />You have view-only billing access. Payment and void actions are hidden.</div> : null}
      {error ? <section className="data-error" role="alert"><strong>Billing data could not be loaded.</strong><p>{error}</p></section> : null}
      {loading ? <section className="data-loading" aria-live="polite">Loading billing records…</section> : (
        <section className="billing-table-card">
          <div className="billing-table-card__header"><div><h2>Invoices</h2><p>STANDARD balances require exact payment; NBB charges remain visible with a zero patient balance.</p></div></div>
          <div className="billing-table-scroll">
            <table>
              <thead><tr><th>Invoice</th><th>Patient</th><th>Mode</th><th>Issued</th><th className="numeric">Charge</th><th className="numeric">Balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {invoices.map((invoice) => <tr key={invoice.id}>
                  <td><strong>{invoice.invoice_number}</strong></td><td>{invoice.patient_name}</td>
                  <td><span className={`billing-mode billing-mode--${invoice.billing_mode}`}>{invoice.billing_mode.toUpperCase()}</span></td>
                  <td>{invoice.issued_at ? dateTime.format(new Date(invoice.issued_at)) : "—"}</td>
                  <td className="numeric">{money.format(Number(invoice.subtotal))}</td><td className="numeric">{money.format(Number(invoice.balance_due))}</td>
                  <td><span className={`billing-status billing-status--${invoice.status}`}>{label(invoice.status)}</span></td>
                  <td><Link className="billing-row-link" href={`/billing/invoices/${invoice.id}`}>Open</Link></td>
                </tr>)}
                {!invoices.length ? <tr><td colSpan={8} className="billing-empty">No invoices have been issued for this clinic.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
