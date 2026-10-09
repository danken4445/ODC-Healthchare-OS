"use client";

import {
  createBrowserSupabaseClient,
  createStandalonePharmacyInventoryOrder,
  getCurrentStaffOrganization,
  getInventoryWorkspace,
  getPharmacyPrescriptionAvailability,
  hasOrganizationPermission,
  listPharmacyPrescriptionQueue,
  subscribeToInventory,
  subscribeToPharmacyPrescriptionQueue,
} from "@odyssey/supabase-client";
import type {
  InventoryItemSummary,
  PharmacyPrescriptionAvailability,
  PharmacyPrescriptionLineInput,
  PharmacyPrescriptionOrderStatus,
  PharmacyPrescriptionOrderSummary,
} from "@odyssey/types";
import { Button, Card, Field, Input } from "@odyssey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

export function getPharmacyOrderStatusLabel(status: PharmacyPrescriptionOrderStatus): string {
  const labels: Record<PharmacyPrescriptionOrderStatus, string> = {
    draft: "Draft",
    submitted: "Awaiting pharmacist review",
    under_pharmacist_review: "Pharmacist reviewing",
    ready_to_dispense: "Ready to dispense",
    partially_dispensed: "Partially dispensed",
    completed: "Completed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };
  return labels[status];
}

export function pharmacyOrderStatusTone(status: PharmacyPrescriptionOrderStatus): "success" | "danger" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "ready_to_dispense" || status === "partially_dispensed") return "warning";
  return "neutral";
}

function statusClass(status: PharmacyPrescriptionOrderStatus): string {
  return `pharmacy-order-status pharmacy-order-status--${pharmacyOrderStatusTone(status)}`;
}

function selectedLine(form: HTMLFormElement, item: InventoryItemSummary | null): PharmacyPrescriptionLineInput | null {
  if (!item) return null;
  const data = new FormData(form);
  return {
    originalMedication: item.name,
    itemId: item.id,
    dosageInstruction: String(data.get("dosageInstruction") ?? "").trim() || undefined,
    quantity: Number(data.get("quantity")),
    unitOfMeasure: String(data.get("unitOfMeasure") ?? "").trim() || item.unit_of_measure || undefined,
    notes: String(data.get("notes") ?? "").trim() || undefined,
  };
}

function AvailabilityNotice({ availability }: { availability: PharmacyPrescriptionAvailability | null }) {
  if (!availability) return null;
  const available = availability.available_quantity >= availability.requested_quantity;
  return (
    <p className={`pharmacy-stock-check ${available ? "pharmacy-stock-check--available" : "pharmacy-stock-check--unavailable"}`} role="status">
      {available ? "Stock confirmed" : "Stock short"}: {availability.available_quantity} available of {availability.requested_quantity} requested.
    </p>
  );
}

