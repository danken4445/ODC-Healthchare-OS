import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getHumanNameDisplay,
  type AppointmentQueueItem,
  type AppointmentSlotSummary,
  type AppointmentSlotInput,
  type AppointmentStatus,
  type AppointmentSummary,
  type ClinicServiceSummary,
  type ClinicServiceInput,
  type ClinicAccountInput,
  type ClinicRoleDefinition,
  type ClinicRolePermission,
  type ClinicStaffMember,
  type CreatedClinicAccount,
  type Database,
  type DateRange,
  type DocumentReferenceSummary,
  type EncounterSummary,
  type MedicationRequestSummary,
  type ObservationSummary,
  type MedicalCertificateInput,
  type PatientProfileInput,
  type PrescriptionInput,
  type SoapObservationInput,
  type SoapNoteInput,
  type TriageVitalSignsInput,
  type OrganizationClinicalRecords,
  type PatientAccessRecords,
  type PatientRegistrationInput,
  type PatientRegistrationResult,
  type PatientSummary,
  type PortalAccess,
  type PortalName,
  type PublicClinicSummary,
  type WalkInAccessInput,
  type WalkInAccessRecords,
  type WalkInCredentials,
  type WalkInRegistrationInput,
  type WaitingRoomQueueItem,
  type WeeklyAvailabilityWindow,
  type DepartmentInput,
  type DepartmentSummary,
  type InventoryEncounterOption,
  type InventoryItemInput,
  type InventoryItemPricingInput,
  type InventoryItemSummary,
  type InventoryUsageInput,
  type InventoryWorkspace,
  type Json,
  type DiagnosticServiceRequestInput,
  type DiagnosticReportInput,
  type DiagnosticsWorkspace,
  type DiagnosticReportSummary,
  type ServiceRequestSummary,
  type ClinicalNotificationSummary,
  type SpecialistOption,
  type LaboratoryServiceSummary,
  type DiagnosticEncounterOption,
  type StockAdjustmentInput,
  type StockTransferInput,
  type BillingWorkspace,
  type BillingLineItemSummary,
  type BillableEncounter,
  type PatientInvoice,
  type PayorType,
  type PaymentMethod,
  type PosCartItem,
  type PosCheckoutResult,
  type ClaimSummary,
} from "@odyssey/types";

let browserClient: SupabaseClient<Database> | undefined;

export interface PublicSupabaseConfig {
  anonKey: string;
  url: string;
}

export interface SupabaseFailure {
  code?: string;
  message: string;
}

export type SupabaseResult<T> =
  { data: T; error: null } | { data: null; error: SupabaseFailure };

const patientSummaryColumns =
  "id, organization_id, active, name, birth_date, gender, telecom, address, walk_in_id, created_at, updated_at";
const appointmentSummaryColumns =
  "id, organization_id, patient_id, practitioner_role_id, status, service_type, appointment_type, start_at, end_at, minutes_duration, description, patient_instruction, clinic_service_id, queue_date, queue_number";
const appointmentSlotSummaryColumns =
  "id, appointment_id, organization_id, practitioner_role_id, clinic_service_id, status, service_type, start_at, end_at";
const clinicServiceSummaryColumns =
  "id, organization_id, owner_practitioner_role_id, code, name, description, duration_minutes, base_price, currency, booking_enabled";
const waitingRoomQueueColumns =
  "appointment_id, organization_id, queue_date, queue_number, service_name, scheduled_at, stage";
const publicClinicSummaryColumns = "id, name, telecom, address";
const encounterSummaryColumns =
  "id, organization_id, patient_id, appointment_id, practitioner_role_id, status, class_code, service_type, period_start, period_end";
const observationSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, code, code_display, effective_at, issued_at, value, value_unit, supersedes_id, diagnostic_report_id, reference_range, note";
const medicationRequestSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, medication_code, medication_display, authored_on, dosage_instruction, note";
const documentReferenceSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, type_code, type_display, date_at, description, content_title";
const departmentSummaryColumns =
  "id, organization_id, code, name, description, active";
const inventoryItemSummaryColumns =
  "id, organization_id, sku, name, description, unit_of_measure, unit_cost, selling_price, unit_price, currency, active";
const departmentStockSummaryColumns =
  "id, organization_id, item_id, department_id, quantity, reorder_level, updated_at";
const inventoryUsageSummaryColumns =
  "id, organization_id, stock_id, item_id, department_id, encounter_id, patient_id, quantity, unit_cost, unit_price, currency, tagged_by, used_at";
const inventoryMovementSummaryColumns =
  "id, organization_id, stock_id, item_id, department_id, movement_type, quantity_delta, reason, usage_id, transfer_group_id, recorded_by, occurred_at";
const serviceRequestSummaryColumns =
  "id, organization_id, patient_id, encounter_id, requester_practitioner_id, status, category, priority, code, code_display, performer_practitioner_role_id, note, created_at, updated_at";
const diagnosticReportSummaryColumns =
  "id, organization_id, patient_id, encounter_id, based_on_service_request_id, status, code, code_display, effective_at, issued_at, conclusion";
const clinicalNotificationSummaryColumns =
  "id, organization_id, service_request_id, diagnostic_report_id, kind, title, message, read_at, created_at";

function publicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new Error("Missing public Supabase environment variables.");
  return { url, anonKey };
}

/** Creates a typed public-key client for a supplied app environment. */
export function createSupabaseClient(
  config: PublicSupabaseConfig,
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey);
}

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    const { url, anonKey } = publicSupabaseConfig();
    return createSupabaseClient({ url, anonKey });
  }

  if (!browserClient) {
    const { url, anonKey } = publicSupabaseConfig();
    browserClient = createSupabaseClient({ url, anonKey });
  }

  return browserClient;
}

/** A sessionless browser client for intentionally public clinic directories. */
export function createPublicSupabaseClient(): SupabaseClient<Database> {
  const { url, anonKey } = publicSupabaseConfig();
  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/** Use this from server-only code that does not require cookie session wiring. */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  return createSupabaseClient(publicSupabaseConfig());
}

function failure(error: SupabaseFailure): SupabaseResult<never> {
  return { data: null, error };
}

function success<T>(data: T): SupabaseResult<T> {
  return { data, error: null };
}

function toIsoTimestamp(value: Date | string, field: "start" | "end"): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime()))
    throw new Error(`Invalid ${field} date range value.`);
  return timestamp.toISOString();
}

function toPatientSummary(
  row: Omit<PatientSummary, "displayName">,
): PatientSummary {
  return { ...row, displayName: getHumanNameDisplay(row.name) };
}

