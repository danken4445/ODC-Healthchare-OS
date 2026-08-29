/** FHIR resource types belong here as each clinical domain is introduced. */
export type FhirResourceType = 'Patient' | 'Encounter' | 'Observation' | 'Appointment';
export interface AuditActor { id: string; role: 'patient' | 'provider' | 'admin' | 'system'; }
