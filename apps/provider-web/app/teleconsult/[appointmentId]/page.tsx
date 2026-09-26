"use client";

import {
  closeTeleconsultRoom,
  createBrowserSupabaseClient,
  createDiagnosticServiceRequest,
  createPatientQrPayload,
  getMyEncounterViewMode,
  getOrganizationClinicalRecords,
  getOrganizationPatient,
  getPortalAccess,
  getSpecialistOptions,
  getTeleconsultAppointments,
  hasOrganizationPermission,
  issueMedicalCertificate,
  issuePrescription,
  recordEncounterRegionDiagnosis,
  saveMyEncounterViewMode,
  saveSoapNote,
  signOut,
  startAppointmentEncounter,
} from "@odyssey/supabase-client";
import { getEncounterRegionDiagnoses, type AnatomyView, type EncounterRegionDiagnosis, type EncounterViewMode, type OrganizationClinicalRecords, type PatientSummary, type SpecialistOption, type TeleconsultAppointment } from "@odyssey/types";
import { Badge, buildClinicalVitalReadings, Button, ClinicalPatientCard, ClinicalVitalsPanel, Field, Input, MUSCULOSKELETAL_REGIONS, MusculoskeletalFigure, MusculoskeletalRegionPanel, TeleconsultWebRtcRoom, type BodyRegionDefinition } from "@odyssey/ui";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClinicalDocumentationWorkspace } from "../../components/ClinicalDocumentationWorkspace";
import { ClinicalOrdersAndCharges } from "../../components/ClinicalOrdersAndCharges";
import { EncounterSoapEditor } from "../../components/EncounterSoapEditor";
import { LongitudinalRecord } from "../../components/LongitudinalRecord";
import { generateRandomEncounterData, isDeveloperModeActive, setDeveloperModeActive } from "../../components/encounter-test-data";

type TeleconsultAction = "prescription" | "certificate" | "referral";

function clinicalText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Start time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Start time unavailable" : date.toLocaleString();
}