/** Gets future scheduled appointments for one patient, ordered chronologically. */
export async function getUpcomingAppointments(
  client: SupabaseClient<Database>,
  patientId: string,
  from: Date = new Date(),
): Promise<SupabaseResult<AppointmentSummary[]>> {
  const { data, error } = await client
    .from("appointments")
    .select(appointmentSummaryColumns)
    .eq("patient_id", patientId)
    .gte("start_at", from.toISOString())
    .order("start_at", { ascending: true });

  if (error) return failure(error);
  return success((data ?? []) as unknown as AppointmentSummary[]);
}

/** Gets encounters within an organization and inclusive clinical date range. */
export async function getOrgEncounters(
  client: SupabaseClient<Database>,
  organizationId: string,
  dateRange: DateRange,
): Promise<SupabaseResult<EncounterSummary[]>> {
  const start = toIsoTimestamp(dateRange.start, "start");
  const end = toIsoTimestamp(dateRange.end, "end");
  if (start > end)
    throw new Error("The encounter date range start must be before its end.");

  const { data, error } = await client
    .from("encounters")
    .select(encounterSummaryColumns)
    .eq("organization_id", organizationId)
    .gte("period_start", start)
    .lte("period_start", end)
    .order("period_start", { ascending: true });

  if (error) return failure(error);
  return success((data ?? []) as unknown as EncounterSummary[]);
}

