"use client";

/**
 * Odyssey Healthcare OS - Focused Encounter Recording Screen
 *
 * BREAKPOINT / ORIENTATION MATRIX:
 * ---------------------------------------------------------------------------------------------------------------------
 * Device / Breakpoint           | Documentation Mode | Macro Layout Structure | Panel Behavior
 * ---------------------------------------------------------------------------------------------------------------------
 * <768px (Phone)                | Auto-forced Simple | 1-Column Stacked       | Patient/vitals collapsible drawer,
 *                               | (read-only switch) |                        | full-width SOAP note, stacked actions.
 * ---------------------------------------------------------------------------------------------------------------------
 * 768–1024px Portrait           | Doctor Selectable  | 2-Zone Vertical Stack  | Zone 1 (Top): Collapsible patient/vitals
 * (Tablet Portrait, iPad P)     | (Persisted pref)   |                        | Zone 2 (Bottom): Documentation workspace
 *                               |                    |                        | full width; figure & region stack.
 * ---------------------------------------------------------------------------------------------------------------------
 * 768–1024px Landscape          | Doctor Selectable  | 3-Column Grid          | Col 1 (22%, min 280px): Sticky vitals/pt
 * (iPad / Tablet Landscape)     | (Persisted pref)   | (Proportional fr)      | Col 2 (1fr): Flex-scaled anatomy figure
 *                               |                    |                        | Col 3 (26%, min 260px): Region panel.
 * ---------------------------------------------------------------------------------------------------------------------
 * 1024–1366px Landscape         | Doctor Selectable  | 3-Column Grid          | Vitals cards reflow 2-up in Col 1;
 * (Small Laptop / iPad Pro L)   | (Persisted pref)   | (Expanded breathing)   | Orders form reflows to 2-col fields.
 * ---------------------------------------------------------------------------------------------------------------------
 * >1366px (Desktop)             | Doctor Selectable  | 3-Column Fluid Grid    | Middle documentation panel (1fr) grows
 *                               | (Persisted pref)   | (Zero dead gutters)    | to absorb space without dead margins.
 * ---------------------------------------------------------------------------------------------------------------------
 * Sizing governed by @container encounter (inline-size) with @media (orientation: landscape) guards.
 */

import {
  createDiagnosticServiceRequest,
  createBrowserSupabaseClient,
  createPatientQrPayload,
  finishClinicalEncounter,
  getCurrentStaffDepartment,
  getInventoryWorkspace,
  getLaboratoryServices,
  getMyEncounterViewMode,
  getOrganizationClinicalRecords,
  getOrganizationPatient,
  getPatientCoverages,
  getPortalAccess,
  getSpecialistOptions,
  hasOrganizationPermission,
  issueMedicalCertificate,
  issuePrescription,
  recordEncounterRegionDiagnosis,
  saveMyEncounterViewMode,
  saveSoapNote,
  tagInventoryUsage,
} from "@odyssey/supabase-client";
import type {
  EncounterSummary,
  EncounterViewMode,
  AnatomyView,
  CoverageSummary,
  EncounterRegionDiagnosis,
  DocumentReferenceSummary,
  InventoryWorkspace,
  LaboratoryServiceSummary,
  MedicationRequestSummary,
  OrganizationClinicalRecords,
  PatientSummary,
  SpecialistOption,
} from "@odyssey/types";
import { getEncounterRegionDiagnoses } from "@odyssey/types";
import {
  Badge,
  buildClinicalVitalReadings,
  Button,
  ClinicalPatientCard,
  ClinicalVitalsPanel,
  Field,
  Input,
  MUSCULOSKELETAL_REGIONS,
  MusculoskeletalFigure,
  MusculoskeletalRegionPanel,
  AccessState,
  type BodyRegionDefinition,
} from "@odyssey/ui";
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
import { EncounterSoapEditor } from "../../components/EncounterSoapEditor";
import { ClinicalDocumentationWorkspace } from "../../components/ClinicalDocumentationWorkspace";
import { ClinicalOrdersAndCharges } from "../../components/ClinicalOrdersAndCharges";
import { LongitudinalRecord } from "../../components/LongitudinalRecord";
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

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function dosageText(value: unknown): string {
  return Array.isArray(value) ? clinicalText(value[0]) : "";
}

