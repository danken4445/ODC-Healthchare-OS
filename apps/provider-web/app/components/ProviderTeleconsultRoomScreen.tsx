"use client";

import {
  closeTeleconsultRoom,
  createBrowserSupabaseClient,
  createDiagnosticServiceRequest,
  createPatientQrPayload,
  finishClinicalEncounter,
  getMyEncounterViewMode,
  getMyTeleconsultWorkspacePreference,
  getOrganizationClinicalRecords,
  getOrganizationPatient,
  getPortalAccess,
  getSpecialistOptions,
  getTeleconsultAppointments,
  hasOrganizationPermission,
  issueMedicalCertificate,
  issuePrescription,
  issuePrescriptionRegimen,
  recordEncounterRegionDiagnosis,
  saveMyEncounterViewMode,
  saveMyTeleconsultWorkspacePreference,
  saveSoapNote,
  signOut,
  startAppointmentEncounter,
} from "@odyssey/supabase-client";
import { getEncounterRegionDiagnoses, type AnatomyView, type EncounterRegionDiagnosis, type EncounterViewMode, type OrganizationClinicalRecords, type PatientSummary, type SpecialistOption, type TeleconsultAppointment, type TeleconsultWorkspacePreference } from "@odyssey/types";
import { Badge, buildClinicalVitalReadings, Button, ClinicalPatientCard, ClinicalVitalsPanel, EncounterSaveConfirmedModal, Field, Input, MUSCULOSKELETAL_REGIONS, MusculoskeletalFigure, MusculoskeletalRegionPanel, TeleconsultWebRtcRoom, type BodyRegionDefinition } from "@odyssey/ui";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClinicalDocumentationWorkspace } from "./ClinicalDocumentationWorkspace";
import { ClinicalOrdersAndCharges } from "./ClinicalOrdersAndCharges";
import { EncounterSoapEditor } from "./EncounterSoapEditor";
import { LongitudinalRecord } from "./LongitudinalRecord";
import { ClinicalTemplatePicker, type TemplateApplication } from "./template-studio";
import { TeleconsultSplitWorkspace } from "./TeleconsultSplitWorkspace";
import { generateRandomEncounterData, isDeveloperModeActive, setDeveloperModeActive } from "./encounter-test-data";

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

function endingClinicianLabel(name: string): string {
  const clinicianName = name.replace(/^(?:dr\.?|doctor)\s+/i, "").trim();
  return clinicianName ? `Doctor ${clinicianName}` : "Your doctor";
}

