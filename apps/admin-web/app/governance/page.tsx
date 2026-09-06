"use client";

import {
  createBrowserSupabaseClient,
  createPatientQrPayload,
  getAccessibleOrganizations,
  getAllClinicServices,
  getCurrentUserEmail,
  getDocumentTemplates,
  getGovernanceDashboard,
  getGovernancePatientRecord,
  getGovernancePatients,
  getOrganizationBranding,
  getOrganizationModules,
  getPatientAuditTrail,
  getPortalAccess,
  hasOrganizationPermission,
  importGovernancePatients,
  saveAdminClinicService,
  saveDocumentTemplate,
  saveOrganizationBranding,
  setOrganizationModule,
} from "@odyssey/supabase-client";
import type {
  ClinicRolePermission,
  ClinicServiceSummary,
  DocumentTemplate,
  GovernanceDashboard,
  GovernancePatientImportRow,
  GovernancePatientRecord,
  GovernancePatientSummary,
  ImportedPatientCredential,
  OrganizationBranding,
  OrganizationModule,
  OrganizationModuleKey,
  PatientAuditEvent,
  PublicClinicSummary,
} from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type FormEvent } from "react";

type GovernancePermission = Extract<
  ClinicRolePermission,
  | "can_view_analytics"
  | "can_manage_patients"
  | "can_view_audit_log"
  | "can_manage_clinic_branding"
  | "can_manage_service_catalog"
  | "can_manage_document_templates"
  | "can_manage_feature_modules"
>;

const governancePermissions: GovernancePermission[] = [
  "can_view_analytics",
  "can_manage_patients",
  "can_view_audit_log",
  "can_manage_clinic_branding",
  "can_manage_service_catalog",
  "can_manage_document_templates",
  "can_manage_feature_modules",
];

const moduleLabels: Record<OrganizationModuleKey, string> = {
  core_visit: "Core visits",
  clinical_documentation: "Clinical documentation",
  inventory: "Inventory and consumables",
  diagnostics: "Diagnostics",
  financial: "Billing and finance",
  remote_care: "Remote care",
  governance: "Platform governance",
};

function money(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parsePatientCsv(text: string): GovernancePatientImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV must include a header and at least one patient.");
  const headings = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const nameIndex = headings.indexOf("name");
  if (nameIndex < 0) throw new Error('The CSV requires a "name" column.');
  const indexOf = (heading: string) => headings.indexOf(heading);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return {
      name: values[nameIndex] ?? "",
      birth_date: values[indexOf("birth_date")] || undefined,
      gender: values[indexOf("gender")] || undefined,
      phone: values[indexOf("phone")] || undefined,
    };
  });
}

function count(record: GovernancePatientRecord | null, key: keyof GovernancePatientRecord): number {
  const value = record?.[key];
  return Array.isArray(value) ? value.length : 0;
}

