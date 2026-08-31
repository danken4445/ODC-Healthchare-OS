import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getHumanNameDisplay,
  type AppointmentSummary,
  type Database,
  type DateRange,
  type EncounterSummary,
  type MedicationRequestSummary,
  type ObservationSummary,
  type OrganizationClinicalRecords,
  type PatientAccessRecords,
  type PatientSummary,
  type WalkInAccessInput,
  type WalkInAccessRecords,
  type WalkInCredentials,
  type WalkInRegistrationInput,
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
  "id, organization_id, active, name, birth_date, gender, walk_in_id, created_at, updated_at";
const appointmentSummaryColumns =
  "id, organization_id, patient_id, practitioner_role_id, status, service_type, appointment_type, start_at, end_at, minutes_duration, description, patient_instruction";
const encounterSummaryColumns =
  "id, organization_id, patient_id, appointment_id, practitioner_role_id, status, class_code, service_type, period_start, period_end";
const observationSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, code, code_display, effective_at, value, value_unit";
const medicationRequestSummaryColumns =
  "id, organization_id, patient_id, encounter_id, status, medication_code, medication_display, authored_on";

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
): Promise<SupabaseResult<PatientAccessRecords>> {
  const [patients, appointments, encounters, observations] = await Promise.all([
    client.from("patients").select(patientSummaryColumns),
    client
      .from("appointments")
      .select(appointmentSummaryColumns)
      .order("start_at", { ascending: true }),
    client
      .from("encounters")
      .select(encounterSummaryColumns)
      .order("period_start", { ascending: true }),
    client
      .from("observations")
      .select(observationSummaryColumns)
      .order("effective_at", { ascending: false }),
  ]);
  const error = [patients, appointments, encounters, observations].find(
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
  });
}

/** Organization-scoped clinical records for the provider workspace. */
export async function getOrganizationClinicalRecords(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<SupabaseResult<OrganizationClinicalRecords>> {
  const [encounters, observations, medicationRequests] = await Promise.all([
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
  ]);
  const error = [encounters, observations, medicationRequests].find(
    (result) => result.error,
  )?.error;
  if (error) return failure(error);

  return success({
    encounters: (encounters.data ?? []) as unknown as EncounterSummary[],
    observations: (observations.data ?? []) as unknown as ObservationSummary[],
    medicationRequests: (medicationRequests.data ??
      []) as unknown as MedicationRequestSummary[],
  });
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
  return success({ walkInId: result.walk_in_id, pin: result.pin });
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
    Array.isArray(response.encounters) &&
    Array.isArray(response.observations)
  );
}
