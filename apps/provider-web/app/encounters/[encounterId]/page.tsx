"use client";

import {
  createDiagnosticServiceRequest,
  createBrowserSupabaseClient,
  finishClinicalEncounter,
  getCurrentStaffDepartment,
  getInventoryWorkspace,
  getLaboratoryServices,
  getOrganizationClinicalRecords,
  getOrganizationPatient,
  getPortalAccess,
  getSpecialistOptions,
  hasOrganizationPermission,
  issueMedicalCertificate,
  issuePrescription,
  saveSoapNote,
  tagInventoryUsage,
} from "@odyssey/supabase-client";
import type {
  EncounterSummary,
  DocumentReferenceSummary,
  InventoryWorkspace,
  LaboratoryServiceSummary,
  MedicationRequestSummary,
  OrganizationClinicalRecords,
  PatientSummary,
  SpecialistOption,
} from "@odyssey/types";
import { Badge, Button, Field, Input } from "@odyssey/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { EncounterDevBar } from "../../components/EncounterDevBar";
import {
  generateRandomEncounterData,
  isDeveloperModeActive,
  setDeveloperModeActive,
} from "../../components/encounter-test-data";

function clinicalText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function triageValue(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}

function bloodPressure(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not recorded";
  const reading = (value as Record<string, unknown>).blood_pressure;
  if (!reading || typeof reading !== "object" || Array.isArray(reading)) return "Not recorded";
  const bp = reading as Record<string, unknown>;
  return bp.systolic && bp.diastolic ? `${bp.systolic}/${bp.diastolic} mmHg` : "Not recorded";
}

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function age(birthDate: string | null): string {
  if (!birthDate) return "Not recorded";
  const birthday = new Date(birthDate);
  if (Number.isNaN(birthday.getTime())) return "Not recorded";
  const now = new Date();
  let years = now.getFullYear() - birthday.getFullYear();
  const beforeBirthday = now.getMonth() < birthday.getMonth() ||
    (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate());
  if (beforeBirthday) years -= 1;
  return `${years} years`;
}

function jsonText(value: unknown): string {
  if (!value) return "Not recorded";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const values = value.map(jsonText).filter((item) => item !== "Not recorded");
    return values.join(", ") || "Not recorded";
  }
  if (typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>)
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map(String);
    return values.join(", ") || "Not recorded";
  }
  return "Not recorded";
}