export default function GovernancePage() {
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [permissions, setPermissions] = useState<GovernancePermission[]>([]);
  const [dashboard, setDashboard] = useState<GovernanceDashboard | null>(null);
  const [patients, setPatients] = useState<GovernancePatientSummary[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<GovernancePatientSummary | null>(null);
  const [patientRecord, setPatientRecord] = useState<GovernancePatientRecord | null>(null);
  const [auditEvents, setAuditEvents] = useState<PatientAuditEvent[]>([]);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [services, setServices] = useState<ClinicServiceSummary[]>([]);
  const [editingService, setEditingService] = useState<ClinicServiceSummary | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [modules, setModules] = useState<OrganizationModule[]>([]);
  const [importResults, setImportResults] = useState<ImportedPatientCredential[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking governance access.");
  const qrCanvas = useRef<HTMLCanvasElement>(null);

  const can = (permission: GovernancePermission) => permissions.includes(permission);

  useEffect(() => {
    async function open() {
      const client = createBrowserSupabaseClient();
      const [userResult, accessResult] = await Promise.all([
        getCurrentUserEmail(client),
        getPortalAccess(client, "admin"),
      ]);
      if (userResult.error || !userResult.data || accessResult.error || !accessResult.data.allowed || accessResult.data.isSuperadmin) {
        setAuthorized(false);
        setStatus("A clinic administrator or owner account is required.");
        return;
      }
      const clinicResult = await getAccessibleOrganizations(client, accessResult.data.organizationIds);
      if (clinicResult.error || !clinicResult.data.length) {
        setAuthorized(false);
        setStatus("No assigned clinic is available.");
        return;
      }
      setSignedInAs(userResult.data);
      setClinics(clinicResult.data);
      const clinicId = clinicResult.data[0].id;
      setOrganizationId(clinicId);
      await loadClinic(clinicId);
    }
    void open();
  }, []);

  useEffect(() => {
    if (!selectedPatient || !qrCanvas.current) return;
    void QRCode.toCanvas(
      qrCanvas.current,
      createPatientQrPayload(organizationId, selectedPatient.patientId),
      { width: 180, margin: 1, errorCorrectionLevel: "M" },
    );
  }, [organizationId, selectedPatient]);

  async function loadClinic(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const checks = await Promise.all(
      governancePermissions.map(async (permission) => ({
        permission,
        result: await hasOrganizationPermission(client, clinicId, permission),
      })),
    );
    const granted = checks
      .filter(({ result }) => !result.error && result.data)
      .map(({ permission }) => permission);
    setPermissions(granted);
    if (!granted.length) {
      setAuthorized(false);
      setStatus("Your clinic role has no platform governance permissions.");
      return;
    }

    const results = await Promise.all([
      granted.includes("can_view_analytics") ? getGovernanceDashboard(client, clinicId) : null,
      granted.includes("can_manage_patients") ? getGovernancePatients(client, clinicId) : null,
      granted.includes("can_view_audit_log") ? getPatientAuditTrail(client, clinicId) : null,
      granted.includes("can_manage_clinic_branding") ? getOrganizationBranding(client, clinicId) : null,
      granted.includes("can_manage_service_catalog") ? getAllClinicServices(client, clinicId) : null,
      granted.includes("can_manage_document_templates") ? getDocumentTemplates(client, clinicId) : null,
      granted.includes("can_manage_feature_modules") ? getOrganizationModules(client, clinicId) : null,
    ]);
    if (results[0] && !results[0].error) setDashboard(results[0].data);
    if (results[1] && !results[1].error) setPatients(results[1].data);
    if (results[2] && !results[2].error) setAuditEvents(results[2].data);
    if (results[3] && !results[3].error) setBranding(results[3].data);
    if (results[4] && !results[4].error) setServices(results[4].data);
    if (results[5] && !results[5].error) setTemplates(results[5].data);
    if (results[6] && !results[6].error) setModules(results[6].data);
    setSelectedPatient(null);
    setPatientRecord(null);
    setAuthorized(true);
    setStatus("Governance data is current.");
  }

  async function openPatient(patient: GovernancePatientSummary) {
    setSelectedPatient(patient);
    setPatientRecord(null);
    const client = createBrowserSupabaseClient();
    const [recordResult, auditResult] = await Promise.all([
      getGovernancePatientRecord(client, organizationId, patient.patientId),
      can("can_view_audit_log") ? getPatientAuditTrail(client, organizationId, patient.patientId) : null,
    ]);
    if (recordResult.error) return setStatus(`Unable to open chart: ${recordResult.error.message}`);
    setPatientRecord(recordResult.data);
    if (auditResult && !auditResult.error) setAuditEvents(auditResult.data);
    setStatus(`Opened ${patient.displayName}'s tenant-scoped record.`);
  }

  async function searchPatients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = String(new FormData(event.currentTarget).get("search") ?? "");
    const result = await getGovernancePatients(createBrowserSupabaseClient(), organizationId, search);
    if (result.error) return setStatus(`Patient search failed: ${result.error.message}`);
    setPatients(result.data);
    setStatus(`${result.data.length} patient record${result.data.length === 1 ? "" : "s"} found.`);
  }

  async function importPatients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("patientCsv") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return setStatus("Choose a patient CSV file first.");
    setBusy(true);
    try {
      const rows = parsePatientCsv(await file.text());
      const result = await importGovernancePatients(createBrowserSupabaseClient(), organizationId, file.name, rows);
      if (result.error) return setStatus(`Patient import failed: ${result.error.message}`);
      setImportResults(result.data);
      const patientResult = await getGovernancePatients(createBrowserSupabaseClient(), organizationId);
      if (!patientResult.error) setPatients(patientResult.data);
      setStatus(`Imported ${result.data.filter((row) => !row.error).length} of ${result.data.length} patients. Save the one-time PINs now.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The CSV could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    const result = await saveOrganizationBranding(createBrowserSupabaseClient(), organizationId, {
      displayName: String(fields.get("displayName") ?? ""),
      tagline: String(fields.get("tagline") ?? ""),
      logoUrl: String(fields.get("logoUrl") ?? ""),
      primaryColor: String(fields.get("primaryColor") ?? "#155EEF"),
      accentColor: String(fields.get("accentColor") ?? "#12B76A"),
      supportEmail: String(fields.get("supportEmail") ?? ""),
      supportPhone: String(fields.get("supportPhone") ?? ""),
    });
    setBusy(false);
    if (result.error) return setStatus(`Brand save failed: ${result.error.message}`);
    const refresh = await getOrganizationBranding(createBrowserSupabaseClient(), organizationId);
    if (!refresh.error) setBranding(refresh.data);
    setStatus("Clinic brand settings saved.");
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    const result = await saveAdminClinicService(createBrowserSupabaseClient(), organizationId, {
      id: editingService?.id,
      name: String(fields.get("name") ?? ""),
      description: String(fields.get("description") ?? ""),
      durationMinutes: Number(fields.get("durationMinutes")),
      basePrice: Number(fields.get("basePrice")),
      currency: String(fields.get("currency") ?? "PHP"),
      bookingEnabled: fields.get("bookingEnabled") === "on",
      active: fields.get("active") === "on",
      deliveryModes: [
        ...(fields.get("inPerson") === "on" ? (["in_person"] as const) : []),
        ...(fields.get("virtual") === "on" ? (["virtual"] as const) : []),
      ],
    });
    setBusy(false);
    if (result.error) return setStatus(`Service save failed: ${result.error.message}`);
    const refresh = await getAllClinicServices(createBrowserSupabaseClient(), organizationId);
    if (!refresh.error) setServices(refresh.data);
    setEditingService(null);
    setStatus("Service catalog saved.");
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    const result = await saveDocumentTemplate(createBrowserSupabaseClient(), organizationId, {
      id: editingTemplate?.id,
      name: String(fields.get("name") ?? ""),
      category: String(fields.get("category")) as DocumentTemplate["category"],
      description: String(fields.get("description") ?? ""),
      body: String(fields.get("body") ?? ""),
      active: fields.get("active") === "on",
    });
    setBusy(false);
    if (result.error) return setStatus(`Template save failed: ${result.error.message}`);
    const refresh = await getDocumentTemplates(createBrowserSupabaseClient(), organizationId);
    if (!refresh.error) setTemplates(refresh.data);
    setEditingTemplate(null);
    setStatus("Document template saved as a new version.");
  }

  async function toggleModule(module: OrganizationModule) {
    const result = await setOrganizationModule(createBrowserSupabaseClient(), organizationId, module.moduleKey, !module.enabled);
    if (result.error) return setStatus(`Module update failed: ${result.error.message}`);
    setModules((current) => current.map((item) => item.id === module.id ? { ...item, enabled: !item.enabled } : item));
    setStatus(`${moduleLabels[module.moduleKey]} ${module.enabled ? "disabled" : "enabled"}.`);
  }

  if (authorized !== true) {
    return (
      <main className="governance-shell">
        <p className="eyebrow">Platform governance</p>
        <h1>{authorized === null ? "Opening governance workspace…" : "Access unavailable"}</h1>
        <p>{status}</p>
        <Link href="/">Return to clinic operations</Link>
      </main>
    );
  }

  return (
    <main className="governance-shell">
      <header className="governance-header">
        <div>
          <p className="eyebrow">Platform governance</p>
          <h1>Clinic control center</h1>
          <p className="hint">Signed in as {signedInAs}</p>
        </div>
        <nav className="governance-nav" aria-label="Governance navigation">
          <Link href="/">Schedule</Link>
          <Link href="/staff">Staff and permissions</Link>
          <Link href="/patient-lookup">Patient QR</Link>
        </nav>
      </header>

      <Field label="Clinic workspace">
        <select className="odyssey-input" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); void loadClinic(event.target.value); }}>
          {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
        </select>
      </Field>

      {can("can_view_analytics") && dashboard && (
        <section aria-labelledby="analytics-heading">
          <h2 id="analytics-heading">Operational overview</h2>
          <div className="governance-kpis">
            <article><strong>{dashboard.activePatients}</strong><span>Active patients</span></article>
            <article><strong>{dashboard.appointmentsToday}</strong><span>Appointments today</span></article>
            <article><strong>{dashboard.waitingNow}</strong><span>Waiting now</span></article>
            <article><strong>{dashboard.completedEncounters30d}</strong><span>Visits completed · 30 days</span></article>
            <article><strong>{dashboard.outstandingInvoices}</strong><span>Outstanding invoices</span></article>
            <article><strong>{money(dashboard.outstandingBalance)}</strong><span>Outstanding balance</span></article>
            <article><strong>{money(dashboard.confirmedRevenue30d)}</strong><span>Confirmed revenue · 30 days</span></article>
            <article><strong>{dashboard.activeStaff}</strong><span>Active staff</span></article>
            <article><strong>{dashboard.auditEvents24h}</strong><span>Audit events · 24 hours</span></article>
          </div>
        </section>
      )}

      {can("can_manage_patients") && (
        <section aria-labelledby="patients-heading">
          <div className="section-heading"><div><h2 id="patients-heading">Patient records</h2><p className="hint">Clinic-scoped charts. Opening a chart is recorded in the audit trail.</p></div></div>
          <form className="governance-inline" onSubmit={searchPatients}>
            <Input name="search" placeholder="Search patient name or walk-in ID" aria-label="Search patients" />
            <Button type="submit">Search</Button>
          </form>
          <div className="governance-split">
            <div className="governance-list">
              {patients.map((patient) => (
                <button type="button" key={patient.patientId} className={selectedPatient?.patientId === patient.patientId ? "selected" : ""} onClick={() => void openPatient(patient)}>
                  <strong>{patient.displayName}</strong>
                  <span>{patient.walkInId ?? "Registered account"} · {patient.encounterCount} encounter{patient.encounterCount === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
            <div className="governance-detail">
              {selectedPatient ? (
                <>
                  <h3>{selectedPatient.displayName}</h3>
                  <p>{selectedPatient.birthDate ?? "Birth date unavailable"} · {selectedPatient.gender ?? "Gender unavailable"}</p>
                  <div className="patient-qr"><canvas ref={qrCanvas} aria-label={`Patient QR for ${selectedPatient.displayName}`} /><div><strong>Clinic patient identifier</strong><p className="hint">This code identifies the patient at this clinic. It does not sign the patient in or disclose their chart.</p></div></div>
                  {patientRecord ? (
                    <div className="record-counts">
                      <span>{count(patientRecord, "appointments")} appointments</span>
                      <span>{count(patientRecord, "encounters")} encounters</span>
                      <span>{count(patientRecord, "observations")} observations</span>
                      <span>{count(patientRecord, "medications")} medications</span>
                      <span>{count(patientRecord, "documents")} documents</span>
                      <span>{count(patientRecord, "diagnostic_reports")} diagnostic reports</span>
                      <span>{count(patientRecord, "invoices")} invoices</span>
                    </div>
                  ) : <p>Loading record…</p>}
                </>
              ) : <p className="hint">Select a patient to review their consolidated record and identification QR.</p>}
            </div>
          </div>

          <details className="governance-details">
            <summary>Mass patient ingestion</summary>
            <p className="hint">Upload UTF-8 CSV with columns: name, birth_date, gender, phone. Maximum 500 rows. One-time PINs are returned only once.</p>
            <form className="governance-inline" onSubmit={importPatients}>
              <Input name="patientCsv" type="file" accept=".csv,text/csv" required />
              <Button type="submit" disabled={busy}>{busy ? "Importing…" : "Import patients"}</Button>
            </form>
            {!!importResults.length && (
              <div className="table-scroll"><table><thead><tr><th>Row</th><th>Patient</th><th>Walk-in ID</th><th>One-time PIN</th><th>Result</th></tr></thead><tbody>
                {importResults.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.displayName}</td><td>{row.walkInId ?? "—"}</td><td>{row.pin ?? "—"}</td><td>{row.error ?? "Imported"}</td></tr>)}
              </tbody></table></div>
            )}
          </details>
        </section>
      )}

      {can("can_view_audit_log") && (
        <section aria-labelledby="audit-heading">
          <h2 id="audit-heading">Patient activity audit trail</h2>
          <p className="hint">{selectedPatient ? `Filtered to ${selectedPatient.displayName}. Reload the clinic to clear the filter.` : "Most recent clinic activity."}</p>
          <div className="table-scroll"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead><tbody>
            {auditEvents.map((event) => <tr key={event.id}><td>{new Date(event.occurredAt).toLocaleString()}</td><td>{event.actorName}</td><td><span className="audit-action">{event.action}</span></td><td>{event.resourceType.replaceAll("_", " ")}</td></tr>)}
            {!auditEvents.length && <tr><td colSpan={4}>No matching audit events.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {can("can_manage_service_catalog") && (
        <section aria-labelledby="services-heading">
          <h2 id="services-heading">Services and pricing</h2>
          <div className="governance-split">
            <div className="governance-list">{services.map((service) => <button type="button" key={service.id} onClick={() => setEditingService(service)}><strong>{service.name}</strong><span>{money(service.base_price ?? 0)} · {service.duration_minutes} minutes · {service.active ? "Active" : "Retired"}</span></button>)}</div>
            <form className="stack governance-form" key={editingService?.id ?? "new-service"} onSubmit={saveService}>
              <h3>{editingService ? `Edit ${editingService.name}` : "Add clinic service"}</h3>
              <Field label="Service name"><Input name="name" defaultValue={editingService?.name} required minLength={2} maxLength={160} /></Field>
              <Field label="Description"><textarea className="odyssey-input" name="description" defaultValue={editingService?.description ?? ""} maxLength={500} /></Field>
              <div className="governance-inline"><Field label="Duration (minutes)"><Input name="durationMinutes" type="number" min={5} max={480} defaultValue={editingService?.duration_minutes ?? 30} required /></Field><Field label="Price"><Input name="basePrice" type="number" min={0} step="0.01" defaultValue={editingService?.base_price ?? 0} required /></Field><Field label="Currency"><Input name="currency" defaultValue={editingService?.currency ?? "PHP"} pattern="[A-Z]{3}" required /></Field></div>
              <label><input name="inPerson" type="checkbox" defaultChecked={editingService?.delivery_modes.includes("in_person") ?? true} /> In-person delivery</label>
              <label><input name="virtual" type="checkbox" defaultChecked={editingService?.delivery_modes.includes("virtual") ?? false} /> Virtual delivery</label>
              <label><input name="bookingEnabled" type="checkbox" defaultChecked={editingService?.booking_enabled ?? true} /> Public booking enabled</label>
              <label><input name="active" type="checkbox" defaultChecked={editingService?.active ?? true} /> Active</label>
              <Button type="submit" disabled={busy}>Save service</Button>
              {editingService && <Button type="button" variant="ghost" onClick={() => setEditingService(null)}>Add another service</Button>}
            </form>
          </div>
        </section>
      )}

      {can("can_manage_document_templates") && (
        <section aria-labelledby="templates-heading">
          <h2 id="templates-heading">Document templates</h2>
          <div className="governance-split">
            <div className="governance-list">{templates.map((template) => <button type="button" key={template.id} onClick={() => setEditingTemplate(template)}><strong>{template.name}</strong><span>{template.category.replaceAll("_", " ")} · version {template.version} · {template.active ? "Active" : "Inactive"}</span></button>)}</div>
            <form className="stack governance-form" key={editingTemplate?.id ?? "new-template"} onSubmit={saveTemplate}>
              <h3>{editingTemplate ? `Edit ${editingTemplate.name}` : "Create a template"}</h3>
              <Field label="Template name"><Input name="name" defaultValue={editingTemplate?.name} required minLength={2} maxLength={120} /></Field>
              <Field label="Category"><select className="odyssey-input" name="category" defaultValue={editingTemplate?.category ?? "general"}>{["medical_certificate", "prescription", "referral", "laboratory", "invoice", "general"].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></Field>
              <Field label="Description"><Input name="description" defaultValue={editingTemplate?.description ?? ""} /></Field>
              <Field label="Template body"><textarea className="odyssey-input template-body" name="body" defaultValue={editingTemplate?.body ?? ""} required maxLength={20000} placeholder="Use clear placeholders such as {{patient_name}} and {{date}}." /></Field>
              <label><input name="active" type="checkbox" defaultChecked={editingTemplate?.active ?? true} /> Active</label>
              <Button type="submit" disabled={busy}>Save template version</Button>
              {editingTemplate && <Button type="button" variant="ghost" onClick={() => setEditingTemplate(null)}>Create another template</Button>}
            </form>
          </div>
        </section>
      )}

      {can("can_manage_clinic_branding") && branding && (
        <section aria-labelledby="brand-heading">
          <h2 id="brand-heading">Clinic brand</h2>
          <div className="governance-split">
            <form className="stack governance-form" key={branding.id + branding.displayName} onSubmit={saveBrand}>
              <Field label="Display name"><Input name="displayName" defaultValue={branding.displayName} required /></Field>
              <Field label="Tagline"><Input name="tagline" defaultValue={branding.tagline ?? ""} maxLength={240} /></Field>
              <Field label="HTTPS logo URL"><Input name="logoUrl" type="url" defaultValue={branding.logoUrl ?? ""} /></Field>
              <div className="governance-inline"><Field label="Primary color"><Input name="primaryColor" type="color" defaultValue={branding.primaryColor} /></Field><Field label="Accent color"><Input name="accentColor" type="color" defaultValue={branding.accentColor} /></Field></div>
              <Field label="Support email"><Input name="supportEmail" type="email" defaultValue={branding.supportEmail ?? ""} /></Field>
              <Field label="Support phone"><Input name="supportPhone" defaultValue={branding.supportPhone ?? ""} /></Field>
              <Button type="submit" disabled={busy}>Save brand</Button>
            </form>
            <article className="brand-preview" style={{ borderColor: branding.primaryColor }}>
              {branding.logoUrl && <img src={branding.logoUrl} alt="Clinic logo preview" />}
              <p className="eyebrow" style={{ color: branding.accentColor }}>Patient experience</p>
              <h3 style={{ color: branding.primaryColor }}>{branding.displayName}</h3>
              <p>{branding.tagline || "Your care, connected."}</p>
              <button type="button" style={{ background: branding.primaryColor }}>Book a visit</button>
            </article>
          </div>
        </section>
      )}

      {can("can_manage_feature_modules") && (
        <section aria-labelledby="modules-heading">
          <h2 id="modules-heading">Modules and feature flags</h2>
          <p className="hint">Module availability controls navigation and rollout; RLS permissions remain authoritative.</p>
          <div className="module-grid">{modules.map((module) => <article key={module.id}><div><strong>{moduleLabels[module.moduleKey]}</strong><p>{module.enabled ? "Available to permitted staff" : "Hidden for this clinic"}</p></div><Button type="button" variant={module.enabled ? "outline" : "default"} disabled={module.moduleKey === "governance"} onClick={() => void toggleModule(module)}>{module.enabled ? "Disable" : "Enable"}</Button></article>)}</div>
        </section>
      )}

      <p className="governance-status" role="status">{status}</p>
    </main>
  );
}
