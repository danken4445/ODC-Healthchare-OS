/** FHIR resource types represented by the foundational relational schema. */
export type { Database } from './database';

export type FhirResourceType =
  | 'Organization'
  | 'Practitioner'
  | 'PractitionerRole'
  | 'Patient'
  | 'Appointment'
  | 'Encounter'
  | 'Observation'
  | 'MedicationRequest'
  | 'ServiceRequest'
  | 'DiagnosticReport'
  | 'DocumentReference'
  | 'Coverage'
  | 'Claim';
export interface AuditActor { id: string; role: 'patient' | 'provider' | 'admin' | 'system'; }
