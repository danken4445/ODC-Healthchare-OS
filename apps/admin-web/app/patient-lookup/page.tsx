"use client";

import {
  createBrowserSupabaseClient,
  getAccessibleOrganizations,
  getCurrentUserEmail,
  getPortalAccess,
  hasOrganizationPermission,
  identifyPatientByQr,
} from "@odyssey/supabase-client";
import type { IdentifiedPatient, PublicClinicSummary } from "@odyssey/types";
import { Button, Field } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

export default function PatientLookupPage() {
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [patient, setPatient] = useState<IdentifiedPatient | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Checking front-desk access.");
  const scannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function open() {
      const client = createBrowserSupabaseClient();
      const [userResult, accessResult] = await Promise.all([
        getCurrentUserEmail(client),
        getPortalAccess(client, "admin"),
      ]);
      if (userResult.error || !userResult.data || accessResult.error || !accessResult.data.allowed || accessResult.data.isSuperadmin) {
        setAuthorized(false);
        setStatus("An authorized clinic operations account is required.");
        return;
      }
      const clinicResult = await getAccessibleOrganizations(client, accessResult.data.organizationIds);
      if (clinicResult.error || !clinicResult.data.length) {
        setAuthorized(false);
        setStatus("No assigned clinic is available.");
        return;
      }
      const clinicId = clinicResult.data[0].id;
      const permission = await hasOrganizationPermission(client, clinicId, "can_identify_patients");
      if (permission.error || !permission.data) {
        setAuthorized(false);
        setStatus("Your role cannot identify patients by QR.");
        return;
      }
      setClinics(clinicResult.data);
      setOrganizationId(clinicId);
      setAuthorized(true);
      setStatus("Ready for a clinic patient QR.");
      window.setTimeout(() => scannerInput.current?.focus(), 0);
    }
    void open();
  }, []);

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = String(new FormData(form).get("qrPayload") ?? "");
    setPatient(null);
    const result = await identifyPatientByQr(createBrowserSupabaseClient(), organizationId, payload);
    if (result.error) {
      setStatus(`Identification failed: ${result.error.message}`);
      scannerInput.current?.select();
      return;
    }
    setPatient(result.data);
    setStatus("Patient identity confirmed. This lookup was added to the audit trail.");
    form.reset();
    scannerInput.current?.focus();
  }

  if (authorized !== true) {
    return (
      <main className="patient-lookup-shell">
        <p className="eyebrow">Front desk</p>
        <h1>{authorized === null ? "Opening patient identification…" : "Access unavailable"}</h1>
        <p>{status}</p>
        <Link href="/">Return to clinic operations</Link>
      </main>
    );
  }

  return (
    <main className="patient-lookup-shell">
      <header className="governance-header">
        <div>
          <p className="eyebrow">Front desk</p>
          <h1>Identify patient</h1>
          <p className="hint">Use a connected QR reader. The scanner enters the code here without opening the patient chart.</p>
        </div>
        <Link href="/">Clinic schedule</Link>
      </header>
      {clinics.length > 1 && (
        <Field label="Clinic workspace">
          <select className="odyssey-input" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPatient(null); }}>
            {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
          </select>
        </Field>
      )}
      <section className="scanner-card">
        <div className="scanner-frame" aria-hidden="true"><span /></div>
        <form className="stack" onSubmit={identify}>
          <Field label="Patient QR payload">
            <input ref={scannerInput} className="odyssey-input" name="qrPayload" autoComplete="off" placeholder="Scan now" required />
          </Field>
          <Button type="submit">Identify patient</Button>
        </form>
      </section>
      {patient && (
        <section className="identified-patient" aria-live="polite">
          <p className="eyebrow">Identity confirmed</p>
          <h2>{patient.displayName}</h2>
          <dl>
            <div><dt>Walk-in ID</dt><dd>{patient.walkInId ?? "Registered patient"}</dd></div>
            <div><dt>Date of birth</dt><dd>{patient.birthDate ?? "Not recorded"}</dd></div>
            <div><dt>Gender</dt><dd>{patient.gender ?? "Not recorded"}</dd></div>
          </dl>
          <p className="hint">Confirm these details verbally before continuing with scheduling or check-in.</p>
        </section>
      )}
      <p role="status" className="governance-status">{status}</p>
    </main>
  );
}
