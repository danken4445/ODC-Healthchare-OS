/** FHIR resource types represented by the foundational relational schema. */
export type { Database, Json } from "./database";

import type { Database, Json } from "./database";

/** A generated database row. Keep table-shaped types at the data boundary. */
export type DatabaseRow<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type PatientRow = DatabaseRow<"patients">;
export type PatientClinicContextRow = DatabaseRow<"patient_clinic_contexts">;
export type AppointmentRow = DatabaseRow<"appointments">;
export type AppointmentSlotRow = DatabaseRow<"appointment_slots">;
export type ClinicServiceRow = DatabaseRow<"clinic_services">;
export type EncounterRow = DatabaseRow<"encounters">;
export type ObservationRow = DatabaseRow<"observations">;
export type MedicationRequestRow = DatabaseRow<"medication_requests">;
export type DocumentReferenceRow = DatabaseRow<"document_references">;
export type OrganizationRow = DatabaseRow<"organizations">;
export type PlatformAdminRow = DatabaseRow<"platform_admins">;
export type ProviderWeeklyAvailabilityRow =
  DatabaseRow<"provider_weekly_availability">;
export type WaitingRoomQueueRow = DatabaseRow<"waiting_room_queue">;
export type DepartmentRow = DatabaseRow<"departments">;
export type InventoryItemRow = DatabaseRow<"inventory_items">;
export type DepartmentStockRow = DatabaseRow<"department_stock">;
export type InventoryUsageRow = DatabaseRow<"inventory_usages">;
export type InventoryStockMovementRow =
  DatabaseRow<"inventory_stock_movements">;
export type StaffDepartmentAssignmentRow =
  DatabaseRow<"staff_department_assignments">;

export type AppointmentStatus =
  Database["public"]["Enums"]["appointment_status"];
export type EncounterStatus = Database["public"]["Enums"]["encounter_status"];
export type SlotStatus = Database["public"]["Enums"]["slot_status"];
export type ObservationStatus =
  Database["public"]["Enums"]["observation_status"];
export type RequestStatus = Database["public"]["Enums"]["request_status"];
export type WaitingQueueStage =
  Database["public"]["Enums"]["waiting_queue_stage"];

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
  | "telecom"
  | "address"
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
  | "clinic_service_id"
  | "queue_date"
  | "queue_number"
>;

/** FHIR Slot fields exposed by the scheduling UI. */
export type AppointmentSlotSummary = Pick<
  AppointmentSlotRow,
  | "id"
  | "appointment_id"
  | "organization_id"
  | "practitioner_role_id"
  | "clinic_service_id"
  | "status"
  | "service_type"
  | "start_at"
  | "end_at"
>;

/** Public FHIR HealthcareService fields used by the clinic portal. */
export type ClinicServiceSummary = Pick<
  ClinicServiceRow,
  | "id"
  | "organization_id"
  | "owner_practitioner_role_id"
  | "code"
  | "name"
  | "description"
  | "duration_minutes"
  | "base_price"
  | "currency"
  | "booking_enabled"
>;

/** Values a provider can maintain for a service offered from their clinic. */
export interface ClinicServiceInput {
  code: string;
  name: string;
  description?: string;
  durationMinutes: number;
  basePrice?: number | null;
  bookingEnabled: boolean;
}

export interface WeeklyAvailabilityWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Public waiting-room projection. It intentionally contains no patient data. */
export type WaitingRoomQueueItem = Pick<
  WaitingRoomQueueRow,
  | "appointment_id"
  | "organization_id"
  | "queue_date"
  | "queue_number"
  | "service_name"
  | "scheduled_at"
  | "stage"
>;

export type PublicClinicSummary = Pick<
  OrganizationRow,
  "id" | "name" | "telecom" | "address"
>;

export type PortalName = "patient" | "provider" | "admin";

/** Database-authoritative result used to admit a signed-in identity to a portal. */
export interface PortalAccess {
  allowed: boolean;
  isSuperadmin: boolean;
  organizationIds: string[];
  roleCodes: string[];
}

export type AssignableClinicAccountRole = string;

export interface ClinicAccountInput {
  displayName: string;
  email: string;
  organizationId: string;
  password: string;
  roleCode: AssignableClinicAccountRole;
}

export interface CreatedClinicAccount {
  id: string;
  email: string;
  roleCode: AssignableClinicAccountRole;
}

export type ClinicRolePermission =
  | "can_access_admin_portal"
  | "can_access_provider_portal"
  | "can_manage_appointments"
  | "can_record_triage"
  | "can_start_consultation"
  | "can_manage_provider_schedule"
  | "can_manage_staff_roles"
  | "can_view_inventory"
  | "can_manage_inventory"
  | "can_tag_inventory_usage";

export interface ClinicRoleDefinition {
  code: string;
  name: string;
  isCustom: boolean;
  permissions: ClinicRolePermission[];
}

