"use client";

import {
  createStandalonePharmacyInventoryOrder,
  getInventoryWorkspace,
  getPharmacyPrescriptionAvailability,
  subscribeToInventory,
} from "@odyssey/supabase-client";
import type { InventoryItemSummary, PharmacyPrescriptionAvailability, PharmacyPrescriptionLineInput } from "@odyssey/types";
import { Button, Card, Field, Input } from "@odyssey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";

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
  const { client, organization, permissions } = useAdminData();
  const organizationId = organization?.id ?? null;
  const canEncode = permissions.includes("can_encode_pharmacy_prescriptions");
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
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

  const refreshInventory = useCallback(async () => {
    if (!organizationId || !canEncode) {
      setLoading(false);
      return;
    }
    const result = await getInventoryWorkspace(client, organizationId, false);
    if (result.error) setError(result.error.message);
    else setItems(result.data.items.filter((item) => item.active));
    setLoading(false);
  }, [canEncode, client, organizationId]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  useEffect(() => {
    if (!organizationId || !canEncode) return;
    return subscribeToInventory(client, organizationId, () => { void refreshInventory(); });
  }, [canEncode, client, organizationId, refreshInventory]);

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
    }
    setBusy(false);
  }

  if (!canEncode) return null;
  if (loading) return <section className="pharmacy-workspace"><p>Loading Pharmacy inventory…</p></section>;

  return (
    <section className="pharmacy-workspace" aria-labelledby="admin-pharmacy-encoder-heading">
      <div className="pharmacy-workspace__heading">
        <div>
          <p className="eyebrow">Admin Pharmacy Workspace</p>
          <h1 id="admin-pharmacy-encoder-heading">Prescription encoder</h1>
          <p>Record a physical prescription without opening a patient account. Medicine selection and stock are linked to Pharmacy inventory.</p>
        </div>
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
          <div className="pharmacy-form__grid">
            <Field label="Physical prescription reference (optional)"><Input name="prescriptionReference" placeholder="Ward slip / Rx no. (optional)" /></Field>
            <Field label="Prescriber"><Input name="prescriberName" required placeholder="Prescriber name" /></Field>
          </div>
          <Field label="Priority"><select className="odyssey-input" name="priority" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></Field>
          <div className="pharmacy-line-editor">
            <h2>Medicine</h2>
            <div className="pharmacy-form__grid">
              <Field label="Search inventory medicine">
                <Input list="admin-pharmacy-inventory-items" value={medicineQuery} onChange={(event) => chooseMedicine(event.target.value)} required placeholder="Type a medicine name or SKU" />
                <datalist id="admin-pharmacy-inventory-items">{items.map((item) => <option key={item.id} value={item.name}>{item.sku} · {item.unit_of_measure}</option>)}</datalist>
              </Field>
              <Field label="Quantity"><Input name="quantity" required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
              <Field label="Unit"><Input name="unitOfMeasure" defaultValue={selectedItem?.unit_of_measure ?? ""} key={selectedItem?.id ?? "none"} placeholder="tablet, vial…" /></Field>
            </div>
            <Field label="Dose / directions"><Input name="dosageInstruction" placeholder="e.g. 500 mg every 8 hours" /></Field>
            <Field label="Notes"><Input name="notes" placeholder="Optional transcription note" /></Field>
            <AvailabilityNotice availability={availability} />
            <label className="pharmacy-attestation"><input type="checkbox" name="attestation" required /> I confirm this entry matches the signed physical prescription.</label>
            <div className="pharmacy-form__actions">
              <Button type="submit" disabled={busy || !selectedItem}>{busy ? "Sending…" : "Send to Pharmacy"}</Button>
            </div>
          </div>
        </form>
      </Card>
    </section>
  );
}
