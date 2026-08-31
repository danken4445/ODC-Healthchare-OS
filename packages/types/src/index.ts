/** FHIR resource types represented by the foundational relational schema. */
export type { Database, Json } from "./database";

import type { Database, Json } from "./database";

/** A generated database row. Keep table-shaped types at the data boundary. */
export type DatabaseRow<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type PatientRow = DatabaseRow<"patients">;
export type AppointmentRow = DatabaseRow<"appointments">;
export type AppointmentSlotRow = DatabaseRow<"appointment_slots">;
export type EncounterRow = DatabaseRow<"encounters">;
export type ObservationRow = DatabaseRow<"observations">;
export type MedicationRequestRow = DatabaseRow<"medication_requests">;

export type AppointmentStatus =
  Database["public"]["Enums"]["appointment_status"];
export type EncounterStatus = Database["public"]["Enums"]["encounter_status"];
export type SlotStatus = Database["public"]["Enums"]["slot_status"];
export type ObservationStatus =
  Database["public"]["Enums"]["observation_status"];
export type RequestStatus = Database["public"]["Enums"]["request_status"];

/**
 * App-facing FHIR-shaped summaries. These intentionally exclude raw storage
 * fields that are not needed in UI code, such as authentication linkage and
 * walk-in PIN state.
 */
export interface PatientSummary extends Pick<
  PatientRow,
  | "id"
  | "organization_id"
  | "active"
  | "name"
  | "birth_date"
  | "gender"
  | "walk_in_id"
  | "created_at"
  | "updated_at"
> {
  displayName: string;
}

export type AppointmentSummary = Pick<
  AppointmentRow,
  | "id"
  | "organization_id"
  | "patient_id"
  | "practitioner_role_id"
  | "status"
  | "service_type"
  | "appointment_type"
  | "start_at"
  | "end_at"
  | "minutes_duration"
  | "description"
  | "patient_instruction"
>;

/** FHIR Slot fields exposed by the scheduling UI. */
export type AppointmentSlotSummary = Pick<
  AppointmentSlotRow,
  | "id"
  | "organization_id"
  | "practitioner_role_id"
  | "status"
  | "service_type"
  | "start_at"
  | "end_at"
>;

export interface AppointmentQueueItem extends AppointmentSummary {
  encounterStatus: EncounterStatus | null;
  patientName: string;
}

export type EncounterSummary = Pick<
  EncounterRow,
  | "id"
  | "organization_id"
  | "patient_id"
  | "appointment_id"
  | "practitioner_role_id"
  | "status"
  | "class_code"
  | "service_type"
  | "period_start"
  | "period_end"
>;

export type ObservationSummary = Pick<
  ObservationRow,
  | "id"
  | "organization_id"
  | "patient_id"
  | "encounter_id"
  | "status"
  | "code"
  | "code_display"
  | "effective_at"
  | "value"
  | "value_unit"
>;

export type MedicationRequestSummary = Pick<
  MedicationRequestRow,
  | "id"
  | "organization_id"
  | "patient_id"
  | "encounter_id"
  | "status"
  | "medication_code"
  | "medication_display"
  | "authored_on"
>;

export interface DateRange {
  start: Date | string;
  end: Date | string;
}

export interface PatientAccessRecords {
  patients: PatientSummary[];
  appointments: AppointmentSummary[];
  encounters: EncounterSummary[];
  observations: ObservationSummary[];
}

export interface OrganizationClinicalRecords {
  encounters: EncounterSummary[];
  observations: ObservationSummary[];
  medicationRequests: MedicationRequestSummary[];
}

export interface WalkInCredentials {
  patientId: string;
  walkInId: string;
  pin: string;
}

export interface PatientRegistrationInput {
  displayName: string;
  email: string;
  organizationId: string;
  password: string;
}

export interface PatientRegistrationResult {
  email: string;
  signedIn: boolean;
}

export interface WalkInRegistrationInput {
  organizationId: string;
  name: string;
  birthDate?: string | null;
  gender?: string | null;
}

export interface WalkInAccessInput {
  organizationId: string;
  walkInId: string;
  pin: string;
}

export interface WalkInAccessRecords {
  patients: Array<Pick<PatientSummary, "id" | "name" | "walk_in_id">>;
  appointments: AppointmentSummary[];
  encounters: Array<Pick<EncounterSummary, "id" | "status" | "period_start">>;
  observations: Array<
    Pick<ObservationSummary, "id" | "code" | "status" | "value">
  >;
}

/** Extract a human-readable display name from the FHIR HumanName JSON field. */
export function getHumanNameDisplay(name: Json): string {
  if (typeof name === "object" && name !== null && !Array.isArray(name)) {
    const text = name.text;
    if (typeof text === "string" && text.trim()) return text.trim();

    const given = name.given;
    const family = name.family;
    const givenName = Array.isArray(given)
      ? given
          .filter((value): value is string => typeof value === "string")
          .join(" ")
      : typeof given === "string"
        ? given
        : "";
    const familyName = typeof family === "string" ? family : "";
    const combined = `${givenName} ${familyName}`.trim();
    if (combined) return combined;
  }

  return "Unnamed patient";
}

export type FhirResourceType =
  | "Organization"
  | "Practitioner"
  | "PractitionerRole"
  | "Patient"
  | "Appointment"
  | "Encounter"
  | "Observation"
  | "MedicationRequest"
  | "ServiceRequest"
  | "DiagnosticReport"
  | "DocumentReference"
  | "Coverage"
  | "Claim";
export interface AuditActor {
  id: string;
  role: "patient" | "provider" | "admin" | "system";
}