export interface AppointmentQueueItem extends AppointmentSummary {
  encounterStatus: EncounterStatus | null;
  patientName: string;
  triageStatus: "pending" | "complete";
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
  | "supersedes_id"
  | "issued_at"
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
  | "dosage_instruction"
  | "note"
>;

export type DocumentReferenceSummary = Pick<
  DocumentReferenceRow,
  | "id"
  | "organization_id"
  | "patient_id"
  | "encounter_id"
  | "status"
  | "type_code"
  | "type_display"
  | "date_at"
  | "description"
  | "content_title"
>;

export interface SoapObservationInput {
  encounterId: string;
  section: "S" | "O" | "A" | "P";
  text: string;
  supersedesId?: string | null;
}

export interface SoapNoteInput {
  encounterId: string;
  text: string;
  supersedesId?: string | null;
}

export interface TriageVitalSignsInput {
  appointmentId: string;
  systolicBp: number;
  diastolicBp: number;
  pulseBpm: number;
  respiratoryRate: number;
  temperatureC: number;
  oxygenSaturation: number;
  weightKg?: number | null;
  heightCm?: number | null;
  painScore?: number | null;
  acuity: "routine" | "urgent" | "emergency";
  chiefComplaint?: string | null;
  notes?: string | null;
  supersedesId?: string | null;
}

export interface PrescriptionInput {
  encounterId: string;
  medication: string;
  dosage: string;
  note?: string;
}

export interface MedicalCertificateInput {
  encounterId: string;
  title: string;
  statement: string;
}

export type DepartmentSummary = Pick<
  DepartmentRow,
  "id" | "organization_id" | "code" | "name" | "description" | "active"
>;

export type InventoryItemSummary = Pick<
  InventoryItemRow,
  | "id"
  | "organization_id"
  | "sku"
  | "name"
  | "description"
  | "unit_of_measure"
  | "unit_price"
  | "currency"
  | "active"
>;

export type DepartmentStockSummary = Pick<
  DepartmentStockRow,
  | "id"
  | "organization_id"
  | "item_id"
  | "department_id"
  | "quantity"
  | "reorder_level"
  | "updated_at"
>;

export type InventoryUsageSummary = Pick<
  InventoryUsageRow,
  | "id"
  | "organization_id"
  | "stock_id"
  | "item_id"
  | "department_id"
  | "encounter_id"
  | "patient_id"
  | "quantity"
  | "unit_price"
  | "currency"
  | "tagged_by"
  | "used_at"
> & {
  actorName?: string | null;
};

export type InventoryStockMovementSummary = Pick<
  InventoryStockMovementRow,
  | "id"
  | "organization_id"
  | "stock_id"
  | "item_id"
  | "department_id"
  | "movement_type"
  | "quantity_delta"
  | "reason"
  | "usage_id"
  | "transfer_group_id"
  | "recorded_by"
  | "occurred_at"
> & {
  actorName?: string | null;
};

export interface InventoryWorkspace {
  departments: DepartmentSummary[];
  items: InventoryItemSummary[];
  stock: DepartmentStockSummary[];
  usages: InventoryUsageSummary[];
  movements: InventoryStockMovementSummary[];
}

export interface InventoryItemInput {
  organizationId: string;
  sku: string;
  name: string;
  description?: string;
  unitOfMeasure: string;
  unitPrice: number;
  currency?: string;
}

export interface DepartmentInput {
  organizationId: string;
  code: string;
  name: string;
  description?: string;
}

export interface StockAdjustmentInput {
  itemId: string;
  departmentId: string;
  quantityDelta: number;
  reason: string;
  movementType: "opening" | "receipt" | "adjustment";
}

export interface StockTransferInput {
  itemId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  quantity: number;
  reason: string;
}

export interface InventoryUsageInput {
  encounterId: string;
  stockId: string;
  quantity: number;
  departmentId?: string | null;
}

export interface ClinicStaffMember {
  userId: string;
  displayName: string;
  email: string | null;
  roleCode: string;
  departmentId: string | null;
  active: boolean;
}

export interface StaffAdministration {
  departments: DepartmentSummary[];
  staff: ClinicStaffMember[];
}

export interface InventoryEncounterOption {
  id: string;
  serviceType: string | null;
  periodStart: string | null;
}

export interface PatientProfileInput {
  patientId: string;
  displayName: string;
  birthDate: string | null;
  gender: "female" | "male" | "other" | "unknown" | null;
  phone: string;
  address: string;
}

export interface DateRange {
  start: Date | string;
  end: Date | string;
}

export interface AppointmentSlotInput {
  clinicServiceId: string;
  endAt: string;
  startAt: string;
}

export interface PatientAccessRecords {
  patients: PatientSummary[];
  appointments: AppointmentSummary[];
  encounters: EncounterSummary[];
  observations: ObservationSummary[];
  medicationRequests: MedicationRequestSummary[];
  documentReferences: DocumentReferenceSummary[];
}

export interface OrganizationClinicalRecords {
  encounters: EncounterSummary[];
  observations: ObservationSummary[];
  medicationRequests: MedicationRequestSummary[];
  documentReferences: DocumentReferenceSummary[];
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
  | "Location"
  | "InventoryItem"
  | "SupplyDelivery"
  | "Coverage"
  | "Claim";
export interface AuditActor {
  id: string;
  role: "patient" | "provider" | "admin" | "system";
}
