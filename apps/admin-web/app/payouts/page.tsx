"use client";

import {
  createBrowserSupabaseClient,
  getAccessibleOrganizations,
  getDoctorPayouts,
  getPortalAccess,
  hasOrganizationPermission,
  setPractitionerPayoutRate,
  settleDoctorPayouts,
  signOut,
} from "@odyssey/supabase-client";
import type { DoctorPayoutSummary, PublicClinicSummary } from "@odyssey/types";
import { Badge, Button, CurrencyDisplay, DataTable, Field, Input } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

export default function AdminPayoutsPage() {
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<DoctorPayoutSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [status, setStatus] = useState("Loading payout workspace…");
  const [busy, setBusy] = useState(false);
  const pendingTotal = useMemo(() => payouts.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.payout_amount, 0), [payouts]);

  async function loadPayouts(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const [result, permission] = await Promise.all([
      getDoctorPayouts(client, clinicId),
      hasOrganizationPermission(client, clinicId, "can_manage_payouts"),
    ]);
    setCanManage(Boolean(permission.data));
    if (result.error) return setStatus(`Unable to load payouts: ${result.error.message}`);
    setPayouts(result.data);
    setSelected([]);
    setStatus("Only completed encounters with finalized service billing appear here.");
  }

  useEffect(() => {
    async function load() {
      const client = createBrowserSupabaseClient();
      const access = await getPortalAccess(client, "admin");
      if (access.error || !access.data.allowed) {
        await signOut(client);
        setStatus("Sign in through the administrative workspace to view payouts.");
        return;
      }
      const result = await getAccessibleOrganizations(client, access.data.organizationIds);
      if (result.error || !result.data[0]) return setStatus("No assigned clinic is available.");
      setClinics(result.data);
      setOrganizationId(result.data[0].id);
      await loadPayouts(result.data[0].id);
    }
    void load();
  }, []);

  async function settle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const reference = String(new FormData(event.currentTarget).get("reference") ?? "");
    setBusy(true);
    const result = await settleDoctorPayouts(createBrowserSupabaseClient(), organizationId, selected, reference);
    setStatus(result.error ? `Unable to settle payouts: ${result.error.message}` : `${result.data} payout${result.data === 1 ? "" : "s"} marked paid.`);
    if (!result.error) {
      event.currentTarget.reset();
      await loadPayouts(organizationId);
    }
    setBusy(false);
  }

  async function saveRate(item: DoctorPayoutSummary, value: string) {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    setBusy(true);
    const result = await setPractitionerPayoutRate(createBrowserSupabaseClient(), item.practitioner_role_id, Math.round(percent * 100));
    setStatus(result.error ? `Unable to update rate: ${result.error.message}` : `Future payouts for ${item.practitioner_name} will use ${percent.toFixed(2)}%. Existing snapshots are unchanged.`);
    setBusy(false);
  }

  return (
    <main>
      <p className="eyebrow">Odyssey Admin · Remote care</p>
      <h1>Doctor payouts</h1>
      <p><Link href="/">← Administration</Link></p>
      {clinics.length > 1 && <Field label="Clinic"><select className="odyssey-input" value={organizationId ?? ""} onChange={(event) => { setOrganizationId(event.target.value); void loadPayouts(event.target.value); }}>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></Field>}
      <p role="status">{status}</p>
      <section><span className="hint">Pending total</span><h2><CurrencyDisplay amount={pendingTotal} /></h2></section>
      {canManage && (
        <form className="inline-form" onSubmit={settle}>
          <Field label="Bank/payment reference"><Input name="reference" required minLength={3} /></Field>
          <Button type="submit" disabled={busy || selected.length === 0}>Settle selected ({selected.length})</Button>
        </form>
      )}
      <DataTable
        caption="Payouts derived from this clinic's finalized billing records."
        data={payouts}
        emptyMessage="No payout records yet."
        getRowId={(item) => item.id}
        columns={[
          { id: "select", header: "Select", cell: (item) => item.status === "pending" && canManage ? <input aria-label={`Select payout for ${item.practitioner_name}`} type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /> : null },
          { id: "doctor", header: "Doctor", cell: (item) => item.practitioner_name },
          { id: "visit", header: "Visit", cell: (item) => `${item.service_type ?? "Consultation"} · ${item.delivery_mode === "virtual" ? "Virtual" : "Clinic"}` },
          { id: "gross", header: "Service fees", cell: (item) => <CurrencyDisplay amount={item.gross_service_amount} currency={item.currency} /> },
          { id: "rate", header: "Share", cell: (item) => canManage ? <Input aria-label={`Payout share for ${item.practitioner_name}`} defaultValue={(item.share_basis_points / 100).toFixed(2)} min="0" max="100" step="0.01" type="number" onBlur={(event) => void saveRate(item, event.target.value)} /> : `${(item.share_basis_points / 100).toFixed(2)}%` },
          { id: "amount", header: "Payout", cell: (item) => <CurrencyDisplay amount={item.payout_amount} currency={item.currency} /> },
          { id: "status", header: "Status", cell: (item) => <Badge variant={item.status === "paid" ? "success" : item.status === "void" ? "muted" : "warning"}>{item.status}</Badge> },
          { id: "reference", header: "Reference", cell: (item) => item.payment_reference ?? "—" },
        ]}
      />
    </main>
  );
}