/** Records available to the signed-in patient through row-level security. */
export async function getPatientAccessRecords(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<PatientAccessRecords>> {
  const [
    patients,
    appointments,
    encounters,
    observations,
    medicationRequests,
    documentReferences,
    serviceRequests,
    diagnosticReports,
  ] = await Promise.all([
    client
      .from("patients")
      .select(patientSummaryColumns)
      .eq("organization_id", organizationId),
    client
      .from("appointments")
      .select(appointmentSummaryColumns)
      .eq("organization_id", organizationId)
      .order("start_at", { ascending: true }),
    client
      .from("encounters")
      .select(encounterSummaryColumns)
      .eq("organization_id", organizationId)
      .order("period_start", { ascending: true }),
    client
      .from("observations")
      .select(observationSummaryColumns)
      .eq("organization_id", organizationId)
      .order("effective_at", { ascending: false }),
    client
      .from("medication_requests")
      .select(medicationRequestSummaryColumns)
      .eq("organization_id", organizationId)
      .order("authored_on", { ascending: false }),
    client
      .from("document_references")
      .select(documentReferenceSummaryColumns)
      .eq("organization_id", organizationId)
      .order("date_at", { ascending: false }),
    client
      .from("service_requests")
      .select(serviceRequestSummaryColumns)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    client
      .from("diagnostic_reports")
      .select(diagnosticReportSummaryColumns)
      .eq("organization_id", organizationId)
      .order("issued_at", { ascending: false }),
  ]);
  const error = [
    patients,
    appointments,
    encounters,
    observations,
    medicationRequests,
    documentReferences,
    serviceRequests,
    diagnosticReports,
  ].find((result) => result.error)?.error;
  if (error) return failure(error);

  const patientRows = (patients.data ?? []) as unknown as Array<
    Omit<PatientSummary, "displayName">
  >;
  return success({
    patients: patientRows.map(toPatientSummary),
    appointments: (appointments.data ?? []) as unknown as AppointmentSummary[],
    encounters: (encounters.data ?? []) as unknown as EncounterSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    medicationRequests: (medicationRequests.data ??
      []) as unknown as MedicationRequestSummary[],
    documentReferences: (documentReferences.data ??
      []) as unknown as DocumentReferenceSummary[],
    serviceRequests: (serviceRequests.data ??
      []) as unknown as ServiceRequestSummary[],
    diagnosticReports: (diagnosticReports.data ??
      []) as unknown as DiagnosticReportSummary[],
  });
}

/** Organization-scoped clinical records for the provider workspace. */
export async function getOrganizationClinicalRecords(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<OrganizationClinicalRecords>> {
  const [
    encounters,
    observations,
    medicationRequests,
    documentReferences,
    serviceRequests,
    diagnosticReports,
  ] = await Promise.all([
    client
      .from("encounters")
      .select(encounterSummaryColumns)
      .eq("organization_id", organizationId)
      .order("period_start", { ascending: true }),
    client
      .from("observations")
      .select(observationSummaryColumns)
      .eq("organization_id", organizationId)
      .order("effective_at", { ascending: false }),
    client
      .from("medication_requests")
      .select(medicationRequestSummaryColumns)
      .eq("organization_id", organizationId)
      .order("authored_on", { ascending: false }),
    client
      .from("document_references")
      .select(documentReferenceSummaryColumns)
      .eq("organization_id", organizationId)
      .order("date_at", { ascending: false }),
    client
      .from("service_requests")
      .select(serviceRequestSummaryColumns)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    client
      .from("diagnostic_reports")
      .select(diagnosticReportSummaryColumns)
      .eq("organization_id", organizationId)
      .order("issued_at", { ascending: false }),
  ]);
  const error = [
    encounters,
    observations,
    medicationRequests,
    documentReferences,
    serviceRequests,
    diagnosticReports,
  ].find((result) => result.error)?.error;
  if (error) return failure(error);

  return success({
    encounters: (encounters.data ?? []) as unknown as EncounterSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    medicationRequests: (medicationRequests.data ??
      []) as unknown as MedicationRequestSummary[],
    documentReferences: (documentReferences.data ??
      []) as unknown as DocumentReferenceSummary[],
    serviceRequests: (serviceRequests.data ??
      []) as unknown as ServiceRequestSummary[],
    diagnosticReports: (diagnosticReports.data ??
      []) as unknown as DiagnosticReportSummary[],
  });
}

/** Role-filtered diagnostics data; RLS reduces this to lab, specialist, doctor, or patient scope. */
export async function getDiagnosticsWorkspace(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<DiagnosticsWorkspace>> {
  const [requests, reports, observations, notifications] = await Promise.all([
    client
      .from("service_requests")
      .select(serviceRequestSummaryColumns)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    client
      .from("diagnostic_reports")
      .select(diagnosticReportSummaryColumns)
      .eq("organization_id", organizationId)
      .order("issued_at", { ascending: false }),
    client
      .from("observations")
      .select(observationSummaryColumns)
      .eq("organization_id", organizationId)
      .not("diagnostic_report_id", "is", null)
      .order("issued_at", { ascending: false }),
    client
      .from("clinical_notifications")
      .select(clinicalNotificationSummaryColumns)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);
  const error = [requests, reports, observations, notifications].find(
    (item) => item.error,
  )?.error;
  if (error) return failure(error);
  return success({
    serviceRequests: (requests.data ??
      []) as unknown as ServiceRequestSummary[],
    diagnosticReports: (reports.data ??
      []) as unknown as DiagnosticReportSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    notifications: (notifications.data ??
      []) as unknown as ClinicalNotificationSummary[],
  });
}

export async function getSpecialistOptions(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<SpecialistOption[]>> {
  const { data, error } = await client.rpc("get_specialist_options" as never, {
    p_organization_id: organizationId,
  } as never);
  if (error) return failure(error);
  return success(
    ((data as any[] | null) ?? []).map((row: any) => ({
      practitionerRoleId: row.practitioner_role_id,
      displayName: row.display_name,
      specialty: row.specialty,
      organizationName: row.organization_name,
    })),
  );
}

export async function listDiagnosticEncounters(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<DiagnosticEncounterOption[]>> {
  const { data, error } = await client.rpc("list_diagnostic_encounters", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(
    (data ?? []).map((row) => ({
      id: row.id,
      patientName: row.patient_name,
      serviceType: row.service_type,
      periodStart: row.period_start,
      status: row.status,
    })),
  );
}

export async function createDiagnosticServiceRequest(
  client: SupabaseClient<Database>,
  input: DiagnosticServiceRequestInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc(
    "create_diagnostic_service_request",
    {
      p_encounter_id: input.encounterId,
      p_category: input.category,
      p_code: "",
      p_code_display: "",
      p_priority: input.priority,
      p_note: input.note,
      p_performer_practitioner_role_id:
        input.performerPractitionerRoleId ?? undefined,
      p_laboratory_service_id: input.laboratoryServiceId ?? undefined,
    },
  );
  return error ? failure(error) : success(data);
}

export async function getLaboratoryServices(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<LaboratoryServiceSummary[]>> {
  const { data, error } = await client.rpc("list_laboratory_services" as never, {
    p_organization_id: organizationId,
  } as never);
  if (error) return failure(error);
  return success(((data as any[] | null) ?? []).map((row: any) => ({
    id: row.id, code: row.code, name: row.name, labCost: Number(row.lab_cost), active: row.active,
  })));
}

export async function saveLaboratoryService(
  client: SupabaseClient<Database>,
  input: { id?: string | null; organizationId: string; name: string; labCost: number; active?: boolean },
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("save_laboratory_service" as never, {
    p_service_id: input.id ?? null,
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_lab_cost: input.labCost,
    p_active: input.active ?? true,
  } as never);
  return error ? failure(error) : success(data as string);
}

export async function recordDiagnosticReport(
  client: SupabaseClient<Database>,
  input: DiagnosticReportInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("record_diagnostic_report", {
    p_service_request_id: input.serviceRequestId,
    p_conclusion: input.conclusion ?? "",
    p_results: input.results as unknown as Json,
  });
  return error ? failure(error) : success(data);
}

export async function updateReferralStatus(
  client: SupabaseClient<Database>,
  requestId: string,
  status: "active" | "on_hold" | "completed" | "revoked",
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("update_referral_status", {
    p_service_request_id: requestId,
    p_status: status,
  });
  return error ? failure(error) : success(undefined);
}

export async function markClinicalNotificationRead(
  client: SupabaseClient<Database>,
  notificationId: string,
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("mark_clinical_notification_read", {
    p_notification_id: notificationId,
  });
  return error ? failure(error) : success(undefined);
}

export function subscribeToDiagnostics(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
): () => void {
  const channel = client.channel(`diagnostics:${organizationId}`);
  for (const table of [
    "service_requests",
    "diagnostic_reports",
    "clinical_notifications",
  ] as const) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    );
  }
  channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export async function addSoapObservation(
  client: SupabaseClient<Database>,
  input: SoapObservationInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("add_soap_observation", {
    p_encounter_id: input.encounterId,
    p_section: input.section,
    p_text: input.text,
    p_supersedes_id: input.supersedesId ?? undefined,
  });
  return error ? failure(error) : success(data);
}

export async function saveSoapNote(
  client: SupabaseClient<Database>,
  input: SoapNoteInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("add_soap_note", {
    p_encounter_id: input.encounterId,
    p_text: input.text,
    p_supersedes_id: input.supersedesId ?? undefined,
  });
  return error ? failure(error) : success(data);
}

/** Records an immutable nurse triage assessment before the doctor may start. */
export async function recordTriageVitalSigns(
  client: SupabaseClient<Database>,
  input: TriageVitalSignsInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("record_triage_vital_signs", {
    p_appointment_id: input.appointmentId,
    p_systolic_bp: input.systolicBp,
    p_diastolic_bp: input.diastolicBp,
    p_pulse_bpm: input.pulseBpm,
    p_respiratory_rate: input.respiratoryRate,
    p_temperature_c: input.temperatureC,
    p_oxygen_saturation: input.oxygenSaturation,
    p_weight_kg: input.weightKg ?? undefined,
    p_height_cm: input.heightCm ?? undefined,
    p_pain_score: input.painScore ?? undefined,
    p_acuity: input.acuity,
    p_chief_complaint: input.chiefComplaint ?? undefined,
    p_notes: input.notes ?? undefined,
    p_supersedes_id: input.supersedesId ?? undefined,
  });
  return error ? failure(error) : success(data);
}

export async function issuePrescription(
  client: SupabaseClient<Database>,
  input: PrescriptionInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("issue_prescription", {
    p_encounter_id: input.encounterId,
    p_medication: input.medication,
    p_dosage: input.dosage,
    p_note: input.note ?? undefined,
  });
  return error ? failure(error) : success(data);
}

export async function issueMedicalCertificate(
  client: SupabaseClient<Database>,
  input: MedicalCertificateInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("issue_medical_certificate", {
    p_encounter_id: input.encounterId,
    p_title: input.title,
    p_statement: input.statement,
  });
  return error ? failure(error) : success(data);
}

export async function finishClinicalEncounter(
  client: SupabaseClient<Database>,
  encounterId: string,
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("finish_clinical_encounter", {
    p_encounter_id: encounterId,
  });
  return error ? failure(error) : success(undefined);
}

export async function updateOwnPatientProfile(
  client: SupabaseClient<Database>,
  input: PatientProfileInput,
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("update_own_patient_profile", {
    p_patient_id: input.patientId,
    p_display_name: input.displayName,
    p_birth_date: input.birthDate as string,
    p_gender: input.gender as string,
    p_phone: input.phone,
    p_address: input.address,
  });
  return error ? failure(error) : success(undefined);
}

export function subscribeToClinicalHistory(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client.channel(`clinical-history:${organizationId}`);
  for (const table of [
    "encounters",
    "observations",
    "medication_requests",
    "document_references",
    "service_requests",
    "diagnostic_reports",
  ] as const) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    );
  }
  channel.subscribe((status) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

/** Permission lookup stays database-driven so role grants can change without a UI release. */
export async function hasOrganizationPermission(
  client: SupabaseClient<Database>,
  organizationId: string,
  permission: string,
): Promise<SupabaseResult<boolean>> {
  const { data, error } = await client.rpc("has_organization_permission", {
    target_organization_id: organizationId,
    target_permission: permission,
  });
  return error ? failure(error) : success(Boolean(data));
}

export async function getClinicRoleDefinitions(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<ClinicRoleDefinition[]>> {
  const { data, error } = await client.rpc("list_clinic_role_definitions", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(
    (data ?? []).map((role) => ({
      code: role.code,
      name: role.name,
      isCustom: role.is_custom,
      permissions: role.permissions as ClinicRolePermission[],
    })),
  );
}

export async function saveClinicRoleDefinition(
  client: SupabaseClient<Database>,
  input: {
    organizationId: string;
    code: string;
    name: string;
    permissions: ClinicRolePermission[];
  },
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("save_clinic_role_definition", {
    p_organization_id: input.organizationId,
    p_code: input.code,
    p_name: input.name,
    p_permissions: input.permissions,
  });
  return error ? failure(error) : success(undefined);
}

export async function getStaffAdministration(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<
  SupabaseResult<{
    departments: DepartmentSummary[];
    staff: ClinicStaffMember[];
  }>
> {
  const [departmentResult, staffResult] = await Promise.all([
    client.rpc("list_staff_departments", {
      p_organization_id: organizationId,
    }),
    client.rpc("list_clinic_staff", {
      p_organization_id: organizationId,
    }),
  ]);
  if (departmentResult.error) return failure(departmentResult.error);
  if (staffResult.error) return failure(staffResult.error);
  return success({
    departments: (departmentResult.data ?? []).map((department) => ({
      id: department.id,
      organization_id: organizationId,
      code: department.code,
      name: department.name,
      description: null,
      active: department.active,
    })),
    staff: (staffResult.data ?? []).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      email: member.email,
      roleCode: member.role_code,
      departmentId: member.department_id,
      active: member.active,
    })),
  });
}

export async function assignStaffDepartment(
  client: SupabaseClient<Database>,
  input: {
    organizationId: string;
    userId: string;
    departmentId: string | null;
  },
): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("assign_staff_department", {
    p_organization_id: input.organizationId,
    p_user_id: input.userId,
    p_department_id: input.departmentId,
  });
  return error ? failure(error) : success(undefined);
}

export async function getCurrentStaffDepartment(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<string | null>> {
  const { data, error } = await client.rpc("get_current_staff_department", {
    p_organization_id: organizationId,
  });
  return error ? failure(error) : success(data);
}

/** Loads the location/item/count split; overall item totals remain derived sums. */
export async function getInventoryWorkspace(
  client: SupabaseClient<Database>,
  organizationId: string,
  includeMovements = false,
): Promise<SupabaseResult<InventoryWorkspace>> {
  // Resolve actor names for stock movements and encounter usages.
  const nameMap = new Map<string, string>();
  const staffNamesPromise = (async () => {
    try {
      const { data: staffList } = await client.rpc(
        "list_inventory_staff_names" as never,
        { p_organization_id: organizationId } as never,
      );
      if (Array.isArray(staffList)) {
        for (const s of staffList as Array<{
          user_id?: string;
          display_name?: string;
        }>) {
          if (s.user_id && s.display_name)
            nameMap.set(s.user_id, s.display_name);
        }
        return;
      }
    } catch {
      // Fall through to query practitioners directly if RPC is not present
    }

    try {
      const { data: practitioners } = await client
        .from("practitioners")
        .select("auth_user_id, name")
        .eq("organization_id", organizationId);
      if (practitioners) {
        for (const p of practitioners) {
          if (p.auth_user_id && p.name) {
            nameMap.set(p.auth_user_id, getHumanNameDisplay(p.name));
          }
        }
      }
    } catch {
      // Practitioner table read fallback
    }
  })();

  const [departments, items, stock, usages] = await Promise.all([
    client
      .from("departments")
      .select(departmentSummaryColumns)
      .eq("organization_id", organizationId)
      .order("name"),
    client
      .from("inventory_items")
      .select(inventoryItemSummaryColumns)
      .eq("organization_id", organizationId)
      .order("name"),
    client
      .from("department_stock")
      .select(departmentStockSummaryColumns)
      .eq("organization_id", organizationId),
    client
      .from("inventory_usages")
      .select(inventoryUsageSummaryColumns)
      .eq("organization_id", organizationId)
      .order("used_at", { ascending: false })
      .limit(100),
    staffNamesPromise,
  ]);
  const baseError = [departments, items, stock, usages].find(
    (result) => result.error,
  )?.error;
  if (baseError) return failure(baseError);

  let movements: InventoryWorkspace["movements"] = [];
  if (includeMovements) {
    const movementResult = await client
      .from("inventory_stock_movements")
      .select(inventoryMovementSummaryColumns)
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (movementResult.error) return failure(movementResult.error);
    movements = (
      (movementResult.data ?? []) as unknown as Array<
        InventoryWorkspace["movements"][number]
      >
    ).map((m) => ({
      ...m,
      actorName: m.recorded_by ? (nameMap.get(m.recorded_by) ?? null) : null,
    }));
  }

  const usageRows = (
    (usages.data ?? []) as unknown as Array<
      InventoryWorkspace["usages"][number]
    >
  ).map((u) => ({
    ...u,
    actorName: u.tagged_by ? (nameMap.get(u.tagged_by) ?? null) : null,
  }));

  return success({
    departments: (departments.data ??
      []) as unknown as InventoryWorkspace["departments"],
    items: (items.data ?? []) as unknown as InventoryWorkspace["items"],
    stock: (stock.data ?? []) as unknown as InventoryWorkspace["stock"],
    usages: usageRows,
    movements,
  });
}

export async function createDepartment(
  client: SupabaseClient<Database>,
  input: DepartmentInput,
): Promise<SupabaseResult<DepartmentSummary>> {
  const { data, error } = await client
    .from("departments")
    .insert({
      organization_id: input.organizationId,
      code: "",
      name: input.name.trim(),
      description: input.description?.trim() || null,
    })
    .select(departmentSummaryColumns)
    .single();
  return error ? failure(error) : success(data as unknown as DepartmentSummary);
}

export async function createInventoryItem(
  client: SupabaseClient<Database>,
  input: InventoryItemInput,
): Promise<SupabaseResult<InventoryItemSummary>> {
  const { data, error } = await client
    .from("inventory_items")
    .insert({
      organization_id: input.organizationId,
      sku: "",
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit_of_measure: input.unitOfMeasure.trim(),
      unit_cost: input.unitCost,
      selling_price: input.sellingPrice,
      unit_price: input.sellingPrice,
      currency: input.currency ?? "PHP",
    })
    .select(inventoryItemSummaryColumns)
    .single();
  return error
    ? failure(error)
    : success(data as unknown as InventoryItemSummary);
}

export async function updateInventoryItemPricing(
  client: SupabaseClient<Database>,
  input: InventoryItemPricingInput,
): Promise<SupabaseResult<InventoryItemSummary>> {
  const { data, error } = await client
    .from("inventory_items")
    .update({
      unit_cost: input.unitCost,
      selling_price: input.sellingPrice,
      unit_price: input.sellingPrice,
    })
    .eq("id", input.itemId)
    .select(inventoryItemSummaryColumns)
    .single();
  return error
    ? failure(error)
    : success(data as unknown as InventoryItemSummary);
}

export async function adjustDepartmentStock(
  client: SupabaseClient<Database>,
  input: StockAdjustmentInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("adjust_department_stock", {
    p_item_id: input.itemId,
    p_department_id: input.departmentId,
    p_quantity_delta: input.quantityDelta,
    p_reason: input.reason,
    p_movement_type: input.movementType,
  });
  return error ? failure(error) : success(data);
}

export async function transferDepartmentStock(
  client: SupabaseClient<Database>,
  input: StockTransferInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("transfer_department_stock", {
    p_item_id: input.itemId,
    p_from_department_id: input.fromDepartmentId,
    p_to_department_id: input.toDepartmentId,
    p_quantity: input.quantity,
    p_reason: input.reason,
  });
  return error ? failure(error) : success(data);
}

export async function tagInventoryUsage(
  client: SupabaseClient<Database>,
  input: InventoryUsageInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("tag_inventory_usage", {
    p_encounter_id: input.encounterId,
    p_stock_id: input.stockId,
    p_quantity: input.quantity,
    p_department_id: input.departmentId ?? null,
  });
  return error ? failure(error) : success(data);
}

export async function listInventoryEncounters(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<InventoryEncounterOption[]>> {
  const { data, error } = await client.rpc("list_inventory_encounters", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(
    (data ?? []).map((row) => ({
      id: row.id,
      serviceType: row.service_type,
      periodStart: row.period_start,
    })),
  );
}

export function subscribeToInventory(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client.channel(`inventory:${organizationId}`);
  for (const table of ["department_stock", "inventory_usages"] as const) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    );
  }
  channel.subscribe((status) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

export async function getCurrentUserEmail(
  client: SupabaseClient<Database>,
): Promise<SupabaseResult<string | null>> {
  const { data, error } = await client.auth.getUser();
  if (error) return failure(error);
  return success(data.user?.email ?? null);
}

export async function signInWithPassword(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return failure(error);
  return success(data.user?.email ?? email);
}

export async function registerPatient(
  client: SupabaseClient<Database>,
  input: PatientRegistrationInput,
  emailRedirectTo: string,
): Promise<SupabaseResult<PatientRegistrationResult>> {
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 120)
    return failure({ message: "Enter a name between 2 and 120 characters." });

  const { data, error } = await client.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo,
      data: {
        display_name: displayName,
        odyssey_patient_registration: true,
        organization_id: input.organizationId,
      },
    },
  });
  if (error) return failure(error);
  return success({
    email: data.user?.email ?? input.email.trim(),
    signedIn: data.session !== null,
  });
}

export async function requestMagicLink(
  client: SupabaseClient<Database>,
  email: string,
  emailRedirectTo: string,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) return failure(error);
  return success(undefined);
}

export async function signOut(
  client: SupabaseClient<Database>,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.auth.signOut();
  if (error) return failure(error);
  return success(undefined);
}

export async function claimWalkInPatient(
  client: SupabaseClient<Database>,
  credentials: WalkInAccessInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("claim_walk_in_patient", {
    p_organization_id: credentials.organizationId,
    p_walk_in_id: credentials.walkInId,
    p_pin: credentials.pin,
  });
  if (error) return failure(error);
  return success(data);
}

export async function createWalkInPatient(
  client: SupabaseClient<Database>,
  input: WalkInRegistrationInput,
): Promise<SupabaseResult<WalkInCredentials>> {
  const { data, error } = await client.rpc("create_walk_in_patient", {
    p_organization_id: input.organizationId,
    p_name: { text: input.name },
    p_telecom: [],
    p_birth_date: input.birthDate ?? undefined,
    p_gender: input.gender ?? undefined,
  });
  if (error) return failure(error);
  const result = data?.[0];
  if (!result)
    return failure({ message: "No walk-in credentials were returned." });
  return success({
    patientId: result.patient_id,
    walkInId: result.walk_in_id,
    pin: result.pin,
  });
}

/** Lists bookable FHIR Slots at one clinic. RLS limits the clinic to the user. */
export async function getAvailableAppointmentSlots(
  client: SupabaseClient<Database>,
  organizationId: string,
  from: Date = new Date(),
): Promise<SupabaseResult<AppointmentSlotSummary[]>> {
  const { data, error } = await client
    .from("appointment_slots")
    .select(appointmentSlotSummaryColumns)
    .eq("organization_id", organizationId)
    .eq("status", "free")
    .gte("start_at", from.toISOString())
    .order("start_at", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as AppointmentSlotSummary[]);
}

/** Public, active HealthcareServices for the clinic portal. */
export async function getClinicServices(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<ClinicServiceSummary[]>> {
  const { data, error } = await client
    .from("clinic_services")
    .select(clinicServiceSummaryColumns)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as ClinicServiceSummary[]);
}

/** Adds a bookable service to the current provider's clinic catalog. */
export async function createClinicService(
  client: SupabaseClient<Database>,
  organizationId: string,
  input: ClinicServiceInput,
): Promise<SupabaseResult<ClinicServiceSummary>> {
  const { data: serviceId, error } = await client.rpc(
    "save_provider_clinic_service",
    {
      p_service_id: null as unknown as string,
      p_organization_id: organizationId,
      p_code: "",
      p_name: input.name,
      p_description: input.description ?? "",
      p_duration_minutes: input.durationMinutes,
      p_base_price: input.basePrice as number,
      p_booking_enabled: input.bookingEnabled,
    },
  );
  if (error) return failure(error);
  const { data, error: selectError } = await client
    .from("clinic_services")
    .select(clinicServiceSummaryColumns)
    .eq("id", serviceId)
    .single();
  if (selectError) return failure(selectError);
  return success(data as unknown as ClinicServiceSummary);
}

/** Updates a service in the current provider's clinic catalog. */
export async function updateClinicService(
  client: SupabaseClient<Database>,
  organizationId: string,
  serviceId: string,
  input: ClinicServiceInput,
): Promise<SupabaseResult<ClinicServiceSummary>> {
  const { data: savedId, error } = await client.rpc(
    "save_provider_clinic_service",
    {
      p_service_id: serviceId,
      p_organization_id: organizationId,
      p_code: "",
      p_name: input.name,
      p_description: input.description ?? "",
      p_duration_minutes: input.durationMinutes,
      p_base_price: input.basePrice as number,
      p_booking_enabled: input.bookingEnabled,
    },
  );
  if (error) return failure(error);
  const { data, error: selectError } = await client
    .from("clinic_services")
    .select(clinicServiceSummaryColumns)
    .eq("id", savedId)
    .single();
  if (selectError) return failure(selectError);
  return success(data as unknown as ClinicServiceSummary);
}

/** Retires a service while preserving its appointment history. */
export async function retireClinicService(
  client: SupabaseClient<Database>,
  serviceId: string,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("retire_provider_clinic_service", {
    p_service_id: serviceId,
  });
  if (error) return failure(error);
  return success(undefined);
}

export async function getPublicClinic(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<PublicClinicSummary>> {
  const { data, error } = await client
    .from("organizations")
    .select(publicClinicSummaryColumns)
    .eq("id", organizationId)
    .eq("active", true)
    .single();
  if (error) return failure(error);
  return success(data as unknown as PublicClinicSummary);
}

/** Public clinic directory. Selecting a clinic scopes every following query. */
export async function getPublicClinics(
  client: SupabaseClient<Database>,
): Promise<SupabaseResult<PublicClinicSummary[]>> {
  const { data, error } = await client
    .from("organizations")
    .select(publicClinicSummaryColumns)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as PublicClinicSummary[]);
}

/** The single clinic assigned to the signed-in operational staff account. */
export async function getCurrentStaffOrganization(
  client: SupabaseClient<Database>,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("get_current_staff_organization");
  if (error) return failure(error);
  if (!data) return failure({ message: "No active staff clinic is assigned." });
  return success(data);
}

export async function getCurrentProviderRoleId(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<string | null>> {
  const { data, error } = await client.rpc("get_current_provider_role_id", {
    p_organization_id: organizationId,
  });
  return error ? failure(error) : success(data);
}

/** Checks portal admission through the database before an app loads its UI. */
export async function getPortalAccess(
  client: SupabaseClient<Database>,
  portal: PortalName,
): Promise<SupabaseResult<PortalAccess>> {
  const { data, error } = await client.rpc("get_portal_access", {
    p_portal: portal,
  });
  if (error) return failure(error);
  const access = data?.[0];
  if (!access)
    return failure({ message: "Portal access could not be determined." });
  return success({
    allowed: access.is_allowed,
    isSuperadmin: access.is_superadmin,
    organizationIds: access.organization_ids ?? [],
    roleCodes: access.role_codes ?? [],
  });
}

/** Creates an Auth account and its clinic-scoped staff/admin assignment. */
export async function createClinicAccount(
  client: SupabaseClient<Database>,
  input: ClinicAccountInput,
): Promise<SupabaseResult<CreatedClinicAccount>> {
  const { data, error } = await client.functions.invoke("create-clinic-user", {
    body: {
      display_name: input.displayName.trim(),
      email: input.email.trim(),
      organization_id: input.organizationId,
      password: input.password,
      role_code: input.roleCode,
    },
  });
  if (error) {
    const functionResponse =
      typeof error === "object" && error !== null && "context" in error
        ? error.context
        : null;
    if (
      typeof functionResponse === "object" &&
      functionResponse !== null &&
      "clone" in functionResponse &&
      typeof functionResponse.clone === "function"
    ) {
      try {
        const body = (await functionResponse.clone().json()) as {
          error?: unknown;
        };
        if (typeof body.error === "string")
          return failure({ message: body.error });
      } catch {
        // Fall through to Supabase's safe generic error message.
      }
    }
    return failure(error);
  }
  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    typeof data.role_code !== "string"
  ) {
    return failure({ message: "The clinic account could not be created." });
  }
  return success({
    id: data.id,
    email: data.email,
    roleCode: data.role_code as CreatedClinicAccount["roleCode"],
  });
}

/** Organizations explicitly assigned to the current administrative user. */
export async function getAccessibleOrganizations(
  client: SupabaseClient<Database>,
  organizationIds: string[],
): Promise<SupabaseResult<PublicClinicSummary[]>> {
  if (!organizationIds.length) return success([]);
  const { data, error } = await client
    .from("organizations")
    .select(publicClinicSummaryColumns)
    .in("id", organizationIds)
    .order("name", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as PublicClinicSummary[]);
}

/** Explicitly enrolls the universal patient identity at a selected clinic. */
export async function enrollPatientAtClinic(
  client: SupabaseClient<Database>,
  organizationId: string,
  displayName: string,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("enroll_patient_at_clinic", {
    p_display_name: displayName.trim(),
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(data);
}

/** Sets the one clinic context enforced for this patient's direct RLS reads. */
export async function setPatientClinicContext(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("set_patient_clinic_context", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(undefined);
}

/** Active patients visible to front-desk RLS for administrative booking. */
export async function getOrganizationPatients(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<PatientSummary[]>> {
  const { data, error } = await client
    .from("patients")
    .select(patientSummaryColumns)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) return failure(error);
  const rows = (data ?? []) as unknown as Array<
    Omit<PatientSummary, "displayName">
  >;
  return success(rows.map(toPatientSummary));
}

/** Availability visible to the current provider through PractitionerRole RLS. */
export async function getProviderAppointmentSlots(
  client: SupabaseClient<Database>,
  organizationId: string,
  from: Date = new Date(),
): Promise<SupabaseResult<AppointmentSlotSummary[]>> {
  const { data, error } = await client
    .from("appointment_slots")
    .select(appointmentSlotSummaryColumns)
    .eq("organization_id", organizationId)
    .gte("start_at", from.toISOString())
    .order("start_at", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as AppointmentSlotSummary[]);
}

export async function createAppointmentSlot(
  client: SupabaseClient<Database>,
  input: AppointmentSlotInput,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("create_appointment_slot", {
    p_clinic_service_id: input.clinicServiceId,
    p_end_at: input.endAt,
    p_start_at: input.startAt,
  });
  if (error) return failure(error);
  return success(data);
}

/** Creates consecutive, service-length slots across a provider-selected period. */
export async function createAppointmentSlotRange(
  client: SupabaseClient<Database>,
  input: AppointmentSlotInput,
): Promise<SupabaseResult<number>> {
  const { data, error } = await client.rpc("create_appointment_slot_range", {
    p_clinic_service_id: input.clinicServiceId,
    p_end_at: input.endAt,
    p_start_at: input.startAt,
  });
  if (error) return failure(error);
  return success(Number(data));
}

/** Saves a provider's recurring weekly hours and refreshes future free slots. */
export async function saveProviderWeeklyAvailability(
  client: SupabaseClient<Database>,
  clinicServiceId: string,
  windows: WeeklyAvailabilityWindow[],
): Promise<SupabaseResult<number>> {
  const { data, error } = await client.rpc(
    "save_provider_weekly_availability",
    {
      p_clinic_service_id: clinicServiceId,
      p_windows: windows.map((window) => ({
        day_of_week: window.dayOfWeek,
        start_time: window.startTime,
        end_time: window.endTime,
      })),
    },
  );
  if (error) return failure(error);
  return success(Number(data));
}

export async function setAppointmentSlotUnavailable(
  client: SupabaseClient<Database>,
  slotId: string,
  unavailable: boolean,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("set_appointment_slot_unavailable", {
    p_slot_id: slotId,
    p_unavailable: unavailable,
  });
  if (error) return failure(error);
  return success(undefined);
}

/** Atomically consumes a free slot. Staff may supply a patient; patients may not. */
export async function bookAppointmentSlot(
  client: SupabaseClient<Database>,
  slotId: string,
  patientId?: string,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("book_appointment_slot", {
    p_slot_id: slotId,
    ...(patientId ? { p_patient_id: patientId } : {}),
  });
  if (error) return failure(error);
  return success(data);
}

export interface DayRange {
  end: string;
  start: string;
}

/** Browser-local calendar day expressed as the UTC range required by Postgres. */
export function getLocalDayRange(date: Date = new Date()): DayRange {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Appointment queue visible through actor-specific Appointment RLS. */
export async function getDailyAppointmentQueue(
  client: SupabaseClient<Database>,
  organizationId: string,
  range: DayRange = getLocalDayRange(),
  statuses: AppointmentStatus[] = ["booked", "arrived"],
): Promise<SupabaseResult<AppointmentQueueItem[]>> {
  const { data: appointments, error: appointmentError } = await client
    .from("appointments")
    .select(appointmentSummaryColumns)
    .eq("organization_id", organizationId)
    .gte("start_at", range.start)
    .lt("start_at", range.end)
    .in("status", statuses)
    .order("start_at", { ascending: true });
  if (appointmentError) return failure(appointmentError);

  const appointmentRows = (appointments ??
    []) as unknown as AppointmentSummary[];
  const patientIds = [...new Set(appointmentRows.map((row) => row.patient_id))];
  if (!patientIds.length) return success([]);

  const { data: patients, error: patientError } = await client
    .from("patients")
    .select("id, name")
    .in("id", patientIds);
  if (patientError) return failure(patientError);
  const { data: encounters, error: encounterError } = await client
    .from("encounters")
    .select("id, appointment_id, status")
    .in(
      "appointment_id",
      appointmentRows.map((appointment) => appointment.id),
    );
  if (encounterError) return failure(encounterError);
  const encounterRows = encounters ?? [];
  const encounterIds = encounterRows.map((encounter) => encounter.id);
  const { data: triageObservations, error: triageError } = encounterIds.length
    ? await client
        .from("observations")
        .select("encounter_id")
        .in("encounter_id", encounterIds)
        .eq("code", "TRIAGE-VITALS")
        .eq("status", "final")
    : { data: [], error: null };
  if (triageError) return failure(triageError);

  const names = new Map(
    (patients ?? []).map((patient) => [
      patient.id,
      getHumanNameDisplay(patient.name),
    ]),
  );
  const encounterStatuses = new Map(
    encounterRows.map((encounter) => [
      encounter.appointment_id,
      encounter.status,
    ]),
  );
  const triagedEncounterIds = new Set(
    (triageObservations ?? []).map((observation) => observation.encounter_id),
  );
  const triageStatusByAppointment = new Map(
    encounterRows.map((encounter) => [
      encounter.appointment_id,
      (triagedEncounterIds.has(encounter.id) ? "complete" : "pending") as
        "complete" | "pending",
    ]),
  );

  return success(
    appointmentRows.map((appointment) => ({
      ...appointment,
      encounterStatus: encounterStatuses.get(appointment.id) ?? null,
      patientName: names.get(appointment.patient_id) ?? "Patient",
      triageStatus: triageStatusByAppointment.get(appointment.id) ?? "pending",
    })),
  );
}

export async function updateAppointmentStatus(
  client: SupabaseClient<Database>,
  appointmentId: string,
  status: "arrived" | "cancelled" | "noshow",
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("update_appointment_status", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error) return failure(error);
  return success(undefined);
}

export async function startAppointmentEncounter(
  client: SupabaseClient<Database>,
  appointmentId: string,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("start_appointment_encounter", {
    p_appointment_id: appointmentId,
  });
  if (error) return failure(error);
  return success(data);
}

export type RealtimeConnectionStatus =
  "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

/** Reusable live-queue pattern: RLS is evaluated for every Appointment event. */
export function subscribeToAppointmentQueue(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
  onStatus?: (status: RealtimeConnectionStatus) => void,
): () => void {
  const channel = client
    .channel(`appointment-queue:${organizationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "appointments",
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}

/** Public queue snapshot. Rows contain no patient name or patient identifier. */
export async function getWaitingRoomQueue(
  client: SupabaseClient<Database>,
  organizationId: string,
  date: Date = new Date(),
): Promise<SupabaseResult<WaitingRoomQueueItem[]>> {
  const queueDate = date.toISOString().slice(0, 10);
  const { data, error } = await client
    .from("waiting_room_queue")
    .select(waitingRoomQueueColumns)
    .eq("organization_id", organizationId)
    .eq("queue_date", queueDate)
    .order("queue_number", { ascending: true });
  if (error) return failure(error);
  return success((data ?? []) as unknown as WaitingRoomQueueItem[]);
}

export function subscribeToWaitingRoomQueue(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
  onStatus?: (status: RealtimeConnectionStatus) => void,
): () => void {
  const channel = client
    .channel(`waiting-room:${organizationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "waiting_room_queue",
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    )
    .subscribe((status) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

/** Calls the PIN-protected Edge Function and validates its response shape. */
export async function getWalkInPatientRecords(
  client: SupabaseClient<Database>,
  credentials: WalkInAccessInput,
): Promise<SupabaseResult<WalkInAccessRecords>> {
  const { data, error } = await client.functions.invoke("get-walk-in-records", {
    body: {
      organization_id: credentials.organizationId,
      walk_in_id: credentials.walkInId,
      pin: credentials.pin,
    },
  });
  if (error) return failure(error);
  if (!isWalkInAccessRecords(data))
    return failure({
      message: "Walk-in access returned an invalid record response.",
    });
  return success(data);
}

function isWalkInAccessRecords(value: unknown): value is WalkInAccessRecords {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.patients) &&
    Array.isArray(response.appointments) &&
    Array.isArray(response.encounters) &&
    Array.isArray(response.observations)
  );
}

/* ─── Loop 5: Financial functions ─── */

export async function getBillingWorkspace(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<BillingWorkspace>> {
  const { data, error } = await client.rpc("get_billing_workspace", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  const workspace = data as unknown as BillingWorkspace;
  return success({
    billing_events: workspace?.billing_events ?? [],
    invoices: workspace?.invoices ?? [],
    recent_payments: workspace?.recent_payments ?? [],
    pos_sales: workspace?.pos_sales ?? [],
  });
}

export async function getBillableEncounters(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<BillableEncounter[]>> {
  const { data, error } = await client.rpc("get_billable_encounters", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success(
    ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      patient_id: row.patient_id as string,
      patient_name: row.patient_name as string,
      appointment_id: (row.appointment_id as string) ?? null,
      service_type: (row.service_type as string) ?? null,
      period_start: (row.period_start as string) ?? null,
      period_end: (row.period_end as string) ?? null,
      status: row.status as BillableEncounter["status"],
      service_name: (row.service_name as string) ?? null,
      service_price: row.service_price != null ? Number(row.service_price) : null,
    })),
  );
}

export async function getBillingLineItems(
  client: SupabaseClient<Database>,
  billingEventId: string,
): Promise<SupabaseResult<BillingLineItemSummary[]>> {
  const { data, error } = await client.rpc("get_billing_line_items", {
    p_billing_event_id: billingEventId,
  });
  if (error) return failure(error);
  return success(
    ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      source_type: row.source_type as BillingLineItemSummary["source_type"],
      source_id: (row.source_id as string) ?? null,
      description: row.description as string,
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
      currency: row.currency as string,
      line_total: Number(row.line_total),
    })),
  );
}

export async function generateBillingEvent(
  client: SupabaseClient<Database>,
  organizationId: string,
  encounterId: string,
  payorTypeOverride?: PayorType,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("generate_billing_event", {
    p_organization_id: organizationId,
    p_encounter_id: encounterId,
    p_payor_type_override: payorTypeOverride ?? null,
  });
  if (error) return failure(error);
  return success(data as string);
}

export async function finalizeBillingEvent(
  client: SupabaseClient<Database>,
  billingEventId: string,
): Promise<SupabaseResult<{ route: string; invoice_id?: string; claim_id?: string }>> {
  const { data, error } = await client.rpc("finalize_billing_event", {
    p_billing_event_id: billingEventId,
  });
  if (error) return failure(error);
  return success(data as unknown as { route: string; invoice_id?: string; claim_id?: string });
}

export async function recordPayment(
  client: SupabaseClient<Database>,
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  reference?: string,
): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("record_payment", {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: method,
    p_reference: reference ?? null,
  });
  if (error) return failure(error);
  return success(data as string);
}

export async function createPosSale(
  client: SupabaseClient<Database>,
  organizationId: string,
  items: PosCartItem[],
  customerName?: string,
  paymentMethod?: PaymentMethod,
): Promise<SupabaseResult<PosCheckoutResult>> {
  const { data, error } = await client.rpc("create_pos_sale", {
    p_organization_id: organizationId,
    p_items: items as unknown as Json,
    p_customer_name: customerName ?? null,
    p_payment_method: paymentMethod ?? "cash",
  });
  if (error) return failure(error);
  return success(data as unknown as PosCheckoutResult);
}

export async function getPatientInvoices(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<PatientInvoice[]>> {
  const { data, error } = await client.rpc("get_patient_invoices", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success((data ?? []) as unknown as PatientInvoice[]);
}

export async function getClaimsWorkspace(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<ClaimSummary[]>> {
  const { data, error } = await client.rpc("get_claims_workspace", {
    p_organization_id: organizationId,
  });
  if (error) return failure(error);
  return success((data ?? []) as unknown as ClaimSummary[]);
}

export async function submitClaim(
  client: SupabaseClient<Database>,
  claimId: string,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("submit_claim", {
    p_claim_id: claimId,
  });
  if (error) return failure(error);
  return success(undefined);
}

export async function adjudicateClaim(
  client: SupabaseClient<Database>,
  claimId: string,
  result: "approved" | "denied" | "partial",
  approvedAmount?: number,
  deniedReason?: string,
): Promise<SupabaseResult<undefined>> {
  const { error } = await client.rpc("adjudicate_claim", {
    p_claim_id: claimId,
    p_result: result,
    p_approved_amount: approvedAmount ?? null,
    p_denied_reason: deniedReason ?? null,
  });
  if (error) return failure(error);
  return success(undefined);
}

export function subscribeToInvoiceUpdates(
  client: SupabaseClient<Database>,
  organizationId: string,
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client
    .channel(`invoices:${organizationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "invoices",
        filter: `organization_id=eq.${organizationId}`,
      },
      onChange,
    )
    .subscribe((status) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}