export default function ProviderTeleconsultRoomPage() {
  const router = useRouter();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(null);
  const [clinicalRecords, setClinicalRecords] = useState<OrganizationClinicalRecords | null>(null);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [status, setStatus] = useState("Authorizing the assigned room…");
  const [busy, setBusy] = useState(false);
  const [videoOpen, setVideoOpen] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [soapInput, setSoapInput] = useState("");
  const [soapDirty, setSoapDirty] = useState(false);
  const [preferredMode, setPreferredMode] = useState<EncounterViewMode>("visual");
  const [forceSimpleMode, setForceSimpleMode] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionDefinition>(MUSCULOSKELETAL_REGIONS.find((region) => region.code === "chest") ?? { code: "chest", display: "Chest" });
  const [anatomyView, setAnatomyView] = useState<AnatomyView>("front");
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [canPrescribe, setCanPrescribe] = useState(false);
  const [canRefer, setCanRefer] = useState(false);
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);
  const [activeAction, setActiveAction] = useState<TeleconsultAction>("prescription");
  const [rxMedication, setRxMedication] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxNote, setRxNote] = useState("");
  const [certTitle, setCertTitle] = useState("Medical Certificate");
  const [certStatement, setCertStatement] = useState("");
  const [specialistRoleId, setSpecialistRoleId] = useState("");
  const [referralNote, setReferralNote] = useState("");

  useEffect(() => { if (isDeveloperModeActive()) setDebugMode(true); }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setForceSimpleMode(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const loadClinicalRecords = useCallback(async (clinicId: string) => {
    const result = await getOrganizationClinicalRecords(createBrowserSupabaseClient(), clinicId);
    if (result.error) { setStatus(`Unable to load the patient chart: ${result.error.message}`); return null; }
    setClinicalRecords(result.data);
    return result.data;
  }, []);

  const loadRoom = useCallback(async () => {
    const client = createBrowserSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) { setStatus("Your sign-in session is unavailable. Please sign in again to access this room."); return; }
    const access = await getPortalAccess(client, "provider");
    const clinicId = access.data?.organizationIds[0];
    if (access.error || !access.data?.allowed || !clinicId) { await signOut(client); setStatus("Sign in through the provider workspace to access this room."); return; }
    setOrganizationId(clinicId);
    const result = await getTeleconsultAppointments(client, clinicId);
    const room = result.data?.find((item) => item.appointment_id === appointmentId);
    if (result.error || !room) { setStatus("This room is not assigned to your provider account."); return; }
    setAppointment(room);
    setStatus(room.can_join ? "Secure room ready." : "The room is outside its join window.");
    const records = await loadClinicalRecords(clinicId);
    if (!room.encounter_id || !records) return;
    const currentEncounter = records.encounters.find((item) => item.id === room.encounter_id);
    if (!currentEncounter) return;
    const [patientResult, preferenceResult, prescribeResult, referralResult] = await Promise.all([
      getOrganizationPatient(client, clinicId, currentEncounter.patient_id),
      getMyEncounterViewMode(client),
      hasOrganizationPermission(client, clinicId, "can_start_consultation"),
      hasOrganizationPermission(client, clinicId, "can_order_diagnostics"),
    ]);
    if (patientResult.data) setPatient(patientResult.data);
    if (!preferenceResult.error) setPreferredMode(preferenceResult.data);
    setCanPrescribe(Boolean(prescribeResult.data));
    setCanRefer(Boolean(referralResult.data));
    if (referralResult.data) {
      const specialistResult = await getSpecialistOptions(client, clinicId);
      if (!specialistResult.error) setSpecialists(specialistResult.data);
    }
  }, [appointmentId, loadClinicalRecords]);

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  const encounter = useMemo(() => clinicalRecords?.encounters.find((item) => item.id === appointment?.encounter_id) ?? null, [appointment?.encounter_id, clinicalRecords?.encounters]);
  const currentSoapNote = useMemo(() => clinicalRecords?.observations.find((item) => item.encounter_id === appointment?.encounter_id && item.code === "SOAP-NOTE"), [appointment?.encounter_id, clinicalRecords?.observations]);
  const patientObservations = useMemo(() => (clinicalRecords?.observations ?? []).filter((item) => item.patient_id === encounter?.patient_id), [clinicalRecords?.observations, encounter?.patient_id]);
  const vitalReadings = useMemo(() => buildClinicalVitalReadings(patientObservations), [patientObservations]);
  const regionDiagnoses = useMemo<EncounterRegionDiagnosis[]>(() => (clinicalRecords?.encounters ?? []).filter((item) => item.patient_id === encounter?.patient_id).flatMap(getEncounterRegionDiagnoses), [clinicalRecords?.encounters, encounter?.patient_id]);
  const priorEncounters = useMemo(() => (clinicalRecords?.encounters ?? []).filter((item) => item.patient_id === encounter?.patient_id && item.id !== appointment?.encounter_id).sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "")), [appointment?.encounter_id, clinicalRecords?.encounters, encounter?.patient_id]);
  const effectiveMode: EncounterViewMode = forceSimpleMode ? "simple" : preferredMode;

  useEffect(() => { if (currentSoapNote && !soapDirty) setSoapInput(clinicalText(currentSoapNote.value)); }, [currentSoapNote, soapDirty]);

  function handleSoapChange(value: string) {
    setSoapInput(value); setSoapDirty(true);
    if (value.trim().toUpperCase().includes("ODC")) { setDebugMode(true); setDeveloperModeActive(true); }
  }
  function fillSoap() { const data = generateRandomEncounterData(); setSoapInput(data.soap); setSoapDirty(true); setStatus(`Test Fill generated a clinical note for ${data.profile.name}.`); }
  async function selectMode(mode: EncounterViewMode) {
    if (forceSimpleMode && mode === "visual") return;
    setPreferredMode(mode);
    const result = await saveMyEncounterViewMode(createBrowserSupabaseClient(), mode);
    if (result.error) setStatus(`Unable to save view preference: ${result.error.message}`);
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!appointment?.encounter_id || !organizationId) return;
    const text = soapInput.trim(); if (!text) return;
    setBusy(true);
    const result = await saveSoapNote(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, text, supersedesId: currentSoapNote?.id });
    setBusy(false);
    if (result.error) setStatus(`Unable to save consultation note: ${result.error.message}`);
    else { setSoapDirty(false); await loadClinicalRecords(organizationId); setStatus(currentSoapNote ? "Consultation note revision saved." : "Consultation note saved."); }
  }
  async function addRegionDiagnosis(text: string) {
    if (!appointment?.encounter_id) return;
    setDiagnosisBusy(true);
    const result = await recordEncounterRegionDiagnosis(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, regionCode: selectedRegion.code, regionDisplay: selectedRegion.display, anatomyView, diagnosisText: text });
    setDiagnosisBusy(false);
    if (result.error) setStatus(`Unable to add diagnosis: ${result.error.message}`);
    else if (organizationId) { await loadClinicalRecords(organizationId); setStatus(`${selectedRegion.display} diagnosis added to this encounter.`); }
  }
  async function issueTeleconsultPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!appointment?.encounter_id) return;
    setBusy(true); const result = await issuePrescription(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, medication: rxMedication, dosage: rxDosage, note: rxNote }); setBusy(false);
    if (result.error) setStatus(`Unable to issue prescription: ${result.error.message}`);
    else if (organizationId) { setRxMedication(""); setRxDosage(""); setRxNote(""); await loadClinicalRecords(organizationId); setStatus("Prescription issued."); }
  }
  async function issueTeleconsultCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!appointment?.encounter_id) return;
    setBusy(true); const result = await issueMedicalCertificate(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, title: certTitle, statement: certStatement }); setBusy(false);
    if (result.error) setStatus(`Unable to issue medical certificate: ${result.error.message}`);
    else if (organizationId) { setCertStatement(""); await loadClinicalRecords(organizationId); setStatus("Medical certificate issued."); }
  }
  async function issueTeleconsultReferral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!appointment?.encounter_id) return;
    setBusy(true); const result = await createDiagnosticServiceRequest(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, category: "referral", priority: "routine", note: referralNote, performerPractitionerRoleId: specialistRoleId }); setBusy(false);
    if (result.error) setStatus(`Unable to place referral: ${result.error.message}`);
    else if (organizationId) { setSpecialistRoleId(""); setReferralNote(""); await loadClinicalRecords(organizationId); setStatus("Specialist referral placed."); }
  }
  async function startVisit() {
    setBusy(true); const result = await startAppointmentEncounter(createBrowserSupabaseClient(), appointmentId); setBusy(false);
    if (result.error) setStatus(`Unable to start encounter: ${result.error.message}`); else { await loadRoom(); setStatus("Encounter started. The clinical workspace is ready."); }
  }
  async function closeRoom() {
    if (!organizationId) return;
    setBusy(true); const result = await closeTeleconsultRoom(createBrowserSupabaseClient(), appointmentId); setBusy(false);
    if (result.error) setStatus(`Unable to close room: ${result.error.message}`); else { await loadRoom(); setStatus("Teleconsult room closed."); }
  }
  async function handleSignOut() { await signOut(createBrowserSupabaseClient()); router.push("/"); }

  const teleconsultActions = [
    ...(canPrescribe ? [{ id: "prescription" as const, label: "Prescription" }, { id: "certificate" as const, label: "Medical certificate" }] : []),
    ...(canRefer ? [{ id: "referral" as const, label: "Specialist referral" }] : []),
  ];

  return (
    <main className="encounter-shell teleconsult-shell">
      <header className="encounter-header">
        <div><a className="encounter-back" href="/teleconsult">← Back to meeting rooms</a><p className="eyebrow">Virtual consultation</p><h1>{appointment?.patient_name ?? "Teleconsult room"}</h1><p>{appointment?.service_type ?? "General consultation"} · {patient?.birth_date ?? "DOB not recorded"} · {patient?.gender ?? "Gender not recorded"} · {formatDateTime(appointment?.start_at)}</p></div>
        <div className="encounter-header-actions">
          {appointment ? <Badge variant={appointment.room_status === "open" ? "success" : "muted"}>{appointment.room_status}</Badge> : null}
          <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>Log out</Button>
        </div>
      </header>
      <div className="provider-call-status" role="status" aria-live="polite"><span className="provider-call-status-dot" />{status}</div>
      {appointment ? <>
        <section className="teleconsult-video-panel" aria-label="Video consultation">
          <div className="teleconsult-video-panel__header"><div><p className="eyebrow">Secure room</p><h2>Video consultation</h2></div><div>{!appointment.encounter_id ? <Button disabled={busy} onClick={() => void startVisit()}>Start encounter</Button> : null}{appointment.room_status !== "closed" && appointment.room_status !== "cancelled" ? <Button disabled={busy} onClick={() => void closeRoom()}>Close room</Button> : null}<Button aria-expanded={videoOpen} onClick={() => setVideoOpen((open) => !open)} variant="secondary">{videoOpen ? "Hide video" : "Show video"}</Button></div></div>
          {videoOpen ? appointment.can_join && appointment.room_name ? <TeleconsultWebRtcRoom client={createBrowserSupabaseClient()} displayLabel="Clinician" remoteParticipantName={appointment.patient_name} appointmentTime={appointment.start_at} serviceName={appointment.service_type ?? undefined} roomName={appointment.room_name} /> : <div className="provider-call-unavailable"><h2>Video unavailable</h2><p>The secure room becomes available during the appointment join window.</p></div> : null}
        </section>
        {appointment.encounter_id && clinicalRecords && patient && encounter ? <div className="encounter-layout teleconsult-clinical-layout">
          <aside className="encounter-context" aria-label="Patient details and vitals"><ClinicalPatientCard bloodType={patient.blood_type} birthDate={patient.birth_date} compact displayName={patient.displayName} gender={patient.gender} photoUrl={patient.photo_url} qrPayload={createPatientQrPayload(organizationId ?? appointment.organization_id, patient.id)} /><ClinicalVitalsPanel emptyMessage="Not captured this visit. No earlier vital signs are recorded for this patient." readings={vitalReadings} /></aside>
          <section className="encounter-recording" aria-labelledby="teleconsult-documentation-heading">
            <ClinicalDocumentationWorkspace headingId="teleconsult-documentation-heading" forceSimpleMode={forceSimpleMode} mode={effectiveMode} onModeChange={(mode) => void selectMode(mode)} simpleContent={<EncounterSoapEditor busy={busy} canEdit={encounter.status === "in_progress"} currentNoteId={currentSoapNote?.id} debugMode={debugMode} encounterId={appointment.encounter_id} onChange={handleSoapChange} onSubmit={saveNote} onTestFillAll={fillSoap} onTestFillSoap={fillSoap} value={soapInput} />} visualContent={<section className="encounter-assessment-workspace" aria-label="Visual assessment workspace"><MusculoskeletalFigure activeRegionCodes={[...new Set(regionDiagnoses.map((diagnosis) => diagnosis.regionCode))]} anatomyView={anatomyView} onRegionSelect={setSelectedRegion} onViewChange={setAnatomyView} selectedRegionCode={selectedRegion.code} /><MusculoskeletalRegionPanel busy={diagnosisBusy} diagnoses={regionDiagnoses} encounterOpen={encounter.status === "in_progress"} onDiagnosisSubmit={addRegionDiagnosis} onRegionChange={setSelectedRegion} selectedRegion={selectedRegion} /></section>} />
            {encounter.status === "in_progress" ? <ClinicalOrdersAndCharges actions={teleconsultActions} activeAction={activeAction} onActionChange={setActiveAction}>
              <div className="encounter-actions-grid">
                {canPrescribe && activeAction === "prescription" ? <section className="encounter-action-card"><h3>Prescription</h3><form className="encounter-action-form" onSubmit={issueTeleconsultPrescription}><Field label="Medication"><Input maxLength={240} onChange={(event) => setRxMedication(event.target.value)} required value={rxMedication} /></Field><Field label="Dosage and directions"><textarea className="odyssey-input" maxLength={1000} onChange={(event) => setRxDosage(event.target.value)} required rows={3} value={rxDosage} /></Field><Field className="encounter-field-full" label="Note"><Input maxLength={1000} onChange={(event) => setRxNote(event.target.value)} value={rxNote} /></Field><Button className="encounter-form-submit" disabled={busy} type="submit">Issue prescription</Button></form></section> : null}
                {canPrescribe && activeAction === "certificate" ? <section className="encounter-action-card"><h3>Medical certificate</h3><form className="encounter-action-form" onSubmit={issueTeleconsultCertificate}><Field label="Certificate title"><Input maxLength={200} onChange={(event) => setCertTitle(event.target.value)} required value={certTitle} /></Field><Field className="encounter-field-full" label="Statement"><textarea className="odyssey-input" maxLength={5000} onChange={(event) => setCertStatement(event.target.value)} required rows={5} value={certStatement} /></Field><Button className="encounter-form-submit" disabled={busy} type="submit">Issue certificate</Button></form></section> : null}
                {canRefer && activeAction === "referral" ? <section className="encounter-action-card"><h3>Specialist referral</h3><form className="encounter-action-form" onSubmit={issueTeleconsultReferral}><Field label="Specialist"><select className="odyssey-input" onChange={(event) => setSpecialistRoleId(event.target.value)} required value={specialistRoleId}><option disabled value="">Select a specialist</option>{specialists.map((specialist) => <option key={specialist.practitionerRoleId} value={specialist.practitionerRoleId}>{specialist.displayName} · {specialist.organizationName}</option>)}</select></Field><Field className="encounter-field-full" label="Clinical note"><textarea className="odyssey-input" maxLength={5000} onChange={(event) => setReferralNote(event.target.value)} rows={3} value={referralNote} /></Field><Button className="encounter-form-submit" disabled={busy} type="submit">Place referral</Button></form></section> : null}
              </div>
              <section className="encounter-added-actions" aria-labelledby="teleconsult-added-actions-heading"><h3 id="teleconsult-added-actions-heading">Added to this encounter</h3><ul>{clinicalRecords.medicationRequests.filter((item) => item.encounter_id === appointment.encounter_id).map((item) => <li key={item.id}>Prescription: {item.medication_display ?? item.medication_code}</li>)}{clinicalRecords.documentReferences.filter((item) => item.encounter_id === appointment.encounter_id && item.type_code === "medical-certificate").map((item) => <li key={item.id}>Certificate: {item.content_title ?? item.type_display ?? "Medical certificate"}</li>)}{clinicalRecords.serviceRequests.filter((item) => item.encounter_id === appointment.encounter_id && item.category === "referral").map((item) => <li key={item.id}>Referral: {item.code_display ?? item.code}</li>)}{!clinicalRecords.medicationRequests.some((item) => item.encounter_id === appointment.encounter_id) && !clinicalRecords.documentReferences.some((item) => item.encounter_id === appointment.encounter_id && item.type_code === "medical-certificate") && !clinicalRecords.serviceRequests.some((item) => item.encounter_id === appointment.encounter_id && item.category === "referral") ? <li className="is-empty">No orders or documents added yet.</li> : null}</ul></section>
            </ClinicalOrdersAndCharges> : null}
            <LongitudinalRecord count={priorEncounters.length}>{priorEncounters.length ? priorEncounters.map((prior) => <details className="history-encounter" key={prior.id}><summary><span><strong>{prior.service_type ?? "Clinical visit"}</strong><small>{formatDateTime(prior.period_start)} · {prior.status.replaceAll("_", " ")}</small></span></summary><div className="history-entries">{clinicalRecords.observations.filter((item) => item.encounter_id === prior.id).map((item) => <article key={item.id}><strong>{item.code_display ?? item.code}</strong><p>{clinicalText(item.value) || item.note || "No narrative recorded."}</p></article>)}</div></details>) : <p className="hint">No earlier encounters are recorded at this clinic.</p>}</LongitudinalRecord>
          </section>
        </div> : !appointment.encounter_id ? <section className="teleconsult-start-state"><h2>Start the encounter to document</h2><p>The video room remains available while you document in the shared clinical workspace.</p><Button disabled={busy} onClick={() => void startVisit()}>Start encounter</Button></section> : null}
      </> : null}
    </main>
  );
}
