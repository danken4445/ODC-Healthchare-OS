"use client";

import { getDoctorPayouts, setPractitionerPayoutRate, settleDoctorPayouts } from "@odyssey/supabase-client";
import type { DoctorPayoutSummary } from "@odyssey/types";
import { Badge, Button, CurrencyDisplay, DataTable, Field, Input } from "@odyssey/ui";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminSignIn } from "../../components/admin-sign-in";
import { useAdminData } from "../../components/admin-data-context";

export default function AdminPayoutsPage() {
  const { client, email, error: accessError, organization, permissions } = useAdminData();
  const [payouts, setPayouts] = useState<DoctorPayoutSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading payout workspace…");
  const [busy, setBusy] = useState(false);
  const canManage = permissions.includes("can_manage_payouts");
  const pendingTotal = useMemo(() => payouts.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.payout_amount, 0), [payouts]);

  const loadPayouts = useCallback(async (clinicId: string) => {
    const result = await getDoctorPayouts(client, clinicId);
    if (result.error) return setStatus(`Unable to load payouts: ${result.error.message}`);
    setPayouts(result.data);
    setSelected([]);
    setStatus("Only completed encounters with finalized service billing appear here.");
  }, [client]);

  useEffect(() => {
    if (!organization) return;
    void loadPayouts(organization.id);
  }, [loadPayouts, organization]);

  async function settle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const reference = String(new FormData(event.currentTarget).get("reference") ?? "");
    setBusy(true);
    const result = await settleDoctorPayouts(client, organization.id, selected, reference);
    setStatus(result.error ? `Unable to settle payouts: ${result.error.message}` : `${result.data} payout${result.data === 1 ? "" : "s"} marked paid.`);
    if (!result.error) {
      event.currentTarget.reset();
      await loadPayouts(organization.id);
    }
    setBusy(false);
  }

  async function saveRate(item: DoctorPayoutSummary, value: string) {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    setBusy(true);
    const result = await setPractitionerPayoutRate(client, item.practitioner_role_id, Math.round(percent * 100));
    setStatus(result.error ? `Unable to update rate: ${result.error.message}` : `Future payouts for ${item.practitioner_name} will use ${percent.toFixed(2)}%. Existing snapshots are unchanged.`);
    setBusy(false);
  }

  if (!email && accessError) return <AdminSignIn />;

  return (
    <main>
      <p className="eyebrow">Odyssey Admin · Remote care</p>
      <h1>Doctor payouts</h1>
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