export function ProviderTeleconsultRoomScreen({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(null);
  const [clinicalRecords, setClinicalRecords] = useState<OrganizationClinicalRecords | null>(null);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [status, setStatus] = useState("Authorizing the assigned room…");
  const [busy, setBusy] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const completionDialogRef = useRef<HTMLDialogElement>(null);
  const [teleconsultEnding, setTeleconsultEnding] = useState<{ id: number; clinicianName: string } | null>(null);
  const [videoOpen, setVideoOpen] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [soapInput, setSoapInput] = useState("");
  const [soapDirty, setSoapDirty] = useState(false);
  const [soapAutosaveState, setSoapAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [soapLastSavedAt, setSoapLastSavedAt] = useState<Date | null>(null);
  const [latestSoapNoteId, setLatestSoapNoteId] = useState<string | null>(null);
  const [soapAutosaveRevision, setSoapAutosaveRevision] = useState(0);
  const soapInputRef = useRef("");
  const latestSoapNoteIdRef = useRef<string | null>(null);
  const lastSavedSoapTextRef = useRef("");
  const soapSaveInFlightRef = useRef(false);
  const soapSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const [soapSaveConfirmation, setSoapSaveConfirmation] = useState<{
    noteSnippet: string;
    revisionNumber?: number;
    timestamp: Date;
  } | null>(null);
  const [preferredMode, setPreferredMode] = useState<EncounterViewMode>("visual");
  const [teleconsultWorkspacePreference, setTeleconsultWorkspacePreference] = useState<TeleconsultWorkspacePreference>({ chartCollapsed: false, splitRatio: 55 });
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
  const [prescriptionTemplate, setPrescriptionTemplate] = useState<TemplateApplication | null>(null);
  const [additionalPrescriptionLines, setAdditionalPrescriptionLines] = useState<TemplateApplication["medications"]>([]);
  const [certificateTemplate, setCertificateTemplate] = useState<TemplateApplication | null>(null);
  const [specialistRoleId, setSpecialistRoleId] = useState("");
  const [referralNote, setReferralNote] = useState("");

  useEffect(() => { if (isDeveloperModeActive()) setDebugMode(true); }, []);
  useEffect(() => {
    const dialog = completionDialogRef.current;
    if (!dialog) return;
    if (completionDialogOpen && !dialog.open) dialog.showModal();
    if (!completionDialogOpen && dialog.open) dialog.close();
  }, [completionDialogOpen]);
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
    const [patientResult, preferenceResult, workspacePreferenceResult, prescribeResult, referralResult] = await Promise.all([
      getOrganizationPatient(client, clinicId, currentEncounter.patient_id),
      getMyEncounterViewMode(client),
      getMyTeleconsultWorkspacePreference(client),
      hasOrganizationPermission(client, clinicId, "can_start_consultation"),
      hasOrganizationPermission(client, clinicId, "can_order_diagnostics"),
    ]);
    if (patientResult.data) setPatient(patientResult.data);
    if (!preferenceResult.error) setPreferredMode(preferenceResult.data);
    if (!workspacePreferenceResult.error) setTeleconsultWorkspacePreference(workspacePreferenceResult.data);
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
  const completionBlocker = !latestSoapNoteId
    ? "Save clinical documentation before finishing this encounter."
    : soapDirty
      ? "Save or discard the current documentation changes before finishing."
      : null;

  useEffect(() => {
    if (currentSoapNote && !soapDirty && (!latestSoapNoteIdRef.current || currentSoapNote.id === latestSoapNoteIdRef.current)) {
      const text = clinicalText(currentSoapNote.value);
      setSoapInput(text); soapInputRef.current = text; lastSavedSoapTextRef.current = text;
      latestSoapNoteIdRef.current = currentSoapNote.id; setLatestSoapNoteId(currentSoapNote.id);
    }
  }, [currentSoapNote, soapDirty]);
  useEffect(() => { soapInputRef.current = soapInput; }, [soapInput]);

  const persistSoapNote = useCallback(async (source: "auto" | "manual") => {
    const text = soapInputRef.current.trim();
    const encounterId = appointment?.encounter_id;
    if (!text || !encounterId) return false;

    if (soapSaveInFlightRef.current && soapSavePromiseRef.current) {
      const inFlightSuccess = await soapSavePromiseRef.current;
      if (source === "manual" && inFlightSuccess) {
        setStatus("Consultation note saved.");
        setSoapSaveConfirmation({
          noteSnippet: text,
          revisionNumber: soapAutosaveRevision > 0 ? soapAutosaveRevision : 1,
          timestamp: soapLastSavedAt ?? new Date(),
        });
      }
      return inFlightSuccess;
    }

    if (text === lastSavedSoapTextRef.current) {
      setSoapDirty(false);
      setSoapAutosaveState("saved");
      if (source === "manual") {
        setStatus("Consultation note saved.");
        setSoapSaveConfirmation({
          noteSnippet: text,
          revisionNumber: soapAutosaveRevision > 0 ? soapAutosaveRevision : 1,
          timestamp: soapLastSavedAt ?? new Date(),
        });
      }
      return true;
    }

    const saveExecution = (async () => {
      soapSaveInFlightRef.current = true;
      setSoapAutosaveState("saving");
      const result = await saveSoapNote(createBrowserSupabaseClient(), {
        encounterId,
        text,
        supersedesId: latestSoapNoteIdRef.current ?? undefined,
      });
      soapSaveInFlightRef.current = false;

      if (result.error) {
        setSoapAutosaveState("error");
        setStatus(`Unable to save consultation note: ${result.error.message}`);
        return false;
      }

      latestSoapNoteIdRef.current = result.data.observationId;
      lastSavedSoapTextRef.current = text;
      setLatestSoapNoteId(result.data.observationId);
      const savedDate = new Date();
      setSoapLastSavedAt(savedDate);

      const hasNewerChanges = soapInputRef.current.trim() !== text;
      setSoapDirty(hasNewerChanges);
      setSoapAutosaveState(hasNewerChanges ? "pending" : "saved");
      const nextRev = soapAutosaveRevision + 1;
      setSoapAutosaveRevision(nextRev);

      if (source === "manual") {
        setStatus("Consultation note saved.");
        setSoapSaveConfirmation({
          noteSnippet: text,
          revisionNumber: nextRev,
          timestamp: savedDate,
        });
      }
      return true;
    })();

    soapSavePromiseRef.current = saveExecution;
    try {
      return await saveExecution;
    } finally {
      if (soapSavePromiseRef.current === saveExecution) {
        soapSavePromiseRef.current = null;
      }
    }
  }, [appointment?.encounter_id, soapAutosaveRevision, soapLastSavedAt]);

  useEffect(() => {
    if (!soapDirty || !soapInput.trim() || encounter?.status !== "in_progress") return;
    if (soapInput.trim() === lastSavedSoapTextRef.current) { setSoapDirty(false); setSoapAutosaveState("saved"); return; }
    setSoapAutosaveState("pending");
    const timeout = window.setTimeout(() => { void persistSoapNote("auto"); }, 1200);
    return () => window.clearTimeout(timeout);
  }, [encounter?.status, persistSoapNote, soapAutosaveRevision, soapDirty, soapInput]);

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
  async function saveTeleconsultWorkspacePreference(preference: TeleconsultWorkspacePreference) {
    setTeleconsultWorkspacePreference(preference);
    const result = await saveMyTeleconsultWorkspacePreference(createBrowserSupabaseClient(), preference);
    if (result.error) setStatus(`Unable to save teleconsult layout preference: ${result.error.message}`);
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistSoapNote("manual");
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
    const regimen = [
      { medication: rxMedication, dosage: rxDosage, note: rxNote },
      ...additionalPrescriptionLines.map((line) => ({
        medication: line.name,
        dosage: [line.dosage, line.frequency, line.duration].filter(Boolean).join(" · ") || line.dosage || "As directed",
        note: line.notes,
      })),
    ].filter((m) => m.medication.trim());
    setBusy(true); const result = regimen.length > 1 ? await issuePrescriptionRegimen(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, medications: regimen, templateId: prescriptionTemplate?.templateId, templateVersion: prescriptionTemplate?.templateVersion }) : await issuePrescription(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, medication: rxMedication, dosage: rxDosage, note: rxNote, templateId: prescriptionTemplate?.templateId, templateVersion: prescriptionTemplate?.templateVersion }); setBusy(false);
    if (result.error) setStatus(`Unable to issue prescription: ${result.error.message}`);
    else if (organizationId) { setRxMedication(""); setRxDosage(""); setRxNote(""); setPrescriptionTemplate(null); setAdditionalPrescriptionLines([]); await loadClinicalRecords(organizationId); setStatus("Prescription issued."); }
  }
  async function issueTeleconsultCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!appointment?.encounter_id) return;
    setBusy(true); const result = await issueMedicalCertificate(createBrowserSupabaseClient(), { encounterId: appointment.encounter_id, title: certTitle, statement: certStatement, templateId: certificateTemplate?.templateId, templateVersion: certificateTemplate?.templateVersion }); setBusy(false);
    if (result.error) setStatus(`Unable to issue medical certificate: ${result.error.message}`);
    else if (organizationId) { setCertStatement(""); setCertificateTemplate(null); await loadClinicalRecords(organizationId); setStatus("Medical certificate issued."); }
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
  async function endTeleconsultRoom(): Promise<boolean> {
    if (!organizationId || !appointment) return false;
    setBusy(true);
    setTeleconsultEnding({ id: Date.now(), clinicianName: endingClinicianLabel(appointment.practitioner_name) });
    setStatus("Teleconsultation ending in 3 seconds.");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 3200));
    const result = await closeTeleconsultRoom(createBrowserSupabaseClient(), appointmentId);
    setBusy(false);
    if (result.error) {
      setStatus(`Unable to close room: ${result.error.message}`);
      return false;
    }
    await loadRoom();
    return true;
  }
  async function closeRoom() {
    if (await endTeleconsultRoom()) setStatus("Teleconsult room closed.");
  }
  async function finishEncounter() {
    if (!appointment?.encounter_id) return;
    if (completionBlocker) {
      setStatus(completionBlocker);
      return;
    }
    setBusy(true);
    const result = await finishClinicalEncounter(createBrowserSupabaseClient(), appointment.encounter_id);
    setBusy(false);
    if (result.error) {
      setStatus(`Unable to finish encounter: ${result.error.message}`);
      return;
    }
    setCompletionDialogOpen(false);
    if (await endTeleconsultRoom()) setStatus("Encounter finished and shared with the patient.");
    else setStatus("Encounter finished, but the teleconsult room could not be closed.");
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
          {encounter?.status === "in_progress" ? <div className="encounter-completion-control">
            <Button disabled={busy || Boolean(completionBlocker)} onClick={() => setCompletionDialogOpen(true)} title={completionBlocker ?? "Review completion before finishing the encounter"}>Finish encounter</Button>
            {completionBlocker ? <span>{completionBlocker}</span> : null}
          </div> : null}
          <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>Log out</Button>
        </div>
      </header>
      <dialog className="encounter-completion-dialog" onCancel={() => setCompletionDialogOpen(false)} ref={completionDialogRef}>
        <form method="dialog">
          <p className="eyebrow">Finish encounter</p>
          <h2>Finish this encounter?</h2>
          <p>The saved note and any orders or documents will remain attached to this completed encounter and shared with the patient.</p>
          <div>
            <Button onClick={() => setCompletionDialogOpen(false)} type="button" variant="outline">Keep documenting</Button>
            <Button disabled={busy} onClick={() => void finishEncounter()} type="button">{busy ? "Finishing…" : "Finish encounter"}</Button>
          </div>
        </form>
      </dialog>
      <div className="provider-call-status" role="status" aria-live="polite"><span className="provider-call-status-dot" />{status}</div>
      {appointment ? <>
        <TeleconsultSplitWorkspace
          documentation={appointment.encounter_id && clinicalRecords && patient && encounter ? <section className="encounter-recording" aria-labelledby="teleconsult-documentation-heading">
            <ClinicalDocumentationWorkspace headingId="teleconsult-documentation-heading" forceSimpleMode={forceSimpleMode} mode={effectiveMode} onModeChange={(mode) => void selectMode(mode)} simpleContent={<EncounterSoapEditor autosaveState={soapAutosaveState} busy={busy} canEdit={encounter.status === "in_progress"} currentNoteId={latestSoapNoteId} debugMode={debugMode} encounterId={appointment.encounter_id} isDirty={soapDirty} lastSavedAt={soapLastSavedAt ? soapLastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null} onChange={handleSoapChange} onRetryAutosave={() => void persistSoapNote("manual")} onSubmit={saveNote} onTestFillAll={fillSoap} onTestFillSoap={fillSoap} value={soapInput} />} visualContent={<section className="encounter-assessment-workspace" aria-label="Visual assessment workspace"><MusculoskeletalFigure activeRegionCodes={[...new Set(regionDiagnoses.map((diagnosis) => diagnosis.regionCode))]} anatomyView={anatomyView} onRegionSelect={setSelectedRegion} onViewChange={setAnatomyView} selectedRegionCode={selectedRegion.code} /><MusculoskeletalRegionPanel busy={diagnosisBusy} diagnoses={regionDiagnoses} encounterOpen={encounter.status === "in_progress"} onDiagnosisSubmit={addRegionDiagnosis} onRegionChange={setSelectedRegion} selectedRegion={selectedRegion} /></section>} />
            {encounter.status === "in_progress" ? <ClinicalOrdersAndCharges actions={teleconsultActions} activeAction={activeAction} onActionChange={setActiveAction}>
              <div className="encounter-actions-grid">
                {canPrescribe && activeAction === "prescription" ? <section className="encounter-action-card"><h3>Prescription</h3><form className="encounter-action-form" onSubmit={issueTeleconsultPrescription}>{appointment.encounter_id ? <ClinicalTemplatePicker encounterId={appointment.encounter_id} type="prescription" onApply={(template) => { setPrescriptionTemplate(template); setAdditionalPrescriptionLines(template?.medications.slice(1) ?? []); if (template) { const first = template.medications[0]; setRxMedication(first?.name ?? ""); setRxDosage([first?.dosage, first?.frequency, first?.duration].filter(Boolean).join(" · ")); setRxNote([template.body, first?.notes].filter(Boolean).join("\n\n")); } }} /> : null}<Field label="Medication"><Input maxLength={240} onChange={(event) => setRxMedication(event.target.value)} required value={rxMedication} /></Field><Field label="Dosage and directions"><textarea className="odyssey-input" maxLength={1000} onChange={(event) => setRxDosage(event.target.value)} required rows={3} value={rxDosage} /></Field><Field className="encounter-field-full" label="Note"><Input maxLength={1000} onChange={(event) => setRxNote(event.target.value)} value={rxNote} /></Field>{additionalPrescriptionLines.map((line, index) => (<fieldset className="encounter-field-full template-issued-medication" key={`${line.name}-${index}`} style={{ border: "1px dashed var(--odyssey-border, #cbd5e1)", borderRadius: "8px", padding: "10px 12px", marginBottom: "8px", background: "#f8fafc" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}><legend style={{ fontWeight: 600, color: "#0f766e", fontSize: "0.875rem" }}>Additional medication #{index + 2}</legend><Button type="button" size="sm" variant="ghost" onClick={() => setAdditionalPrescriptionLines((lines) => lines.filter((_, itemIndex) => itemIndex !== index))} style={{ color: "#b91c1c", fontSize: "0.8rem", padding: "2px 8px" }}>✕ Remove</Button></div><Field label="Medication"><Input value={line.name} placeholder="Medication name" onChange={(event) => setAdditionalPrescriptionLines((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} required /></Field><Field label="Dosage and directions"><Input value={[line.dosage, line.frequency, line.duration].filter(Boolean).join(" · ")} placeholder="Dosage and directions" onChange={(event) => setAdditionalPrescriptionLines((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, dosage: event.target.value, frequency: "", duration: "" } : item))} required /></Field><Field label="Note"><Input value={line.notes ?? ""} placeholder="Optional note" onChange={(event) => setAdditionalPrescriptionLines((lines) => lines.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} /></Field></fieldset>))}<div style={{ marginTop: "4px", marginBottom: "8px" }}><Button type="button" size="sm" variant="outline" onClick={() => setAdditionalPrescriptionLines((lines) => [...lines, { name: "", dosage: "", frequency: "", duration: "", notes: "" }])}>➕ Add another medication to prescription</Button></div><Button className="encounter-form-submit" disabled={busy} type="submit">Issue prescription</Button></form></section> : null}
                {canPrescribe && activeAction === "certificate" ? <section className="encounter-action-card"><h3>Medical certificate</h3><form className="encounter-action-form" onSubmit={issueTeleconsultCertificate}>{appointment.encounter_id ? <ClinicalTemplatePicker encounterId={appointment.encounter_id} type="medical_certificate" onApply={(template) => { setCertificateTemplate(template); if (template) { setCertTitle(template.title); setCertStatement(template.body); } }} /> : null}<Field label="Certificate title"><Input maxLength={200} onChange={(event) => setCertTitle(event.target.value)} required value={certTitle} /></Field><Field className="encounter-field-full" label="Statement"><textarea className="odyssey-input" maxLength={5000} onChange={(event) => setCertStatement(event.target.value)} required rows={5} value={certStatement} /></Field><Button className="encounter-form-submit" disabled={busy} type="submit">Issue certificate</Button></form></section> : null}
                {canRefer && activeAction === "referral" ? <section className="encounter-action-card"><h3>Specialist referral</h3><form className="encounter-action-form" onSubmit={issueTeleconsultReferral}><Field label="Specialist"><select className="odyssey-input" onChange={(event) => setSpecialistRoleId(event.target.value)} required value={specialistRoleId}><option disabled value="">Select a specialist</option>{specialists.map((specialist) => <option key={specialist.practitionerRoleId} value={specialist.practitionerRoleId}>{specialist.displayName} · {specialist.organizationName}</option>)}</select></Field><Field className="encounter-field-full" label="Clinical note"><textarea className="odyssey-input" maxLength={5000} onChange={(event) => setReferralNote(event.target.value)} rows={3} value={referralNote} /></Field><Button className="encounter-form-submit" disabled={busy} type="submit">Place referral</Button></form></section> : null}
              </div>
              <section className="encounter-added-actions" aria-labelledby="teleconsult-added-actions-heading"><h3 id="teleconsult-added-actions-heading">Added to this encounter</h3><ul>{clinicalRecords.medicationRequests.filter((item) => item.encounter_id === appointment.encounter_id).map((item) => <li key={item.id}>Prescription: {item.medication_display ?? item.medication_code}</li>)}{clinicalRecords.documentReferences.filter((item) => item.encounter_id === appointment.encounter_id && item.type_code === "medical-certificate").map((item) => <li key={item.id}>Certificate: {item.content_title ?? item.type_display ?? "Medical certificate"}</li>)}{clinicalRecords.serviceRequests.filter((item) => item.encounter_id === appointment.encounter_id && item.category === "referral").map((item) => <li key={item.id}>Referral: {item.code_display ?? item.code}</li>)}{!clinicalRecords.medicationRequests.some((item) => item.encounter_id === appointment.encounter_id) && !clinicalRecords.documentReferences.some((item) => item.encounter_id === appointment.encounter_id && item.type_code === "medical-certificate") && !clinicalRecords.serviceRequests.some((item) => item.encounter_id === appointment.encounter_id && item.category === "referral") ? <li className="is-empty">No orders or documents added yet.</li> : null}</ul></section>
            </ClinicalOrdersAndCharges> : null}
            <LongitudinalRecord count={priorEncounters.length}>{priorEncounters.length ? priorEncounters.map((prior) => <details className="history-encounter" key={prior.id}><summary><span><strong>{prior.service_type ?? "Clinical visit"}</strong><small>{formatDateTime(prior.period_start)} · {prior.status.replaceAll("_", " ")}</small></span></summary><div className="history-entries">{clinicalRecords.observations.filter((item) => item.encounter_id === prior.id).map((item) => <article key={item.id}><strong>{item.code_display ?? item.code}</strong><p>{clinicalText(item.value) || item.note || "No narrative recorded."}</p></article>)}</div></details>) : <p className="hint">No earlier encounters are recorded at this clinic.</p>}</LongitudinalRecord>
          </section> : null}
          patientContext={appointment.encounter_id && clinicalRecords && patient && encounter ? <><ClinicalPatientCard bloodType={patient.blood_type} birthDate={patient.birth_date} compact displayName={patient.displayName} gender={patient.gender} photoUrl={patient.photo_url} qrPayload={createPatientQrPayload(organizationId ?? appointment.organization_id, patient.id)} /><ClinicalVitalsPanel emptyMessage="Not captured this visit. No earlier vital signs are recorded for this patient." readings={vitalReadings} /></> : null}
          onPreferenceChange={(preference) => void saveTeleconsultWorkspacePreference(preference)}
          preference={teleconsultWorkspacePreference}
          video={<section className="teleconsult-video-panel">
            <div className="teleconsult-video-panel__header"><div><p className="eyebrow">Secure room</p><h2>Video consultation</h2></div><div>{!appointment.encounter_id ? <Button disabled={busy} onClick={() => void startVisit()}>Start encounter</Button> : null}{appointment.room_status !== "closed" && appointment.room_status !== "cancelled" ? <Button disabled={busy} onClick={() => void closeRoom()}>Close room</Button> : null}<Button aria-expanded={videoOpen} onClick={() => setVideoOpen((open) => !open)} variant="secondary">{videoOpen ? "Hide video" : "Show video"}</Button></div></div>
            {videoOpen ? appointment.can_join && appointment.room_name ? <TeleconsultWebRtcRoom client={createBrowserSupabaseClient()} displayLabel="Clinician" endingNotice={teleconsultEnding} remoteParticipantName={appointment.patient_name} appointmentTime={appointment.start_at} serviceName={appointment.service_type ?? undefined} roomName={appointment.room_name} /> : <div className="provider-call-unavailable"><h2>Video unavailable</h2><p>The secure room becomes available during the appointment join window.</p></div> : null}
          </section>}
        />
        {!appointment.encounter_id ? <section className="teleconsult-start-state"><h2>Start the encounter to document</h2><p>The video room remains available while you document in the shared clinical workspace.</p><Button disabled={busy} onClick={() => void startVisit()}>Start encounter</Button></section> : null}
      </> : null}

      {/* Confirmed Save Modal for SOAP Consultation Notes */}
      {soapSaveConfirmation && (
        <EncounterSaveConfirmedModal
          isOpen={Boolean(soapSaveConfirmation)}
          onClose={() => setSoapSaveConfirmation(null)}
          patientName={patient?.displayName ?? appointment?.patient_name ?? "Patient"}
          encounterId={appointment?.encounter_id ?? ""}
          noteSnippet={soapSaveConfirmation.noteSnippet}
          revisionNumber={soapSaveConfirmation.revisionNumber}
          timestamp={soapSaveConfirmation.timestamp}
          onContinueEncounter={() => setSoapSaveConfirmation(null)}
        />
      )}
    </main>
  );
}