function jsonDisplay(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["display", "name", "text", "value"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

type EncounterAction =
  | "prescription"
  | "certificate"
  | "laboratory"
  | "referral"
  | "tagging";

type EncounterAccessState = "loading" | "unauthorized" | "error" | "ready";

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
  const [accessState, setAccessState] = useState<EncounterAccessState>("loading");
  const [encounter, setEncounter] = useState<EncounterSummary | null>(null);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [records, setRecords] = useState<OrganizationClinicalRecords | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [coverages, setCoverages] = useState<CoverageSummary[]>([]);
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
  const [preferredMode, setPreferredMode] = useState<EncounterViewMode>("visual");
  const [forceSimpleMode, setForceSimpleMode] = useState(false);
  const [anatomyView, setAnatomyView] = useState<AnatomyView>("front");
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionDefinition>(
    MUSCULOSKELETAL_REGIONS.find((region) => region.code === "chest") ?? { code: "chest", display: "Chest" },
  );
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<EncounterAction>("prescription");
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");

  // Check persisted debug mode on client mount
  useEffect(() => {
    if (isDeveloperModeActive()) {
      setDebugMode(true);
    }
  }, []);

  useEffect(() => {
    // Phone threshold is strictly < 768px. Tablets (768px+) and desktop remain doctor-selectable.
    const mobile = window.matchMedia("(max-width: 767px)");
    const update = () => setForceSimpleMode(mobile.matches);
    update();
    mobile.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
    };
  }, []);

  const loadEncounter = useCallback(async () => {
    setAccessState("loading");
    setEncounter(null);
    setPatient(null);
    setRecords(null);
    setOrganizationId(null);
    setCoverages([]);
    const client = createBrowserSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      setAccessState("unauthorized");
      setStatus("Sign-in is required to view this encounter.");
      return;
    }

    const access = await getPortalAccess(client, "provider");
    if (access.error) {
      setAccessState("error");
      setStatus("We could not verify your encounter access.");
      return;
    }
    if (!access.data?.allowed || !access.data.organizationIds.length) {
      setAccessState("unauthorized");
      setStatus("This account is not authorized to record this encounter.");
      return;
    }

    const permissionResults = await Promise.all(
      access.data.organizationIds.map((candidateOrganizationId) =>
        hasOrganizationPermission(
          client,
          candidateOrganizationId,
          "can_start_consultation",
        ),
      ),
    );
    const permissionError = permissionResults.find((result) => result.error)?.error;
    if (permissionError) {
      setAccessState("error");
      setStatus("We could not verify your encounter access.");
      return;
    }
    const authorizedOrganizationIds = access.data.organizationIds.filter(
      (_candidateOrganizationId, index) => permissionResults[index]?.data,
    );
    if (!authorizedOrganizationIds.length) {
      setAccessState("unauthorized");
      setStatus("You do not have permission to record this encounter.");
      return;
    }

    const encounterLookups = await Promise.all(
      authorizedOrganizationIds.map((candidateOrganizationId) =>
        client
          .from("encounters")
          .select("id, organization_id")
          .eq("id", encounterId)
          .eq("organization_id", candidateOrganizationId)
          .maybeSingle(),
      ),
    );
    const lookupError = encounterLookups.find((result) => result.error)?.error;
    if (lookupError) {
      setAccessState("error");
      setStatus("We could not verify your encounter access.");
      return;
    }
    const clinicId = encounterLookups.find((result) => result.data)?.data?.organization_id;
    if (!clinicId) {
      setAccessState("unauthorized");
      setStatus("This encounter is not available to your account.");
      return;
    }

    const clinicalResult = await getOrganizationClinicalRecords(client, clinicId);
    if (clinicalResult.error) {
      setAccessState("error");
      setStatus("We could not load this encounter securely.");
      return;
    }
    const currentEncounter = clinicalResult.data.encounters.find(
      (item) => item.id === encounterId,
    );
    if (!currentEncounter) {
      setAccessState("unauthorized");
      setStatus("This encounter is unavailable in your assigned clinic.");
      return;
    }

    const patientResult = await getOrganizationPatient(
      client,
      clinicId,
      currentEncounter.patient_id,
    );
    if (patientResult.error || !patientResult.data) {
      setAccessState("error");
      setStatus("We could not load this encounter securely.");
      return;
    }

    const [coverageResult, preferenceResult] = await Promise.all([
      getPatientCoverages(client, clinicId, currentEncounter.patient_id),
      getMyEncounterViewMode(client),
    ]);

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
      setAccessState("error");
      setStatus("We could not verify the encounter tools securely.");
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
      setAccessState("error");
      setStatus("We could not load the encounter tools securely.");
      return;
    }

    setOrganizationId(clinicId);
    setEncounter(currentEncounter);
    setPatient(patientResult.data);
    setCoverages(coverageResult.error ? [] : coverageResult.data);
    if (!preferenceResult.error) setPreferredMode(preferenceResult.data);
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
    setAccessState("ready");
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

  const priorEncounters = useMemo(
    () => (records?.encounters ?? [])
      .filter((item) => item.patient_id === encounter?.patient_id && item.id !== encounterId)
      .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "")),
    [encounter?.patient_id, encounterId, records?.encounters],
  );
  const filteredPriorEncounters = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return priorEncounters;
    return priorEncounters.filter((prior) => {
      const related = [
        prior.service_type,
        prior.status,
        ...records?.observations.filter((item) => item.encounter_id === prior.id).flatMap((item) => [item.code, item.code_display, clinicalText(item.value), item.note]) ?? [],
        ...records?.medicationRequests.filter((item) => item.encounter_id === prior.id).flatMap((item) => [item.medication_display, item.medication_code, item.note]) ?? [],
        ...records?.documentReferences.filter((item) => item.encounter_id === prior.id).flatMap((item) => [item.content_title, item.description]) ?? [],
        ...records?.serviceRequests.filter((item) => item.encounter_id === prior.id).flatMap((item) => [item.code_display, item.code, item.note]) ?? [],
      ];
      return related.some((value) => value?.toLowerCase().includes(query));
    });
  }, [historyQuery, priorEncounters, records]);
  const effectiveMode: EncounterViewMode = forceSimpleMode ? "simple" : preferredMode;
  const activeCoverage = coverages.find((coverage) => coverage.status === "active") ?? coverages[0] ?? null;
  const regionDiagnoses = useMemo<EncounterRegionDiagnosis[]>(
    () => (records?.encounters ?? [])
      .filter((item) => item.patient_id === encounter?.patient_id)
      .flatMap(getEncounterRegionDiagnoses),
    [encounter?.patient_id, records?.encounters],
  );
  const patientObservations = useMemo(
    () => (records?.observations ?? []).filter((observation) => observation.patient_id === encounter?.patient_id),
    [encounter?.patient_id, records?.observations],
  );
  const vitalReadings = useMemo(
    () => buildClinicalVitalReadings(patientObservations),
    [patientObservations],
  );
  const patientDetails = `${patient?.birth_date ?? "Birth date not recorded"} · ${patient?.gender ?? "Gender not recorded"}`;
  const completionBlocker = !currentSoapNote
    ? "Save clinical documentation before completing this encounter."
    : soapDirty
      ? "Save or discard the current documentation changes before completing."
      : null;

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
  function handleSoapChange(val: string) {
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

  async function selectEncounterMode(mode: EncounterViewMode) {
    if (forceSimpleMode && mode === "visual") return;
    setPreferredMode(mode);
    const result = await saveMyEncounterViewMode(createBrowserSupabaseClient(), mode);
    if (result.error) setStatus(`Unable to save view preference: ${result.error.message}`);
  }

  async function addRegionDiagnosis(text: string) {
    setDiagnosisBusy(true);
    const result = await recordEncounterRegionDiagnosis(createBrowserSupabaseClient(), {
      encounterId,
      regionCode: selectedRegion.code,
      regionDisplay: selectedRegion.display,
      anatomyView,
      diagnosisText: text,
    });
    setDiagnosisBusy(false);
    if (result.error) {
      setStatus(`Unable to add diagnosis: ${result.error.message}`);
      return;
    }
    await loadEncounter();
    setStatus(`${selectedRegion.display} diagnosis added to this encounter.`);
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
    if (completionBlocker) {
      setStatus(completionBlocker);
      return;
    }
    setBusy(true);
    const result = await finishClinicalEncounter(createBrowserSupabaseClient(), encounterId);
    setBusy(false);
    if (result.error) {
      setStatus(`Unable to complete encounter: ${result.error.message}`);
      return;
    }
    await loadEncounter();
    setCompletionDialogOpen(false);
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

  if (accessState !== "ready") {
    return (
      <AccessState
        actionHref="/"
        actionLabel="Return to provider workspace"
        description={
          accessState === "loading"
            ? "We are verifying your clinical permissions."
            : accessState === "unauthorized"
              ? "You do not have permission to view or record this encounter. A link alone does not grant access."
              : "We could not securely verify this encounter. Please return to the provider workspace and try again."
        }
        eyebrow="Encounter recording"
        variant={accessState}
      />
    );
  }

  return (
    <main className="encounter-shell">
      <header className="encounter-header">
        <div>
          <Link className="encounter-back" href="/">← Back to daily queue</Link>
          <p className="eyebrow">Focused encounter recording</p>
          <h1>{patient?.displayName ?? "Patient encounter"}</h1>
          <p>{encounter?.service_type ?? "Clinical consultation"} · {patientDetails} · Started {dateTime(encounter?.period_start ?? null)}</p>
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
          {encounter?.status === "in_progress" && (
            <div className="encounter-completion-control">
              <Button
                disabled={busy || Boolean(completionBlocker)}
                onClick={() => setCompletionDialogOpen(true)}
                title={completionBlocker ?? "Review completion before closing the encounter"}
              >
                Complete encounter
              </Button>
              {completionBlocker ? <span>{completionBlocker}</span> : null}
            </div>
          )}
        </div>
      </header>

      <dialog className="encounter-completion-dialog" onCancel={() => setCompletionDialogOpen(false)} open={completionDialogOpen}>
        <form method="dialog">
          <p className="eyebrow">Close encounter</p>
          <h2>Complete this encounter?</h2>
          <p>The note is saved and this action shares the completed record with the patient. Orders and documents already added remain attached to this encounter.</p>
          <div>
            <Button onClick={() => setCompletionDialogOpen(false)} type="button" variant="outline">Keep documenting</Button>
            <Button disabled={busy} onClick={() => void completeEncounter()} type="button">{busy ? "Completing…" : "Complete encounter"}</Button>
          </div>
        </form>
      </dialog>

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
          <aside className="encounter-context" aria-label="Patient details and vitals">
            <details className="encounter-context-drawer" open>
              <summary className="encounter-context-drawer__summary">
                <div className="encounter-context-drawer__header">
                  <span className="eyebrow">Patient &amp; vitals</span>
                  <strong>{patient.displayName}</strong>
                  <span className="encounter-context-drawer__meta">{patientDetails}</span>
                </div>
                <span className="encounter-context-drawer__chevron" aria-hidden="true">▾</span>
              </summary>
              <div className="encounter-context-drawer__content">
                <ClinicalPatientCard
                  bloodType={patient.blood_type}
                  birthDate={patient.birth_date}
                  compact
                  displayName={patient.displayName}
                  gender={patient.gender}
                  photoUrl={patient.photo_url}
                  planName={jsonDisplay(activeCoverage?.payor) ?? activeCoverage?.coverage_type?.replaceAll("_", " ")}
                  policyNumber={activeCoverage?.subscriber_id}
                  qrPayload={createPatientQrPayload(organizationId ?? encounter.organization_id, patient.id)}
                />
                <ClinicalVitalsPanel readings={vitalReadings} />
              </div>
            </details>
          </aside>

          <section className="encounter-recording" aria-labelledby="encounter-recording-heading">
            <ClinicalDocumentationWorkspace
              forceSimpleMode={forceSimpleMode}
              headingId="encounter-recording-heading"
              mode={effectiveMode}
              onModeChange={(mode) => void selectEncounterMode(mode)}
              simpleContent={
                <EncounterSoapEditor
                  busy={busy}
                  canEdit={encounter.status === "in_progress"}
                  currentNoteId={currentSoapNote?.id}
                  debugMode={debugMode}
                  encounterId={encounterId}
                  onChange={handleSoapChange}
                  onSubmit={saveNote}
                  onTestFillAll={() => applyTestFill("all")}
                  onTestFillSoap={() => applyTestFill("soap")}
                  value={soapInput}
                />
              }
              visualContent={
                <section className="encounter-assessment-workspace" aria-label="Visual assessment workspace">
                <MusculoskeletalFigure
                  activeRegionCodes={[...new Set(regionDiagnoses.map((diagnosis) => diagnosis.regionCode))]}
                  anatomyView={anatomyView}
                  onRegionSelect={setSelectedRegion}
                  onViewChange={setAnatomyView}
                  selectedRegionCode={selectedRegion.code}
                />
                <MusculoskeletalRegionPanel
                  busy={diagnosisBusy}
                  diagnoses={regionDiagnoses}
                  encounterOpen={encounter.status === "in_progress"}
                  onDiagnosisSubmit={addRegionDiagnosis}
                  onRegionChange={setSelectedRegion}
                  selectedRegion={selectedRegion}
                />
              </section>
              }
            />

            {encounter.status === "in_progress" && (
              <ClinicalOrdersAndCharges
                actions={[
                  ...(canPrescribe ? [{ id: "prescription" as const, label: "Prescription" }, { id: "certificate" as const, label: "Medical certificate" }] : []),
                  ...(canOrderDiagnostics ? [{ id: "laboratory" as const, label: "Laboratory order" }, { id: "referral" as const, label: "Specialist referral" }] : []),
                  ...(canTagInventory ? [{ id: "tagging" as const, label: "Item tagging" }] : []),
                ]}
                activeAction={activeAction}
                onActionChange={setActiveAction}
                headingAside={
                    debugMode ? (
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
                    ) : null
                }
              >
                <div className="encounter-actions-grid">
                  {canPrescribe && activeAction === "prescription" && (
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
                      <form className="stack encounter-action-form" onSubmit={issueEncounterPrescription}>
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
                        <Field className="encounter-field-full" label="Note">
                          <Input
                            id="odc-rx-note"
                            name="note"
                            maxLength={1000}
                            value={rxNote}
                            onChange={(e) => setRxNote(e.target.value)}
                          />
                        </Field>
                        <Button className="encounter-form-submit" disabled={busy} type="submit">Issue prescription</Button>
                      </form>
                      <CurrentRecords title="Issued prescriptions" items={records.medicationRequests.filter((item) => item.encounter_id === encounterId)} render={(item) => <><strong>{item.medication_display ?? item.medication_code}</strong><p>{dosageText(item.dosage_instruction)}</p>{item.note && <p>{item.note}</p>}<Button className="encounter-export-button" onClick={() => previewPrescription(item)} size="sm" type="button" variant="outline">Preview and export</Button></>} />
                    </section>
                  )}
                  {canPrescribe && activeAction === "certificate" && (
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
                      <form className="stack encounter-action-form" onSubmit={issueEncounterCertificate}>
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
                        <Field className="encounter-field-full" label="Statement">
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
                        <Button className="encounter-form-submit" disabled={busy} type="submit">Issue certificate</Button>
                      </form>
                      <CurrentRecords title="Issued medical certificates" items={records.documentReferences.filter((item) => item.encounter_id === encounterId && item.type_code === "medical-certificate")} render={(item) => <><strong>{item.content_title ?? item.type_display ?? "Medical certificate"}</strong><p>{item.description ?? "No description recorded."}</p><Button className="encounter-export-button" onClick={() => previewCertificate(item)} size="sm" type="button" variant="outline">Preview and export</Button></>} />
                    </section>
                  )}
                  {canOrderDiagnostics && activeAction === "laboratory" && (
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
                      <form className="stack encounter-action-form" onSubmit={createEncounterRequest}>
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
                        <Field className="encounter-field-full" label="Clinical note">
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
                        <Button className="encounter-form-submit" disabled={busy} type="submit">Place lab order</Button>
                      </form>
                    </section>
                  )}
                  {canOrderDiagnostics && activeAction === "referral" && (
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
                      <form className="stack encounter-action-form" onSubmit={createEncounterRequest}>
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
                        <Field className="encounter-field-full" label="Clinical note">
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
                        <Button className="encounter-form-submit" disabled={busy} type="submit">Place referral</Button>
                      </form>
                    </section>
                  )}
                  {canTagInventory && activeAction === "tagging" && (
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
                      <form className="stack encounter-action-form" onSubmit={tagEncounterItem}>
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
                        <Button className="encounter-form-submit" disabled={busy} type="submit">Tag item</Button>
                      </form>
                      <CurrentRecords title="Tagged items" items={(inventory?.usages ?? []).filter((usage) => usage.encounter_id === encounterId)} render={(usage) => { const item = inventory?.items.find((candidate) => candidate.id === usage.item_id); return <><strong>{item?.name ?? "Item"}</strong><p>{Number(usage.quantity).toLocaleString()} {item?.unit_of_measure ?? "units"} · {usage.currency} {(Number(usage.unit_price) * Number(usage.quantity)).toFixed(2)}</p></>; }} />
                    </section>
                  )}
                </div>
                {canOrderDiagnostics && <CurrentRecords title="Current orders and referrals" items={records.serviceRequests.filter((item) => item.encounter_id === encounterId)} render={(item) => <><strong>{item.code_display ?? item.code}</strong><p>{item.category} · {item.status.replaceAll("_", " ")}</p>{item.note && <p>{item.note}</p>}</>} />}
                <section className="encounter-added-actions" aria-labelledby="encounter-added-actions-heading">
                  <h3 id="encounter-added-actions-heading">Added to this encounter</h3>
                  <ul>
                    {records.medicationRequests.filter((item) => item.encounter_id === encounterId).map((item) => <li key={`rx-${item.id}`}>Prescription: {item.medication_display ?? item.medication_code}</li>)}
                    {records.documentReferences.filter((item) => item.encounter_id === encounterId && item.type_code === "medical-certificate").map((item) => <li key={`certificate-${item.id}`}>Certificate: {item.content_title ?? item.type_display ?? "Medical certificate"}</li>)}
                    {records.serviceRequests.filter((item) => item.encounter_id === encounterId).map((item) => <li key={`request-${item.id}`}>{item.category.replaceAll("_", " ")}: {item.code_display ?? item.code}</li>)}
                    {(inventory?.usages ?? []).filter((item) => item.encounter_id === encounterId).map((item) => <li key={`usage-${item.id}`}>Tagged item: {inventory?.items.find((candidate) => candidate.id === item.item_id)?.name ?? "Item"}</li>)}
                    {!records.medicationRequests.some((item) => item.encounter_id === encounterId) && !records.documentReferences.some((item) => item.encounter_id === encounterId && item.type_code === "medical-certificate") && !records.serviceRequests.some((item) => item.encounter_id === encounterId) && !(inventory?.usages ?? []).some((item) => item.encounter_id === encounterId) ? <li className="is-empty">No orders, documents, or tagged items yet.</li> : null}
                  </ul>
                </section>
              </ClinicalOrdersAndCharges>
            )}

            <LongitudinalRecord count={priorEncounters.length}>
                <label className="encounter-history__search" htmlFor="encounter-history-search">
                  <span>Search earlier encounters</span>
                  <Input id="encounter-history-search" onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search diagnosis, medication, order…" type="search" value={historyQuery} />
                </label>
                {!priorEncounters.length ? <p className="hint">No earlier encounters are recorded at this clinic.</p> : filteredPriorEncounters.length ? filteredPriorEncounters.map((prior) => (
                  <HistoricalEncounter encounter={prior} key={prior.id} records={records} />
                )) : <p className="hint">No earlier encounter matches this search.</p>}
            </LongitudinalRecord>
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
