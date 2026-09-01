import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getHumanNameDisplay,
  type AppointmentQueueItem,
  type AppointmentSlotSummary,
  type AppointmentSlotInput,
  type AppointmentStatus,
  type AppointmentSummary,
  type ClinicServiceSummary,
  type ClinicAccountInput,
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
  "id, organization_id, code, name, description, duration_minutes, base_price, currency, booking_enabled";
const waitingRoomQueueColumns =
  "appointment_id, organization_id, queue_date, queue_number, service_name, scheduled_at, stage";
const publicClinicSummaryColumns = "id, name, telecom, address";
const encounterSummaryColumns =
  "id, organization_id, patient_id, appointment_id, practitioner_role_id, status, class_code, service_type, period_start, period_end";
const observationSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, code, code_display, effective_at, issued_at, value, value_unit, supersedes_id";
const medicationRequestSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, medication_code, medication_display, authored_on, dosage_instruction, note";
const documentReferenceSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, type_code, type_display, date_at, description, content_title";

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
  const [patients, appointments, encounters, observations, medicationRequests, documentReferences] = await Promise.all([
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
  ]);
  const error = [patients, appointments, encounters, observations, medicationRequests, documentReferences].find(
    (result) => result.error,
  )?.error;
  if (error) return failure(error);

  const patientRows = (patients.data ?? []) as unknown as Array<
    Omit<PatientSummary, "displayName">
  >;
  return success({
    patients: patientRows.map(toPatientSummary),
    appointments: (appointments.data ?? []) as unknown as AppointmentSummary[],
    encounters: (encounters.data ?? []) as unknown as EncounterSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    medicationRequests: (medicationRequests.data ?? []) as unknown as MedicationRequestSummary[],
    documentReferences: (documentReferences.data ?? []) as unknown as DocumentReferenceSummary[],
  });
}

/** Organization-scoped clinical records for the provider workspace. */
export async function getOrganizationClinicalRecords(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<OrganizationClinicalRecords>> {
  const [encounters, observations, medicationRequests, documentReferences] = await Promise.all([
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
  ]);
  const error = [encounters, observations, medicationRequests, documentReferences].find(
    (result) => result.error,
  )?.error;
  if (error) return failure(error);

  return success({
    encounters: (encounters.data ?? []) as unknown as EncounterSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    medicationRequests: (medicationRequests.data ??
      []) as unknown as MedicationRequestSummary[],
    documentReferences: (documentReferences.data ?? []) as unknown as DocumentReferenceSummary[],
  });
}

export async function addSoapObservation(client: SupabaseClient<Database>, input: SoapObservationInput): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("add_soap_observation", {
    p_encounter_id: input.encounterId,
    p_section: input.section,
    p_text: input.text,
    p_supersedes_id: input.supersedesId ?? null,
  });
  return error ? failure(error) : success(data);
}

export async function issuePrescription(client: SupabaseClient<Database>, input: PrescriptionInput): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("issue_prescription", {
    p_encounter_id: input.encounterId,
    p_medication: input.medication,
    p_dosage: input.dosage,
    p_note: input.note ?? null,
  });
  return error ? failure(error) : success(data);
}

export async function issueMedicalCertificate(client: SupabaseClient<Database>, input: MedicalCertificateInput): Promise<SupabaseResult<string>> {
  const { data, error } = await client.rpc("issue_medical_certificate", {
    p_encounter_id: input.encounterId,
    p_title: input.title,
    p_statement: input.statement,
  });
  return error ? failure(error) : success(data);
}

export async function finishClinicalEncounter(client: SupabaseClient<Database>, encounterId: string): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("finish_clinical_encounter", { p_encounter_id: encounterId });
  return error ? failure(error) : success(undefined);
}

export async function updateOwnPatientProfile(client: SupabaseClient<Database>, input: PatientProfileInput): Promise<SupabaseResult<void>> {
  const { error } = await client.rpc("update_own_patient_profile", {
    p_patient_id: input.patientId,
    p_display_name: input.displayName,
    p_birth_date: input.birthDate,
    p_gender: input.gender,
    p_phone: input.phone,
    p_address: input.address,
  });
  return error ? failure(error) : success(undefined);
}

export function subscribeToClinicalHistory(
  client: SupabaseClient<Database>, organizationId: string, onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client.channel(`clinical-history:${organizationId}`);
  for (const table of ["encounters", "observations", "medication_requests", "document_references"] as const) {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` }, onChange);
  }
  channel.subscribe((status) => onStatus?.(status));
  return () => { void client.removeChannel(channel); };
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
    p_birth_date: input.birthDate ?? null,
    p_gender: input.gender ?? null,
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
    .select("appointment_id, status")
    .in(
      "appointment_id",
      appointmentRows.map((appointment) => appointment.id),
    );
  if (encounterError) return failure(encounterError);
  const names = new Map(
    (patients ?? []).map((patient) => [
      patient.id,
      getHumanNameDisplay(patient.name),
    ]),
  );
  const encounterStatuses = new Map(
    (encounters ?? []).map((encounter) => [
      encounter.appointment_id,
      encounter.status,
    ]),
  );

  return success(
    appointmentRows.map((appointment) => ({
      ...appointment,
      encounterStatus: encounterStatuses.get(appointment.id) ?? null,
      patientName: names.get(appointment.patient_id) ?? "Patient",
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
