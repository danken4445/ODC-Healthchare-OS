"use client";

import {
  createBrowserSupabaseClient,
  generateBillingEvent,
  finalizeBillingEvent,
  getBillingWorkspace,
  getBillableEncounters,
  getBillingLineItems,
  recordPayment,
  getPortalAccess,
  signInWithPassword,
  signOut,
  hasOrganizationPermission,
  getAccessibleOrganizations,
} from "@odyssey/supabase-client";
import type {
  BillingWorkspace,
  BillingEventSummary,
  BillingLineItemSummary,
  BillableEncounter,
  InvoiceSummary,
  PaymentSummary,
  PayorType,
  PaymentMethod,
  PublicClinicSummary,
} from "@odyssey/types";
import {
  Button,
  DataTable,
  Field,
  Input,
  Badge,
  InvoiceStatusBadge,
  PayorTypeBadge,
  CurrencyDisplay,
  TabGroup,
  TabPanel,
} from "@odyssey/ui";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BillingPage() {
  const [email, setEmail] = useState("front-desk@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [accessibleClinics, setAccessibleClinics] = useState<PublicClinicSummary[]>([]);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [status, setStatus] = useState("Sign in to access billing.");
  const [submitting, setSubmitting] = useState(false);

  // Billing workspace data
  const [workspace, setWorkspace] = useState<BillingWorkspace | null>(null);
  const [billableEncounters, setBillableEncounters] = useState<BillableEncounter[]>([]);
  const [selectedLineItems, setSelectedLineItems] = useState<BillingLineItemSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState("encounters");

  // Payment form
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentRef, setPaymentRef] = useState("");

  // Payor override
  const [payorOverride, setPayorOverride] = useState<PayorType | "">("");

  async function checkSession() {
    const client = createBrowserSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (session?.user?.email) {
      setSignedInAs(session.user.email);
      const access = await getPortalAccess(client, "admin");
      if (access.data?.allowed) {
        const clinics = await getAccessibleOrganizations(client, access.data.organizationIds);
        if (clinics.data) {
          setAccessibleClinics(clinics.data);
          if (clinics.data.length > 0 && !organizationId) {
            setOrganizationId(clinics.data[0].id);
          }
        }
      }
    }
  }

  async function loadBillingData() {
    if (!organizationId) return;
    const client = createBrowserSupabaseClient();
    const canBill = await hasOrganizationPermission(client, organizationId, "can_manage_billing");
    setCanManageBilling(!!canBill.data);

    const ws = await getBillingWorkspace(client, organizationId);
    if (ws.data) setWorkspace(ws.data);
    else setStatus(`Error: ${ws.error?.message}`);

    const enc = await getBillableEncounters(client, organizationId);
    if (enc.data) setBillableEncounters(enc.data);
  }

  useEffect(() => { void checkSession(); }, []);
  useEffect(() => { if (organizationId) void loadBillingData(); }, [organizationId]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await signInWithPassword(client, email, password);
    if (result.error) {
      setStatus(`Sign-in failed: ${result.error.message}`);
    } else {
      await checkSession();
      setStatus("Signed in. Loading billing data…");
    }
    setSubmitting(false);
  }

  async function handleSignOut() {
    const client = createBrowserSupabaseClient();
    await signOut(client);
    setSignedInAs(null);
    setOrganizationId(null);
    setWorkspace(null);
    setStatus("Signed out.");
  }

  async function handleGenerateBilling(encounterId: string) {
    if (!organizationId) return;
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const override = payorOverride || undefined;
    const result = await generateBillingEvent(client, organizationId, encounterId, override as PayorType | undefined);
    if (result.error) {
      setStatus(`Error: ${result.error.message}`);
    } else {
      setStatus(`Billing event created: ${result.data}`);
      await loadBillingData();
    }
    setSubmitting(false);
  }

  async function handleFinalize(eventId: string) {
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await finalizeBillingEvent(client, eventId);
    if (result.error) {
      setStatus(`Error: ${result.error.message}`);
    } else {
      setStatus(`Finalized → Route: ${result.data?.route}. Invoice: ${result.data?.invoice_id ?? "N/A"}, Claim: ${result.data?.claim_id ?? "N/A"}`);
      await loadBillingData();
    }
    setSubmitting(false);
  }

  async function handleViewLineItems(eventId: string) {
    const client = createBrowserSupabaseClient();
    const result = await getBillingLineItems(client, eventId);
    if (result.data) {
      setSelectedLineItems(result.data);
      setSelectedEventId(eventId);
    }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentInvoiceId || !paymentAmount) return;
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await recordPayment(
      client,
      paymentInvoiceId,
      Number(paymentAmount),
      paymentMethod,
      paymentRef || undefined,
    );
    if (result.error) {
      setStatus(`Payment error: ${result.error.message}`);
    } else {
      setStatus(`Payment recorded: ${result.data}`);
      setPaymentInvoiceId("");
      setPaymentAmount("");
      setPaymentRef("");
      await loadBillingData();
    }
    setSubmitting(false);
  }

  if (!signedInAs) {
    return (
      <main>
        <p className="eyebrow">Odyssey Admin — Billing</p>
        <h1>Sign In</h1>
        <form onSubmit={handleSignIn}>
          <Field label="Email">
            <Input id="billing-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input id="billing-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>Sign In</Button>
        </form>
        <p>{status}</p>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">Odyssey Admin — Billing Dashboard</p>
      <h1>💰 Billing & Invoicing</h1>
      <p>Signed in as <strong>{signedInAs}</strong> <Button size="sm" variant="ghost" onClick={handleSignOut}>Sign out</Button></p>

      {accessibleClinics.length > 1 && (
        <Field label="Select Clinic">
          <select
            id="billing-clinic-select"
            value={organizationId ?? ""}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            {accessibleClinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href="/billing/claims"><Button variant="outline">📋 Claims Management</Button></Link>
        <Link href="/pos"><Button variant="outline">🛒 Point of Sale</Button></Link>
        <Link href="/"><Button variant="ghost">← Dashboard</Button></Link>
      </nav>

      <p>{status}</p>

      <TabGroup
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: "encounters", label: "Billable Encounters", icon: "📝" },
          { id: "events", label: "Billing Events", icon: "📄" },
          { id: "invoices", label: "Invoices", icon: "💳" },
          { id: "payments", label: "Payments", icon: "💵" },
        ]}
      >
        <TabPanel id="encounters" active={activeTab === "encounters"}>
          <h2>Billable Encounters</h2>
          {canManageBilling && (
            <Field label="Override Payor Type (optional)">
              <select
                id="payor-override"
                value={payorOverride}
                onChange={(e) => setPayorOverride(e.target.value as PayorType | "")}
              >
                <option value="">Use org default</option>
                <option value="self_pay">Self-Pay</option>
                <option value="hmo">HMO</option>
                <option value="philhealth_nbb">PhilHealth NBB</option>
                <option value="government_subsidized">Government Subsidized</option>
              </select>
            </Field>
          )}
          <DataTable<BillableEncounter>
            caption="Encounters ready for billing"
            data={billableEncounters}
            getRowId={(row) => row.id}
            columns={[
              { id: "patient", header: "Patient", cell: (r) => r.patient_name },
              { id: "service", header: "Service", cell: (r) => r.service_name ?? "—" },
              { id: "price", header: "Price", cell: (r) => <CurrencyDisplay amount={r.service_price} /> },
              { id: "start", header: "Started", cell: (r) => formatTime(r.period_start) },
              { id: "status", header: "Status", cell: (r) => <Badge>{r.status}</Badge> },
              {
                id: "actions",
                header: "Actions",
                cell: (r) => (
                  <Button
                    size="sm"
                    disabled={submitting}
                    onClick={() => handleGenerateBilling(r.id)}
                  >
                    Generate Billing
                  </Button>
                ),
              },
            ]}
            emptyMessage="No unbilled encounters found."
          />
        </TabPanel>

        <TabPanel id="events" active={activeTab === "events"}>
          <h2>Billing Events</h2>
          <DataTable<BillingEventSummary>
            caption="All billing events"
            data={workspace?.billing_events ?? []}
            getRowId={(row) => row.id}
            columns={[
              { id: "patient", header: "Patient", cell: (r) => r.patient_name },
              { id: "payor", header: "Payor", cell: (r) => <PayorTypeBadge payorType={r.payor_type} /> },
              { id: "items", header: "Items", cell: (r) => r.line_item_count },
              { id: "total", header: "Total", cell: (r) => <CurrencyDisplay amount={r.total} /> },
              { id: "status", header: "Status", cell: (r) => <Badge variant={r.status === "finalized" ? "success" : r.status === "cancelled" ? "danger" : "muted"}>{r.status}</Badge> },
              { id: "date", header: "Created", cell: (r) => formatTime(r.created_at) },
              {
                id: "actions",
                header: "Actions",
                cell: (r) => (
                  <span style={{ display: "flex", gap: "0.5rem" }}>
                    <Button size="sm" variant="outline" onClick={() => handleViewLineItems(r.id)}>
                      View Items
                    </Button>
                    {r.status === "draft" && canManageBilling && (
                      <Button size="sm" disabled={submitting} onClick={() => handleFinalize(r.id)}>
                        Finalize
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
            emptyMessage="No billing events yet."
          />

          {selectedEventId && selectedLineItems.length > 0 && (
            <>
              <h3>Line Items for {selectedEventId.slice(0, 8)}…</h3>
              <DataTable<BillingLineItemSummary>
                caption="Billing line items"
                data={selectedLineItems}
                getRowId={(row) => row.id}
                columns={[
                  { id: "desc", header: "Description", cell: (r) => r.description },
                  { id: "type", header: "Source", cell: (r) => <Badge variant="muted">{r.source_type.replace("_", " ")}</Badge> },
                  { id: "qty", header: "Qty", cell: (r) => r.quantity },
                  { id: "unit", header: "Unit Price", cell: (r) => <CurrencyDisplay amount={r.unit_price} /> },
                  { id: "total", header: "Total", cell: (r) => <CurrencyDisplay amount={r.line_total} /> },
                ]}
              />
            </>
          )}
        </TabPanel>

        <TabPanel id="invoices" active={activeTab === "invoices"}>
          <h2>Invoices</h2>
          <DataTable<InvoiceSummary>
            caption="All invoices"
            data={workspace?.invoices ?? []}
            getRowId={(row) => row.id}
            columns={[
              { id: "number", header: "Invoice #", cell: (r) => r.invoice_number },
              { id: "patient", header: "Patient", cell: (r) => r.patient_name },
              { id: "status", header: "Status", cell: (r) => <InvoiceStatusBadge status={r.status} /> },
              { id: "total", header: "Total Due", cell: (r) => <CurrencyDisplay amount={r.total_due} /> },
              { id: "paid", header: "Paid", cell: (r) => <CurrencyDisplay amount={r.amount_paid} /> },
              { id: "balance", header: "Balance", cell: (r) => <CurrencyDisplay amount={r.balance_due} /> },
              { id: "issued", header: "Issued", cell: (r) => formatTime(r.issued_at) },
              {
                id: "actions",
                header: "",
                cell: (r) =>
                  (r.status === "issued" || r.status === "partially_paid") && canManageBilling ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setPaymentInvoiceId(r.id);
                        setPaymentAmount(String(r.balance_due));
                        setActiveTab("payments");
                      }}
                    >
                      Record Payment
                    </Button>
                  ) : null,
              },
            ]}
            emptyMessage="No invoices yet."
          />
        </TabPanel>

        <TabPanel id="payments" active={activeTab === "payments"}>
          <h2>Record Payment</h2>
          {canManageBilling && (
            <form onSubmit={handleRecordPayment} style={{ display: "grid", gap: "1rem", maxWidth: "30rem" }}>
              <Field label="Invoice ID">
                <Input
                  id="payment-invoice-id"
                  value={paymentInvoiceId}
                  onChange={(e) => setPaymentInvoiceId(e.target.value)}
                  placeholder="Invoice UUID"
                  required
                />
              </Field>
              <Field label="Amount (₱)">
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </Field>
              <Field label="Method">
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="qr_ewallet">QR / E-Wallet</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                </select>
              </Field>
              <Field label="Reference # (optional)">
                <Input
                  id="payment-ref"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={submitting}>Record Payment</Button>
            </form>
          )}

          <h3>Recent Payments</h3>
          <DataTable<PaymentSummary>
            caption="Recent payments"
            data={workspace?.recent_payments ?? []}
            getRowId={(row) => row.id}
            columns={[
              { id: "amount", header: "Amount", cell: (r) => <CurrencyDisplay amount={r.amount} /> },
              { id: "method", header: "Method", cell: (r) => <Badge variant="muted">{r.method.replace("_", " ")}</Badge> },
              { id: "status", header: "Status", cell: (r) => <Badge variant={r.status === "confirmed" ? "success" : "warning"}>{r.status}</Badge> },
              { id: "ref", header: "Reference", cell: (r) => r.reference_number ?? "—" },
              { id: "date", header: "Confirmed", cell: (r) => formatTime(r.confirmed_at) },
            ]}
            emptyMessage="No payments recorded."
          />
        </TabPanel>
      </TabGroup>
    </main>
  );
}