function dosageText(value: unknown): string {
  return Array.isArray(value) ? clinicalText(value[0]) : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function openExportPreview({
  title,
  patientName,
  patientDetails,
  issuedAt,
  body,
}: {
  title: string;
  patientName: string;
  patientDetails: string;
  issuedAt: string;
  body: string;
}): boolean {
  const preview = window.open("", "_blank");
  if (!preview) return false;
  preview.opener = null;
  preview.document.open();
  preview.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#eef2f6;color:#172033;font:16px/1.55 Arial,sans-serif}.toolbar{display:flex;justify-content:flex-end;padding:16px;max-width:820px;margin:auto}.toolbar button{border:0;border-radius:6px;background:#155e75;color:#fff;padding:10px 14px;font:700 14px Arial;cursor:pointer}.document{box-sizing:border-box;width:min(100% - 32px,820px);min-height:1050px;margin:0 auto 32px;padding:64px;background:#fff;box-shadow:0 2px 12px #1720331a}.eyebrow{margin:0;color:#526174;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.document h1{margin:8px 0 28px;font-size:30px}.metadata{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 32px;padding:16px 0;border-top:1px solid #dce4ed;border-bottom:1px solid #dce4ed}.metadata strong,.body h2{display:block;font-size:13px}.metadata span{display:block;font-size:15px}.body{white-space:pre-wrap}.footer{margin-top:64px;padding-top:16px;border-top:1px solid #dce4ed;color:#526174;font-size:13px}@media print{body{background:#fff}.toolbar{display:none}.document{width:100%;min-height:0;margin:0;padding:32px;box-shadow:none}}@media(max-width:600px){.document{width:100%;padding:28px 24px;margin:0}.metadata{grid-template-columns:1fr}}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div><main class="document"><p class="eyebrow">Odyssey Healthcare</p><h1>${escapeHtml(title)}</h1><div class="metadata"><div><strong>Patient</strong><span>${escapeHtml(patientName)}</span></div><div><strong>Patient details</strong><span>${escapeHtml(patientDetails)}</span></div><div><strong>Issued</strong><span>${escapeHtml(issuedAt)}</span></div></div><section class="body">${escapeHtml(body)}</section><footer class="footer">This document was generated from the patient’s clinical encounter record.</footer></main></body></html>`);
  preview.document.close();
  preview.focus();
  return true;
}

export default function EncounterRecordingPage() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const [encounter, setEncounter] = useState<EncounterSummary | null>(null);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [records, setRecords] = useState<OrganizationClinicalRecords | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading the secure encounter record…");
  const [busy, setBusy] = useState(false);
  const [canPrescribe, setCanPrescribe] = useState(false);
  const [canOrderDiagnostics, setCanOrderDiagnostics] = useState(false);
  const [canTagInventory, setCanTagInventory] = useState(false);
  const [inventory, setInventory] = useState<InventoryWorkspace | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentSelection, setDepartmentSelection] = useState("");
  const [laboratoryServices, setLaboratoryServices] = useState<
    LaboratoryServiceSummary[]
  >([]);
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);
  const [selectedSpecialistRoleId, setSelectedSpecialistRoleId] = useState("");

  // Developer Debug Mode (Easter Egg) State
  const [debugMode, setDebugMode] = useState(false);
  const [activeProfileName, setActiveProfileName] = useState<string>("");
  const [debugToast, setDebugToast] = useState<string | null>(null);

  // Form input states for the Encounter phase
  const [soapInput, setSoapInput] = useState<string>("");
  const [soapDirty, setSoapDirty] = useState<boolean>(false);
  const [rxMedication, setRxMedication] = useState<string>("");
  const [rxDosage, setRxDosage] = useState<string>("");
  const [rxNote, setRxNote] = useState<string>("");
  const [certTitle, setCertTitle] = useState<string>("Medical Certificate");
  const [certStatement, setCertStatement] = useState<string>("");
  const [labServiceId, setLabServiceId] = useState<string>("");
  const [labPriority, setLabPriority] = useState<
    "routine" | "urgent" | "asap" | "stat"
  >("routine");
  const [labNote, setLabNote] = useState<string>("");
  const [referralPriority, setReferralPriority] = useState<
    "routine" | "urgent" | "asap"
  >("routine");
  const [referralNote, setReferralNote] = useState<string>("");
  const [tagStockId, setTagStockId] = useState<string>("");
  const [tagQuantity, setTagQuantity] = useState<string>("1");

  // Check persisted debug mode on client mount
  useEffect(() => {
    if (isDeveloperModeActive()) {
      setDebugMode(true);
    }
  }, []);

  const loadEncounter = useCallback(async () => {
    const client = createBrowserSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      setStatus("Your sign-in session is unavailable. Please sign in again.");
      return;
    }

    const access = await getPortalAccess(client, "provider");
    const clinicId = access.data?.organizationIds[0];
    if (access.error || !access.data?.allowed || !clinicId) {
      setStatus("This account is not authorized to record this encounter.");
      return;
    }

    const clinicalResult = await getOrganizationClinicalRecords(client, clinicId);
    if (clinicalResult.error) {
      setStatus(`Unable to load the encounter: ${clinicalResult.error.message}`);
      return;
    }
    const currentEncounter = clinicalResult.data.encounters.find(
      (item) => item.id === encounterId,
    );
    if (!currentEncounter) {
      setStatus("This encounter is unavailable in your assigned clinic.");
      return;
    }

    const patientResult = await getOrganizationPatient(
      client,
      clinicId,
      currentEncounter.patient_id,
    );
    if (patientResult.error || !patientResult.data) {
      setStatus(patientResult.error?.message ?? "The patient profile is unavailable.");
      return;
    }

    const [prescribePermission, diagnosticsPermission, inventoryPermission] =
      await Promise.all([
        hasOrganizationPermission(client, clinicId, "can_start_consultation"),
        hasOrganizationPermission(client, clinicId, "can_order_diagnostics"),
        hasOrganizationPermission(client, clinicId, "can_tag_inventory_usage"),
      ]);
    if (
      prescribePermission.error ||
      diagnosticsPermission.error ||
      inventoryPermission.error
    ) {
      setStatus(
        `Unable to load encounter permissions: ${prescribePermission.error?.message ?? diagnosticsPermission.error?.message ?? inventoryPermission.error?.message}`,
      );
      return;
    }

    const [departmentResult, inventoryResult, laboratoryResult, specialistResult] =
      await Promise.all([
        inventoryPermission.data
          ? getCurrentStaffDepartment(client, clinicId)
          : Promise.resolve(null),
        inventoryPermission.data
          ? getInventoryWorkspace(client, clinicId)
          : Promise.resolve(null),
        diagnosticsPermission.data
          ? getLaboratoryServices(client, clinicId)
          : Promise.resolve(null),
        diagnosticsPermission.data
          ? getSpecialistOptions(client, clinicId)
          : Promise.resolve(null),
      ]);
    if (
      (departmentResult && departmentResult.error) ||
      (inventoryResult && inventoryResult.error) ||
      (laboratoryResult && laboratoryResult.error) ||
      (specialistResult && specialistResult.error)
    ) {
      setStatus(
        `Unable to load encounter tools: ${departmentResult?.error?.message ?? inventoryResult?.error?.message ?? laboratoryResult?.error?.message ?? specialistResult?.error?.message}`,
      );
      return;
    }

    setOrganizationId(clinicId);
    setEncounter(currentEncounter);
    setPatient(patientResult.data);
    setRecords(clinicalResult.data);
    setCanPrescribe(prescribePermission.data);
    setCanOrderDiagnostics(diagnosticsPermission.data);
    setCanTagInventory(inventoryPermission.data);
    if (departmentResult) {
      setDepartmentId(departmentResult.data);
      setDepartmentSelection(departmentResult.data ?? "");
    }
    if (inventoryResult) setInventory(inventoryResult.data);
    if (laboratoryResult) setLaboratoryServices(laboratoryResult.data);
    if (specialistResult) setSpecialists(specialistResult.data);
    setStatus("Encounter record ready.");
  }, [encounterId]);

  useEffect(() => {
    void loadEncounter();
  }, [loadEncounter]);

  const currentSoapNote = useMemo(
    () => records?.observations.find(
      (item) => item.encounter_id === encounterId && item.code === "SOAP-NOTE",
    ),
    [encounterId, records?.observations],
  );

  // Initialize or synchronize SOAP input if not dirtied
  useEffect(() => {
    if (currentSoapNote && !soapDirty) {
      setSoapInput(clinicalText(currentSoapNote.value));
    }
  }, [currentSoapNote, soapDirty]);

  const triage = useMemo(
    () => records?.observations.find(
      (item) => item.encounter_id === encounterId && item.code === "TRIAGE-VITALS",
    ),
    [encounterId, records?.observations],
  );
  const priorEncounters = useMemo(
    () => (records?.encounters ?? [])
      .filter((item) => item.patient_id === encounter?.patient_id && item.id !== encounterId)
      .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "")),
    [encounter?.patient_id, encounterId, records?.encounters],
  );
  const patientDetails = `${patient?.birth_date ?? "Birth date not recorded"} · ${patient?.gender ?? "Gender not recorded"}`;

  // Core Test Fill function
  const applyTestFill = useCallback(
    (
      scope:
        | "all"
        | "soap"
        | "orders"
        | "rx"
        | "cert"
        | "lab"
        | "referral"
        | "tagging",
    ) => {
      const data = generateRandomEncounterData({
        laboratoryServices,
        specialists,
        inventory,
        currentDepartmentId: departmentSelection || departmentId,
      });

      setActiveProfileName(data.profile.name);

      if (scope === "all" || scope === "soap") {
        setSoapInput(data.soap);
        setSoapDirty(true);
      }

      if (scope === "all" || scope === "orders" || scope === "rx") {
        setRxMedication(data.prescription.medication);
        setRxDosage(data.prescription.dosage);
        setRxNote(data.prescription.note);
      }

      if (scope === "all" || scope === "orders" || scope === "cert") {
        setCertTitle(data.certificate.title);
        setCertStatement(data.certificate.statement);
      }

      if (scope === "all" || scope === "orders" || scope === "lab") {
        setLabServiceId(data.laboratory.serviceId);
        setLabPriority(data.laboratory.priority);
        setLabNote(data.laboratory.note);
      }

      if (scope === "all" || scope === "orders" || scope === "referral") {
        setSelectedSpecialistRoleId(data.referral.specialistRoleId);
        setReferralPriority(data.referral.priority);
        setReferralNote(data.referral.note);
      }

      if (scope === "all" || scope === "orders" || scope === "tagging") {
        if (data.inventory.departmentId && !departmentId) {
          setDepartmentSelection(data.inventory.departmentId);
        }
        setTagStockId(data.inventory.stockId);
        setTagQuantity(data.inventory.quantity);
      }

      const scopeLabels: Record<typeof scope, string> = {
        all: "All encounter inputs",
        soap: "SOAP documentation",
        orders: "All orders & charges",
        rx: "Prescription",
        cert: "Medical Certificate",
        lab: "Laboratory order",
        referral: "Specialist referral",
        tagging: "Item tagging",
      };

      setDebugToast(`✨ Test Fill applied: ${scopeLabels[scope]} (${data.profile.name})`);
      setStatus(`Test Fill generated random clinical inputs for ${data.profile.name}.`);
    },
    [
      departmentId,
      departmentSelection,
      inventory,
      laboratoryServices,
      specialists,
    ],
  );

  // Easter Egg detection in SOAP documentation textarea
  function handleSoapChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = event.target.value;
    setSoapInput(val);
    setSoapDirty(true);

    const trimmedUpper = val.trim().toUpperCase();

    // Check if the user typed or entered "ODC" (case-insensitive)
    if (trimmedUpper === "ODC") {
      setDebugMode(true);
      setDeveloperModeActive(true);
      applyTestFill("all");
      setDebugToast(
        "🎉 Easter Egg Unlocked: ODC Developer Debug Mode Activated! Test Fill executed.",
      );
      setStatus(
        "Easter Egg Active: Developer Mode unlocked and Test Fill applied across all encounter inputs.",
      );
    } else if (!debugMode && trimmedUpper.includes("ODC")) {
      setDebugMode(true);
      setDeveloperModeActive(true);
      setDebugToast(
        "🎉 Easter Egg Unlocked: ODC Developer Debug Mode Activated! Use 'Test Fill' to generate randomized inputs.",
      );
      setStatus("Easter Egg Active: Developer Mode unlocked.");
    }
  }

  function handleClearDrafts() {
    setSoapInput(currentSoapNote ? clinicalText(currentSoapNote.value) : "");
    setSoapDirty(false);
    setRxMedication("");
    setRxDosage("");
    setRxNote("");
    setCertTitle("Medical Certificate");
    setCertStatement("");
    setLabServiceId("");
    setLabPriority("routine");
    setLabNote("");
    setSelectedSpecialistRoleId("");
    setReferralPriority("routine");
    setReferralNote("");
    setTagStockId("");
    setTagQuantity("1");
    setDebugToast("Draft encounter inputs cleared.");
  }

  function handleExitDevMode() {
    setDebugMode(false);
    setDeveloperModeActive(false);
    setDebugToast(null);
    setStatus("Developer debug mode disabled.");
  }

  function previewPrescription(prescription: MedicationRequestSummary) {
    const opened = openExportPreview({
      title: "Medical Prescription",
      patientName: patient?.displayName ?? "Patient",
      patientDetails,
      issuedAt: dateTime(prescription.authored_on),
      body: [
        `Medication: ${prescription.medication_display ?? prescription.medication_code}`,
        `Directions: ${dosageText(prescription.dosage_instruction) || "Not recorded"}`,
        prescription.note ? `Note: ${prescription.note}` : "",
      ].filter(Boolean).join("\n\n"),
    });
    if (!opened) setStatus("Allow pop-ups to preview and export the prescription.");
  }

  function previewCertificate(document: DocumentReferenceSummary) {
    const opened = openExportPreview({
      title: document.content_title ?? "Medical Certificate",
      patientName: patient?.displayName ?? "Patient",
      patientDetails,
      issuedAt: dateTime(document.date_at),
      body: document.description ?? "No statement was recorded.",
    });
    if (!opened) setStatus("Allow pop-ups to preview and export the medical certificate.");
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = (soapInput || String(new FormData(event.currentTarget).get("text") ?? "")).trim();
    if (!text) return;
    setBusy(true);
    const result = await saveSoapNote(createBrowserSupabaseClient(), {
      encounterId,
      text,
      supersedesId: currentSoapNote?.id,
    });
    setBusy(false);
    if (result.error) {
      setStatus(`Unable to save the consultation note: ${result.error.message}`);
      return;
    }
    setSoapDirty(false);
    await loadEncounter();
    setStatus(
      currentSoapNote
        ? "Consultation note revision saved."
        : "Consultation note saved.",
    );
  }

  async function completeEncounter() {
    setBusy(true);
    const result = await finishClinicalEncounter(createBrowserSupabaseClient(), encounterId);
    setBusy(false);
    if (result.error) {
      setStatus(`Unable to complete encounter: ${result.error.message}`);
      return;
    }
    await loadEncounter();
    setStatus("Encounter completed and shared with the patient.");
  }

  async function issueEncounterPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const medication = (rxMedication || String(fields.get("medication") ?? "")).trim();
    const dosage = (rxDosage || String(fields.get("dosage") ?? "")).trim();
    const note = (rxNote || String(fields.get("note") ?? "")).trim();

    setBusy(true);
    const result = await issuePrescription(createBrowserSupabaseClient(), {
      encounterId,
      medication,
      dosage,
      note,
    });
    setBusy(false);
    if (result.error)
      return setStatus(`Unable to issue prescription: ${result.error.message}`);
    setRxMedication("");
    setRxDosage("");
    setRxNote("");
    form.reset();
    await loadEncounter();
    setStatus("Prescription issued.");
  }

  async function issueEncounterCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const title = (certTitle || String(fields.get("title") ?? "")).trim();
    const statement = (certStatement || String(fields.get("statement") ?? "")).trim();

    setBusy(true);
    const result = await issueMedicalCertificate(createBrowserSupabaseClient(), {
      encounterId,
      title,
      statement,
    });
    setBusy(false);
    if (result.error)
      return setStatus(`Unable to issue certificate: ${result.error.message}`);
    setCertTitle("Medical Certificate");
    setCertStatement("");
    form.reset();
    await loadEncounter();
    setStatus("Medical certificate issued.");
  }

  async function createEncounterRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const category = String(fields.get("category")) as
      | "laboratory"
      | "referral";
    const priority =
      (category === "laboratory" ? labPriority : referralPriority) ||
      (String(fields.get("priority")) as
        | "routine"
        | "urgent"
        | "asap"
        | "stat");
    const note =
      (category === "laboratory" ? labNote : referralNote) ||
      String(fields.get("note") ?? "").trim();
    const performerPractitionerRoleId =
      category === "referral"
        ? (selectedSpecialistRoleId || String(fields.get("specialistRoleId") ?? ""))
        : null;
    const laboratoryServiceId =
      category === "laboratory"
        ? (labServiceId || String(fields.get("laboratoryServiceId") ?? ""))
        : null;

    setBusy(true);
    const result = await createDiagnosticServiceRequest(
      createBrowserSupabaseClient(),
      {
        encounterId,
        category,
        priority,
        note,
        performerPractitionerRoleId,
        laboratoryServiceId,
      },
    );
    setBusy(false);
    if (result.error)
      return setStatus(`Unable to place request: ${result.error.message}`);
    form.reset();
    if (category === "laboratory") {
      setLabServiceId("");
      setLabPriority("routine");
      setLabNote("");
    } else {
      setSelectedSpecialistRoleId("");
      setReferralPriority("routine");
      setReferralNote("");
    }
    await loadEncounter();
    setStatus(
      category === "laboratory"
        ? "Laboratory order placed."
        : "Specialist referral placed.",
    );
  }

  async function tagEncounterItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const stockId = tagStockId || String(fields.get("stockId") ?? "");
    const quantity = Number(tagQuantity || fields.get("quantity"));

    setBusy(true);
    const result = await tagInventoryUsage(createBrowserSupabaseClient(), {
      encounterId,
      stockId,
      quantity,
      departmentId: departmentSelection || null,
    });
    setBusy(false);
    if (result.error)
      return setStatus(`Unable to tag consumable: ${result.error.message}`);
    setTagStockId("");
    setTagQuantity("1");
    form.reset();
    await loadEncounter();
    setStatus("Item tagged for this encounter and held for billing.");
  }

  return (
    <main className="encounter-shell">
      <header className="encounter-header">
        <div>
          <Link className="encounter-back" href="/">← Back to daily queue</Link>
          <p className="eyebrow">Focused encounter recording</p>
          <h1>{patient?.displayName ?? "Patient encounter"}</h1>
          <p>{encounter?.service_type ?? "Clinical consultation"} · Started {dateTime(encounter?.period_start ?? null)}</p>
        </div>
        <div className="encounter-header-actions">
          {debugMode && (
            <span
              className="dev-easter-egg-tag dev-easter-egg-tag--header"
              title="ODC Easter Egg Debug Mode Active"
            >
              🧪 Debug Mode Active
            </span>
          )}
          {encounter && <Badge variant={encounter.status === "in_progress" ? "success" : "muted"}>{encounter.status.replaceAll("_", " ")}</Badge>}
          {encounter?.status === "in_progress" && <Button disabled={busy} onClick={() => void completeEncounter()}>Complete encounter</Button>}
        </div>
      </header>

      {/* Developer Debug Mode Toolbar */}
      {debugMode && (
        <EncounterDevBar
          activeProfileName={activeProfileName}
          onTestFillAll={() => applyTestFill("all")}
          onTestFillSoap={() => applyTestFill("soap")}
          onTestFillOrders={() => applyTestFill("orders")}
          onClearDrafts={handleClearDrafts}
          onExitDevMode={handleExitDevMode}
        />
      )}

      {/* Easter Egg / Debug Notification Toast */}
      {debugToast && (
        <div className="encounter-dev-toast" role="status" aria-live="polite">
          <div className="dev-toast-content">
            <span className="dev-toast-icon">⚡</span>
            <span>{debugToast}</span>
          </div>
          <button
            type="button"
            className="dev-toast-close"
            onClick={() => setDebugToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      <p className="encounter-status" role="status" aria-live="polite">{status}</p>

      {encounter && patient && records && (
        <div className="encounter-layout">
          <aside className="encounter-context" aria-label="Patient context">
            <section className="encounter-context-section">
              <p className="eyebrow">Patient information</p>
              <h2>Basic information</h2>
              <dl className="patient-facts">
                <div><dt>Date of birth</dt><dd>{patient.birth_date ?? "Not recorded"} ({age(patient.birth_date)})</dd></div>
                <div><dt>Gender</dt><dd>{patient.gender ?? "Not recorded"}</dd></div>
                <div><dt>Contact</dt><dd>{jsonText(patient.telecom)}</dd></div>
                <div><dt>Address</dt><dd>{jsonText(patient.address)}</dd></div>
              </dl>
            </section>
            <section className="encounter-context-section">
              <p className="eyebrow">Current visit</p>
              <h2>Triage</h2>
              {triage ? (
                <dl className="patient-facts compact">
                  <div><dt>Blood pressure</dt><dd>{bloodPressure(triage.value)}</dd></div>
                  <div><dt>Pulse</dt><dd>{triageValue(triage.value, "pulse_bpm") || "Not recorded"} bpm</dd></div>
                  <div><dt>Temperature</dt><dd>{triageValue(triage.value, "temperature_c") || "Not recorded"} °C</dd></div>
                  <div><dt>SpO₂</dt><dd>{triageValue(triage.value, "oxygen_saturation_percent") || "Not recorded"} %</dd></div>
                  {triageValue(triage.value, "chief_complaint") && <div><dt>Chief complaint</dt><dd>{triageValue(triage.value, "chief_complaint")}</dd></div>}
                </dl>
              ) : <p className="hint">No triage assessment has been recorded for this visit.</p>}
            </section>
          </aside>

          <section className="encounter-recording" aria-labelledby="encounter-recording-heading">
            <div className="encounter-section-heading">
              <div>
                <p className="eyebrow">Current encounter</p>
                <h2 id="encounter-recording-heading">Clinical documentation</h2>
              </div>
              <div className="encounter-heading-aside">
                {debugMode && (
                  <Button
                    id="odc-soap-test-fill-btn"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => applyTestFill("soap")}
                    title="Randomly generate SOAP note"
                  >
                    ⚡ Test Fill SOAP
                  </Button>
                )}
                <span>{currentSoapNote ? "Revision" : "New note"}</span>
              </div>
            </div>
            <form className="encounter-note-form" onSubmit={saveNote}>
              <label htmlFor="encounter-soap-note">
                SOAP documentation
                {debugMode ? (
                  <span className="dev-field-badge">Dev Mode · Type ODC to randomize</span>
                ) : (
                  <span className="dev-field-hint">Tip: Type ODC for Test Fill</span>
                )}
              </label>
              <textarea
                id="encounter-soap-note"
                key={currentSoapNote?.id ?? encounterId}
                name="text"
                rows={18}
                maxLength={20000}
                value={soapInput}
                onChange={handleSoapChange}
                placeholder={"Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:\n\n(Easter egg: Type 'ODC' to activate Developer Test Fill)"}
                required
              />
              <div className="encounter-note-actions">
                <p>Saved notes are versioned in the patient record.</p>
                <div className="encounter-note-btn-group">
                  {debugMode && (
                    <Button
                      id="odc-note-all-fill-btn"
                      type="button"
                      variant="outline"
                      onClick={() => applyTestFill("all")}
                      title="Randomly populate all encounter inputs"
                    >
                      ⚡ Test Fill All
                    </Button>
                  )}
                  <Button disabled={busy || encounter.status !== "in_progress"} type="submit">
                    {busy ? "Saving…" : "Save consultation note"}
                  </Button>
                </div>
              </div>
            </form>

            {encounter.status === "in_progress" && (
              <section className="encounter-actions" aria-labelledby="encounter-actions-heading">
                <div className="encounter-section-heading">
                  <div>
                    <p className="eyebrow">Orders and charges</p>
                    <h2 id="encounter-actions-heading">Encounter actions</h2>
                  </div>
                  <div className="encounter-heading-aside">
                    {debugMode && (
                      <Button
                        id="odc-orders-test-fill-btn"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => applyTestFill("orders")}
                        title="Randomly populate all order and charge forms"
                      >
                        ⚡ Test Fill All Orders
                      </Button>
                    )}
                    <span>Permission-based</span>
                  </div>
                </div>
                <div className="encounter-actions-grid">
                  {canPrescribe && (
                    <section className="encounter-action-card">
                      <div className="encounter-card-header">
                        <h3>Prescription</h3>
                        {debugMode && (
                          <button
                            type="button"
                            id="odc-rx-fill-btn"
                            className="encounter-card-fill-btn"
                            onClick={() => applyTestFill("rx")}
                            title="Randomly generate prescription inputs"
                          >
                            ⚡ Test Fill
                          </button>
                        )}
                      </div>
                      <form className="stack" onSubmit={issueEncounterPrescription}>
                        <Field label="Medication">
                          <Input
                            id="odc-rx-medication"
                            name="medication"
                            maxLength={240}
                            autoComplete="off"
                            value={rxMedication}
                            onChange={(e) => setRxMedication(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Dosage and directions">
                          <textarea
                            id="odc-rx-dosage"
                            className="odyssey-input"
                            name="dosage"
                            rows={3}
                            maxLength={1000}
                            value={rxDosage}
                            onChange={(e) => setRxDosage(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Note">
                          <Input
                            id="odc-rx-note"
                            name="note"
                            maxLength={1000}
                            value={rxNote}
                            onChange={(e) => setRxNote(e.target.value)}
                          />
                        </Field>
                        <Button disabled={busy} type="submit">Issue prescription</Button>
                      </form>
                      <CurrentRecords title="Issued prescriptions" items={records.medicationRequests.filter((item) => item.encounter_id === encounterId)} render={(item) => <><strong>{item.medication_display ?? item.medication_code}</strong><p>{dosageText(item.dosage_instruction)}</p>{item.note && <p>{item.note}</p>}<Button className="encounter-export-button" onClick={() => previewPrescription(item)} size="sm" type="button" variant="outline">Preview and export</Button></>} />
                    </section>
                  )}
                  {canPrescribe && (
                    <section className="encounter-action-card">
                      <div className="encounter-card-header">
                        <h3>Medical certificate</h3>
                        {debugMode && (
                          <button
                            type="button"
                            id="odc-cert-fill-btn"
                            className="encounter-card-fill-btn"
                            onClick={() => applyTestFill("cert")}
                            title="Randomly generate medical certificate inputs"
                          >
                            ⚡ Test Fill
                          </button>
                        )}
                      </div>
                      <form className="stack" onSubmit={issueEncounterCertificate}>
                        <Field label="Certificate title">
                          <Input
                            id="odc-cert-title"
                            name="title"
                            value={certTitle}
                            onChange={(e) => setCertTitle(e.target.value)}
                            maxLength={200}
                            required
                          />
                        </Field>
                        <Field label="Statement">
                          <textarea
                            id="odc-cert-statement"
                            className="odyssey-input"
                            name="statement"
                            rows={5}
                            maxLength={5000}
                            value={certStatement}
                            onChange={(e) => setCertStatement(e.target.value)}
                            required
                          />
                        </Field>
                        <Button disabled={busy} type="submit">Issue certificate</Button>
                      </form>
                      <CurrentRecords title="Issued medical certificates" items={records.documentReferences.filter((item) => item.encounter_id === encounterId && item.type_code === "medical-certificate")} render={(item) => <><strong>{item.content_title ?? item.type_display ?? "Medical certificate"}</strong><p>{item.description ?? "No description recorded."}</p><Button className="encounter-export-button" onClick={() => previewCertificate(item)} size="sm" type="button" variant="outline">Preview and export</Button></>} />
                    </section>
                  )}
                  {canOrderDiagnostics && (
                    <section className="encounter-action-card">
                      <div className="encounter-card-header">
                        <h3>Laboratory order</h3>
                        {debugMode && (
                          <button
                            type="button"
                            id="odc-lab-fill-btn"
                            className="encounter-card-fill-btn"
                            onClick={() => applyTestFill("lab")}
                            title="Randomly generate laboratory order inputs"
                          >
                            ⚡ Test Fill
                          </button>
                        )}
                      </div>
                      <form className="stack" onSubmit={createEncounterRequest}>
                        <input name="category" type="hidden" value="laboratory" />
                        <Field label="Laboratory service">
                          <select
                            id="odc-lab-service-select"
                            className="odyssey-input"
                            name="laboratoryServiceId"
                            value={labServiceId}
                            onChange={(e) => setLabServiceId(e.target.value)}
                            required
                          >
                            <option disabled value="">Select a laboratory service</option>
                            {laboratoryServices.filter((service) => service.active).map((service) => (
                              <option key={service.id} value={service.id}>
                                {service.name} · PHP {service.labCost.toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <PriorityField
                          value={labPriority}
                          onChange={(val) => setLabPriority(val)}
                        />
                        <Field label="Clinical note">
                          <textarea
                            id="odc-lab-note"
                            className="odyssey-input"
                            name="note"
                            rows={3}
                            maxLength={5000}
                            value={labNote}
                            onChange={(e) => setLabNote(e.target.value)}
                          />
                        </Field>
                        <Button disabled={busy} type="submit">Place lab order</Button>
                      </form>
                    </section>
                  )}
                  {canOrderDiagnostics && (
                    <section className="encounter-action-card">
                      <div className="encounter-card-header">
                        <h3>Specialist referral</h3>
                        {debugMode && (
                          <button
                            type="button"
                            id="odc-referral-fill-btn"
                            className="encounter-card-fill-btn"
                            onClick={() => applyTestFill("referral")}
                            title="Randomly generate specialist referral inputs"
                          >
                            ⚡ Test Fill
                          </button>
                        )}
                      </div>
                      <form className="stack" onSubmit={createEncounterRequest}>
                        <input name="category" type="hidden" value="referral" />
                        <Field label="Specialist" hint="The affiliated clinic or hospital is shown with each specialist.">
                          <select
                            id="odc-referral-specialist-select"
                            className="odyssey-input"
                            name="specialistRoleId"
                            value={selectedSpecialistRoleId}
                            onChange={(event) => setSelectedSpecialistRoleId(event.target.value)}
                            required
                          >
                            <option disabled value="">Select a specialist</option>
                            {specialists.map((specialist) => (
                              <option key={specialist.practitionerRoleId} value={specialist.practitionerRoleId}>
                                {specialist.displayName} · {specialist.organizationName}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <PriorityField
                          value={referralPriority}
                          onChange={(val) => setReferralPriority(val as "routine" | "urgent" | "asap")}
                        />
                        <Field label="Clinical note">
                          <textarea
                            id="odc-referral-note"
                            className="odyssey-input"
                            name="note"
                            rows={3}
                            maxLength={5000}
                            value={referralNote}
                            onChange={(e) => setReferralNote(e.target.value)}
                          />
                        </Field>
                        <Button disabled={busy} type="submit">Place referral</Button>
                      </form>
                    </section>
                  )}
                  {canTagInventory && (
                    <section className="encounter-action-card">
                      <div className="encounter-card-header">
                        <h3>Item tagging</h3>
                        {debugMode && (
                          <button
                            type="button"
                            id="odc-tag-fill-btn"
                            className="encounter-card-fill-btn"
                            onClick={() => applyTestFill("tagging")}
                            title="Randomly select available stock and quantity"
                          >
                            ⚡ Test Fill
                          </button>
                        )}
                      </div>
                      <p className="hint">Tagging holds the item for this patient and adds it to the draft bill.</p>
                      <form className="stack" onSubmit={tagEncounterItem}>
                        <Field label="Department">
                          <select
                            id="odc-tag-department-select"
                            className="odyssey-input"
                            name="departmentId"
                            value={departmentSelection}
                            onChange={(event) => setDepartmentSelection(event.target.value)}
                            disabled={Boolean(departmentId)}
                            required
                          >
                            <option disabled value="">Select a department</option>
                            {inventory?.departments.filter((department) => department.active).map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name} ({department.code})
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Item and available stock">
                          <select
                            id="odc-tag-stock-select"
                            className="odyssey-input"
                            name="stockId"
                            value={tagStockId}
                            onChange={(e) => setTagStockId(e.target.value)}
                            required
                          >
                            <option disabled value="">Select available stock</option>
                            {inventory?.stock.filter((stock) => Number(stock.quantity) > 0 && (!departmentSelection || stock.department_id === departmentSelection)).map((stock) => {
                              const item = inventory.items.find((candidate) => candidate.id === stock.item_id);
                              const department = inventory.departments.find((candidate) => candidate.id === stock.department_id);
                              return (
                                <option key={stock.id} value={stock.id}>
                                  {item?.name ?? "Item"} · {department?.name ?? "Department"} ({Number(stock.quantity).toLocaleString()} {item?.unit_of_measure ?? "units"})
                                </option>
                              );
                            })}
                          </select>
                        </Field>
                        <Field label="Quantity used">
                          <Input
                            id="odc-tag-quantity"
                            name="quantity"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={tagQuantity}
                            onChange={(e) => setTagQuantity(e.target.value)}
                            required
                          />
                        </Field>
                        <Button disabled={busy} type="submit">Tag item</Button>
                      </form>
                      <CurrentRecords title="Tagged items" items={(inventory?.usages ?? []).filter((usage) => usage.encounter_id === encounterId)} render={(usage) => { const item = inventory?.items.find((candidate) => candidate.id === usage.item_id); return <><strong>{item?.name ?? "Item"}</strong><p>{Number(usage.quantity).toLocaleString()} {item?.unit_of_measure ?? "units"} · {usage.currency} {(Number(usage.unit_price) * Number(usage.quantity)).toFixed(2)}</p></>; }} />
                    </section>
                  )}
                </div>
                {canOrderDiagnostics && <CurrentRecords title="Current orders and referrals" items={records.serviceRequests.filter((item) => item.encounter_id === encounterId)} render={(item) => <><strong>{item.code_display ?? item.code}</strong><p>{item.category} · {item.status.replaceAll("_", " ")}</p>{item.note && <p>{item.note}</p>}</>} />}
              </section>
            )}

            <section className="encounter-history" aria-labelledby="medical-history-heading">
              <div className="encounter-section-heading">
                <div><p className="eyebrow">Longitudinal record</p><h2 id="medical-history-heading">Previous medical history</h2></div>
                <span>{priorEncounters.length} earlier {priorEncounters.length === 1 ? "encounter" : "encounters"}</span>
              </div>
              {!priorEncounters.length ? <p className="hint">No earlier encounters are recorded at this clinic.</p> : priorEncounters.map((prior) => (
                <HistoricalEncounter encounter={prior} key={prior.id} records={records} />
              ))}
            </section>
          </section>
        </div>
      )}
    </main>
  );
}

function HistoricalEncounter({ encounter, records }: { encounter: EncounterSummary; records: OrganizationClinicalRecords }) {
  const observations = records.observations.filter((item) => item.encounter_id === encounter.id);
  const medications = records.medicationRequests.filter((item) => item.encounter_id === encounter.id);
  const documents = records.documentReferences.filter((item) => item.encounter_id === encounter.id);
  const requests = records.serviceRequests.filter((item) => item.encounter_id === encounter.id);
  const reports = records.diagnosticReports.filter((item) => item.encounter_id === encounter.id);
  return (
    <details className="history-encounter">
      <summary>
        <span><strong>{encounter.service_type ?? "Clinical visit"}</strong><small>{dateTime(encounter.period_start)} · {encounter.status.replaceAll("_", " ")}</small></span>
        <span className="history-count">{observations.length + medications.length + documents.length + requests.length + reports.length} record{observations.length + medications.length + documents.length + requests.length + reports.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="history-entries">
        {observations.map((item) => <article key={item.id}><strong>{item.code_display ?? item.code}</strong><p>{clinicalText(item.value) || item.note || "No narrative recorded."}</p></article>)}
        {medications.map((item) => <article key={item.id}><strong>Prescription: {item.medication_display ?? item.medication_code}</strong><p>{dosageText(item.dosage_instruction)}</p>{item.note && <p>{item.note}</p>}</article>)}
        {documents.map((item) => <article key={item.id}><strong>{item.content_title ?? item.type_display ?? "Clinical document"}</strong><p>{item.description ?? "No description recorded."}</p></article>)}
        {requests.map((item) => <article key={item.id}><strong>{item.category.replaceAll("_", " ")}: {item.code_display ?? item.code}</strong><p>{item.status.replaceAll("_", " ")} · {item.priority ?? "routine"}</p>{item.note && <p>{item.note}</p>}</article>)}
        {reports.map((item) => <article key={item.id}><strong>Diagnostic report: {item.code_display ?? item.code}</strong><p>{item.conclusion ?? "No conclusion recorded."}</p></article>)}
      </div>
    </details>
  );
}

function PriorityField({
  value = "routine",
  onChange,
}: {
  value?: "routine" | "urgent" | "asap" | "stat";
  onChange?: (val: "routine" | "urgent" | "asap" | "stat") => void;
}) {
  return (
    <Field label="Priority">
      <select
        className="odyssey-input"
        name="priority"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value as "routine" | "urgent" | "asap" | "stat") : undefined}
      >
        <option value="routine">Routine</option>
        <option value="urgent">Urgent</option>
        <option value="asap">ASAP</option>
        <option value="stat">STAT</option>
      </select>
    </Field>
  );
}

function CurrentRecords<T extends { id: string }>({
  title,
  items,
  render,
}: {
  title: string;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <div className="encounter-current-records">
      <h4>{title}</h4>
      {items.map((item) => <article key={item.id}>{render(item)}</article>)}
    </div>
  );
}