export function PharmacyPrescriptionEncoder() {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [orders, setOrders] = useState<PharmacyPrescriptionOrderSummary[]>([]);
  const [medicineQuery, setMedicineQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [availability, setAvailability] = useState<PharmacyPrescriptionAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const refresh = useCallback(async (org: string) => {
    const [inventoryResult, orderResult] = await Promise.all([
      getInventoryWorkspace(client, org, false),
      listPharmacyPrescriptionQueue(client, org, "submitted"),
    ]);
    if (inventoryResult.error) setError(inventoryResult.error.message);
    else setItems(inventoryResult.data.items.filter((item) => item.active));
    if (orderResult.error) setError(orderResult.error.message);
    else setOrders(orderResult.data);
  }, [client]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const orgResult = await getCurrentStaffOrganization(client);
      if (!active) return;
      if (orgResult.error) {
        setError(orgResult.error.message);
        setLoading(false);
        return;
      }
      const permission = await hasOrganizationPermission(client, orgResult.data, "can_encode_pharmacy_prescriptions");
      if (permission.error || !permission.data) {
        setError(permission.error?.message ?? "Your account is not assigned the pharmacy prescription encoder role.");
        setLoading(false);
        return;
      }
      setOrganizationId(orgResult.data);
      await refresh(orgResult.data);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [client, refresh]);

  useEffect(() => {
    if (!organizationId) return;
    return subscribeToPharmacyPrescriptionQueue(client, organizationId, () => { void refresh(organizationId); });
  }, [client, organizationId, refresh]);

  useEffect(() => {
    if (!organizationId) return;
    return subscribeToInventory(client, organizationId, () => { void refresh(organizationId); });
  }, [client, organizationId, refresh]);

  useEffect(() => {
    if (!organizationId || !selectedItem || quantity <= 0) {
      setAvailability(null);
      return;
    }
    let active = true;
    void getPharmacyPrescriptionAvailability(client, organizationId, [{
      originalMedication: selectedItem.name,
      itemId: selectedItem.id,
      quantity,
      unitOfMeasure: selectedItem.unit_of_measure,
    }]).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setAvailability(result.data[0] ?? null);
    });
    return () => { active = false; };
  }, [client, organizationId, quantity, selectedItem]);

  function chooseMedicine(value: string) {
    setMedicineQuery(value);
    const match = items.find((item) => item.name.toLowerCase() === value.trim().toLowerCase() || item.sku.toLowerCase() === value.trim().toLowerCase());
    setSelectedItemId(match?.id ?? "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = event.currentTarget;
    const line = selectedLine(form, selectedItem);
    if (!line) {
      setError("Choose a medicine from the inventory list before sending the prescription.");
      return;
    }
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await createStandalonePharmacyInventoryOrder(client, {
      organizationId,
      patientReference: String(data.get("patientReference") ?? "").trim(),
      wardReference: String(data.get("wardReference") ?? "").trim() || null,
      prescriptionReference: String(data.get("prescriptionReference") ?? "").trim(),
      prescriberName: String(data.get("prescriberName") ?? "").trim(),
      priority: String(data.get("priority") ?? "routine") as "routine" | "urgent" | "emergency",
      items: [line],
    });
    if (result.error) setError(result.error.message);
    else {
      setMessage("Standalone prescription sent to the Pharmacy queue.");
      form.reset();
      setMedicineQuery("");
      setSelectedItemId("");
      setQuantity(1);
      setAvailability(null);
      await refresh(organizationId);
    }
    setBusy(false);
  }

  if (loading) return <section className="pharmacy-workspace"><p>Loading Pharmacy inventory…</p></section>;
  if (error && !organizationId) return <section className="pharmacy-workspace"><p className="error-text">{error}</p></section>;

  return (
    <section className="pharmacy-workspace" aria-labelledby="pharmacy-encoder-heading">
      <div className="pharmacy-workspace__heading">
        <div><p className="eyebrow">Nursing attendant / IW</p><h1 id="pharmacy-encoder-heading">Prescription encoder</h1><p>Enter a free-text patient reference, then select an inventory medicine with live Pharmacy stock.</p></div>
        <span className="pharmacy-workspace__role">Encoder role</span>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}
      <Card>
        <form className="pharmacy-form" onSubmit={submit}>
          <div className="pharmacy-form__grid">
            <Field label="Patient / encounter reference"><Input name="patientReference" required placeholder="Patient name, case no., or encounter reference" /></Field>
            <Field label="Ward / bed reference"><Input name="wardReference" placeholder="e.g. Ward B · Bed 12" /></Field>
          </div>
          <div className="pharmacy-form__grid"><Field label="Physical prescription reference"><Input name="prescriptionReference" required placeholder="Ward slip / Rx no." /></Field><Field label="Prescriber"><Input name="prescriberName" required placeholder="Prescriber name" /></Field></div>
          <Field label="Priority"><select className="odyssey-input" name="priority" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></Field>
          <div className="pharmacy-line-editor">
            <h2>Medicine</h2>
            <div className="pharmacy-form__grid">
              <Field label="Search inventory medicine"><Input list="provider-pharmacy-inventory-items" value={medicineQuery} onChange={(event) => chooseMedicine(event.target.value)} required placeholder="Type a medicine name or SKU" /><datalist id="provider-pharmacy-inventory-items">{items.map((item) => <option key={item.id} value={item.name}>{item.sku} · {item.unit_of_measure}</option>)}</datalist></Field>
              <Field label="Quantity"><Input name="quantity" required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
              <Field label="Unit"><Input name="unitOfMeasure" defaultValue={selectedItem?.unit_of_measure ?? ""} key={selectedItem?.id ?? "none"} placeholder="tablet, vial…" /></Field>
            </div>
            <Field label="Dose / directions"><Input name="dosageInstruction" placeholder="e.g. 500 mg every 8 hours" /></Field>
            <Field label="Notes"><Input name="notes" placeholder="Optional transcription note" /></Field>
            <AvailabilityNotice availability={availability} />
            <label className="pharmacy-attestation"><input type="checkbox" name="attestation" required /> I confirm this entry matches the signed physical prescription.</label>
            <div className="pharmacy-form__actions"><Button type="submit" disabled={busy || !selectedItem}>{busy ? "Sending…" : "Send to Pharmacy"}</Button></div>
          </div>
        </form>
      </Card>
      <div className="pharmacy-encoder-list"><h2>My submitted requests</h2>{orders.length === 0 ? <p className="hint">No prescriptions are waiting for review.</p> : orders.map((order) => <article className="pharmacy-order-card" key={order.id}><div><strong>{order.lines[0]?.original_medication ?? "Prescription"}</strong><span>{order.patient_reference ?? order.patient_id ?? "Standalone order"}{order.ward_reference ? ` · ${order.ward_reference}` : ""} · {new Date(order.submitted_at).toLocaleString()}</span></div><span className={statusClass(order.status)}>{getPharmacyOrderStatusLabel(order.status)}</span></article>)}</div>
    </section>
  );
}
