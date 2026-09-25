"use client";

import { identifyPatientByQr } from "@odyssey/supabase-client";
import type { IdentifiedPatient } from "@odyssey/types";
import { CheckCircle2, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { AdminSignIn } from "../../components/admin-sign-in";
import { useAdminData } from "../../components/admin-data-context";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function PatientLookupPage() {
  const { client, email, error: accessError, organization } = useAdminData();
  const [credential, setCredential] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<IdentifiedPatient | null>(null);
  const [loading, setLoading] = useState(false);
  if (!email && accessError) return <AdminSignIn />;
  async function identify(event: FormEvent) {
    event.preventDefault();
    if (!organization) { setError("Select a clinic organization before identifying a patient."); return; }
    setLoading(true); setError(null); setPatient(null);
    const result = await identifyPatientByQr(client, organization.id, credential.trim());
    if (result.error) setError(result.error.message); else setPatient(result.data);
    setLoading(false);
  }
  return <>
    <PageHeader eyebrow="Clinical administration" title="Patient identification" description="Identify a patient from their Odyssey QR credential. Every successful and failed lookup is recorded by the database." />
    <div className="qr-layout"><section className="scanner-panel"><div className="scanner-view" aria-label="QR credential input"><QrCode aria-hidden="true" size={88} /><span><ScanLine aria-hidden="true" size={20} />QR credential verification</span></div><div><h2>Verify patient QR</h2><p>Scan the credential with an attached scanner or paste its complete Odyssey payload below.</p><form className="stack" onSubmit={identify}><label className="field-label">QR credential payload<Input value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="ODYSSEY|organization-id|patient-id" required /></label><Button disabled={loading} type="submit"><ScanLine aria-hidden="true" size={16} />{loading ? "Verifying…" : "Verify credential"}</Button></form></div></section><section className="manual-lookup"><h2>Verification controls</h2><p>The database checks the credential against the selected organization and active patient index. No patient data is stored in this page.</p><dl className="review-list"><div><dt>Organization</dt><dd>{organization?.name ?? "Not selected"}</dd></div><div><dt>Audit</dt><dd>Required for every lookup</dd></div></dl>{error ? <p className="form-error" role="alert">{error}</p> : null}</section></div>
    {patient ? <section className="identity-result" aria-live="polite"><div className="identity-result__heading"><CheckCircle2 aria-hidden="true" size={22} /><div><h2>Identity match confirmed</h2><p>Returned by the organization-scoped identification function</p></div><span><ShieldCheck aria-hidden="true" size={14} />Lookup logged</span></div><dl><div><dt>Patient</dt><dd>{patient.displayName}</dd></div><div><dt>Record identifier</dt><dd>{patient.patientId}</dd></div><div><dt>Date of birth</dt><dd>{patient.birthDate ?? "Not recorded"}</dd></div><div><dt>Gender</dt><dd>{patient.gender ?? "Not recorded"}</dd></div></dl><Button onClick={() => window.location.assign("/patients")}>Open patient records</Button></section> : null}
  </>;
}
