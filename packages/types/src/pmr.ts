/**
 * Patient Medical Record (PMR) - Standardized Clinical Document Specification
 * Compliant with Philippine Healthcare Standards, DOH, PhilHealth, RA 10173 (Data Privacy Act),
 * and FHIR R4 Clinical Document Architecture.
 */

export type PmrCopyType = "Official Copy" | "Patient Copy" | "Uncontrolled Copy";
export type PmrWatermark = "UNCONTROLLED COPY" | "VOID" | "DRAFT" | null;
export type PmrPageSize = "A4" | "Letter";

export type PmrSectionId =
  | "header"
  | "control_block"
  | "patient_identification"
  | "alerts_banner"
  | "problem_list"
  | "current_medications"
  | "vital_signs_trend"
  | "encounter_history"
  | "diagnostic_results"
  | "procedures_and_immunizations"
  | "past_medical_history"
  | "attachments_index"
  | "attestation_and_signatures"
  | "footer";

export type PmrPreset = "full_record" | "continuity_of_care" | "referral_packet" | "patient_copy";

export const PMR_SECTION_PRESETS: Record<PmrPreset, { label: string; description: string; sections: PmrSectionId[] }> = {
  full_record: {
    label: "Full Medical Record",
    description: "Comprehensive clinical record containing all chart sections, encounters, diagnostics, and history.",
    sections: [
      "header",
      "control_block",
      "patient_identification",
      "alerts_banner",
      "problem_list",
      "current_medications",
      "vital_signs_trend",
      "encounter_history",
      "diagnostic_results",
      "procedures_and_immunizations",
      "past_medical_history",
      "attachments_index",
      "attestation_and_signatures",
      "footer",
    ],
  },
  continuity_of_care: {
    label: "Summary (Continuity of Care)",
    description: "Compact transition-of-care summary for referring facilities, admissions, or handovers.",
    sections: [
      "header",
      "control_block",
      "patient_identification",
      "alerts_banner",
      "problem_list",
      "current_medications",
      "vital_signs_trend",
      "encounter_history",
      "attestation_and_signatures",
      "footer",
    ],
  },
  referral_packet: {
    label: "Referral Packet",
    description: "Targeted clinical data for specialist consultation, diagnostics, and active treatment orders.",
    sections: [
      "header",
      "control_block",
      "patient_identification",
      "alerts_banner",
      "problem_list",
      "current_medications",
      "diagnostic_results",
      "procedures_and_immunizations",
      "attestation_and_signatures",
      "footer",
    ],
  },
  patient_copy: {
    label: "Patient Copy",
    description: "Personal health record copy formatted for the patient with non-confidential clinical summaries.",
    sections: [
      "header",
      "control_block",
      "patient_identification",
      "alerts_banner",
      "problem_list",
      "current_medications",
      "vital_signs_trend",
      "encounter_history",
      "diagnostic_results",
      "procedures_and_immunizations",
      "attachments_index",
      "attestation_and_signatures",
      "footer",
    ],
  },
};

export type PmrSensitiveCategory =
  | "mental_health"
  | "infectious_disease_hiv"
  | "reproductive_health"
  | "substance_use"
  | "genetic_testing";

export interface PmrRedactionRecord {
  sectionId: PmrSectionId;
  itemId?: string;
  field: string;
  category: PmrSensitiveCategory;
  reason: string;
  redactedAt: string;
}

export interface PmrFacilityHeader {
  facilityName: string;
  facilityLogoUrl?: string | null;
  facilityAddress: string;
  contactNumber: string;
  email?: string | null;
  dohLicenseNumber?: string | null;
  philhealthAccreditationNumber?: string | null;
  documentTitle: "PATIENT MEDICAL RECORD";
  subtitle?: string | null;
  organizationId?: string;
}

export interface PmrControlBlock {
  documentId: string;
  mrn: string;
  recordRevision: number;
  generatedAtIso: string;
  generatedAtReadable: string; // e.g. "October 2, 2026, 08:30 AM PHT"
  timezone: "Asia/Manila";
  generatedBy: {
    name: string;
    role: string;
    userId: string;
  };
  purposeOfRelease: string;
  copyType: PmrCopyType;
  watermark: PmrWatermark;
  sha256Hash: string;
  verificationUrl: string;
  organizationId?: string;
  patientId?: string;
  encounterScopedId?: string | null;
}

export interface PmrEmergencyContact {
  name: string;
  relationship: string;
  contactNumber: string;
}

export interface PmrPatientIdentification {
  patientId: string;
  mrn: string;
  fullName: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  suffix?: string;
  sex: "Male" | "Female" | "Other" | "Unknown";
  dateOfBirth: string; // YYYY-MM-DD
  ageYears: number;
  ageFormatted: string; // e.g., "34 y/o" or "8 mos"
  civilStatus: "Single" | "Married" | "Widowed" | "Separated" | "Divorced" | "Not Stated";
  residentialAddress: string;
  contactNumber: string;
  emailAddress?: string | null;
  emergencyContact: PmrEmergencyContact;
  philhealthNumber: string; // e.g. "12-345678901-2" or "Not Registered"
  hmoDetails: {
    providerName: string;
    policyNumber: string;
    coverageType?: string | null;
    status: string;
  };
  bloodType: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "Unknown";
  photoUrl?: string | null;
}

export interface PmrAllergyItem {
  id: string;
  substance: string;
  clinicalStatus: "active" | "inactive" | "resolved";
  verificationStatus: "confirmed" | "unconfirmed" | "refuted";
  category: "food" | "medication" | "environment" | "biologic" | "other";
  criticality: "low" | "high" | "unable-to-assess";
  manifestation: string; // Reaction description
  recordedDate?: string | null;
}

export interface PmrAlertsBanner {
  hasAllergies: boolean;
  allergyStatement: string; // "No known drug allergies (NKDA)" or list overview
  allergies: PmrAllergyItem[];
  criticalFlags: Array<{
    id: string;
    title: string;
    description: string;
    severity: "critical" | "warning" | "advisory";
  }>;
  codeStatus: "Full Code" | "DNR (Do Not Resuscitate)" | "DNI (Do Not Intubate)" | "Limited Intervention" | "Not Documented";
}

export interface PmrProblemItem {
  id: string;
  code: string; // ICD-10 or SNOMED
  display: string;
  clinicalStatus: "active" | "recurrence" | "relapse" | "inactive" | "remission" | "resolved";
  verificationStatus: "provisional" | "differential" | "confirmed" | "refuted";
  onsetDate?: string | null;
  resolvedDate?: string | null;
  recordedBy?: string | null;
  isSensitive?: boolean;
}

export interface PmrProblemListSection {
  statement: string; // "No active problem list diagnoses recorded" if empty
  activeProblems: PmrProblemItem[];
  resolvedProblems: PmrProblemItem[];
}

export interface PmrMedicationItem {
  id: string;
  drugName: string;
  brandName?: string | null;
  strength: string;
  dosage: string;
  route: string; // e.g., Oral, IV, Topical
  frequency: string; // e.g., BID, TID, Once daily
  indication?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  prescriberName: string;
  prcLicenseNo?: string | null;
  status: "active" | "completed" | "discontinued" | "on-hold";
}

export interface PmrCurrentMedicationsSection {
  statement: string; // "No current medications on record" if empty
  medications: PmrMedicationItem[];
}

export interface PmrVitalReading {
  recordedAt: string;
  recordedAtFormatted: string;
  bloodPressure: string; // e.g. "120/80"
  systolicBp: number;
  diastolicBp: number;
  heartRateBpm: number;
  respiratoryRateBpm: number;
  temperatureCelsius: number;
  oxygenSaturationPct: number;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  recordedByName?: string | null;
}

export interface PmrVitalSignsSection {
  statement: string; // "No vital signs readings recorded" if empty
  latestReading?: PmrVitalReading | null;
  historicalReadings: PmrVitalReading[];
}

export interface PmrEncounterHistoryItem {
  id: string;
  date: string;
  dateFormatted: string;
  type: "Outpatient (OPD)" | "Inpatient (IPD)" | "Teleconsult" | "Emergency (ER)";
  serviceName: string;
  attendingPhysician: string;
  physicianRole?: string | null;
  prcLicenseNo?: string | null;
  chiefComplaint: string;
  soapSummary: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    rawNote?: string | null;
  };
  diagnoses: string[];
  ordersSummary: string[];
  disposition: string; // e.g., "Discharged with medications", "Scheduled for follow-up in 2 weeks"
}

export interface PmrEncounterHistorySection {
  statement: string; // "No encounter history recorded" if empty
  encounters: PmrEncounterHistoryItem[];
}

export interface PmrDiagnosticResultItem {
  id: string;
  reportCode: string;
  testName: string;
  category: "Laboratory" | "Radiology" | "Pathology" | "Cardiology" | "Other";
  value: string;
  unit: string;
  referenceRange: string;
  abnormalFlag: "NORMAL" | "H" | "L" | "CRITICAL";
  collectionDate: string;
  resultDate: string;
  status: "Final" | "Preliminary" | "Amended";
  performingFacility: string;
  interpretation?: string | null;
}

export interface PmrDiagnosticResultsSection {
  statement: string; // "No laboratory or diagnostic results on file" if empty
  results: PmrDiagnosticResultItem[];
}

export interface PmrProcedureItem {
  id: string;
  code: string;
  name: string;
  performedDate: string;
  performedByName: string;
  notes?: string | null;
}

export interface PmrImmunizationItem {
  id: string;
  vaccineName: string;
  administeredDate: string;
  doseNumber: string;
  lotNumber?: string | null;
  administeredByName: string;
}

export interface PmrReferralItem {
  id: string;
  referredTo: string;
  specialty: string;
  reason: string;
  priority: "Routine" | "Urgent" | "Stat";
  orderDate: string;
  status: string;
}

export interface PmrMedicalCertificateItem {
  id: string;
  documentTitle: string;
  issuedDate: string;
  statement: string;
  attendingPhysician: string;
  prcLicenseNo?: string | null;
}

export interface PmrProceduresAndImmunizationsSection {
  procedures: PmrProcedureItem[];
  immunizations: PmrImmunizationItem[];
  referrals: PmrReferralItem[];
  medicalCertificates: PmrMedicalCertificateItem[];
}

export interface PmrPastMedicalHistorySection {
  pastMedicalConditions: string[];
  pastSurgicalHistory: string[];
  familyHistory: string[];
  socialHistory: {
    tobaccoUse: string;
    alcoholUse: string;
    occupationalExposure: string;
    lifestyleNotes?: string | null;
  };
}

export interface PmrAttachmentIndexItem {
  id: string;
  title: string;
  documentType: string;
  dateCreated: string;
  fileFormat: string; // e.g. "PDF", "DICOM", "JPEG"
  referenceId: string;
  verifiedHash?: string | null;
}

export interface PmrAttachmentsIndexSection {
  statement: string; // "No external attachments cataloged" if empty
  attachments: PmrAttachmentIndexItem[];
}

export interface PmrAttestationSection {
  attendingPhysician: {
    name: string;
    prcLicenseNo: string;
    ptrNumber?: string | null;
    s2Number?: string | null;
    signatureUrl?: string | null; // e-signature image or null for line
    signedAtReadable?: string | null;
  };
  recordsCustodian?: {
    name: string;
    title: string;
    signatureUrl?: string | null;
    certifiedAtReadable?: string | null;
    certificationStatement: string;
  } | null;
}

export interface PmrFooter {
  confidentialityNotice: string;
  dataPrivacyNotice: string; // Republic Act 10173 notice
  qrVerificationPayload: string;
  qrVerificationUrl: string;
  documentId: string;
  revision: number;
}

/**
 * Root PmrDocument View-Model
 * Pure, portable, typed clinical document representation.
 * Consumed identically by Web (@media print / HTML preview) and Mobile (Expo print).
 */
export interface PmrDocument {
  facilityHeader: PmrFacilityHeader;
  controlBlock: PmrControlBlock;
  patientIdentification: PmrPatientIdentification;
  alertsBanner: PmrAlertsBanner;
  problemList: PmrProblemListSection;
  currentMedications: PmrCurrentMedicationsSection;
  vitalSignsTrend: PmrVitalSignsSection;
  encounterHistory: PmrEncounterHistorySection;
  diagnosticResults: PmrDiagnosticResultsSection;
  proceduresAndImmunizations: PmrProceduresAndImmunizationsSection;
  pastMedicalHistory: PmrPastMedicalHistorySection;
  attachmentsIndex: PmrAttachmentsIndexSection;
  attestationAndSignatures: PmrAttestationSection;
  footer: PmrFooter;
  options: {
    pageSize: PmrPageSize;
    sectionsIncluded: PmrSectionId[];
    presetUsed: PmrPreset;
    redactionsApplied: PmrRedactionRecord[];
  };
  sha256Hash: string;
}

export interface PmrBuildOptions {
  pageSize?: PmrPageSize;
  preset?: PmrPreset;
  sections?: PmrSectionId[];
  copyType?: PmrCopyType;
  purposeOfRelease?: string;
  includeSensitiveCategories?: PmrSensitiveCategory[];
  encounterId?: string; // If scoping document to a specific visit or full patient record
  organizationId?: string;
}

export interface PmrRequester {
  userId: string;
  role: "patient" | "physician" | "nurse" | "records_officer" | "admin" | "superadmin";
  name: string;
  organizationId: string;
}

export interface PmrShareLinkCreateInput {
  documentId: string;
  patientId: string;
  organizationId: string;
  expiresInHours?: number; // default 72
  passcode?: string;
  maxViews?: number;
  recipientName: string;
  recipientEmail?: string;
  purpose: string;
  consentReference: string;
  sectionsIncluded: PmrSectionId[];
}

export interface PmrShareLinkSummary {
  shareId: string;
  shareToken: string;
  documentId: string;
  expiresAt: string;
  hasPasscode: boolean;
  maxViews: number;
  viewCount: number;
  revoked: boolean;
  recipientName: string;
  purpose: string;
  shareUrl: string;
}

export interface PmrVerificationResponse {
  valid: boolean;
  status: "VERIFIED" | "VOIDED" | "EXPIRED" | "NOT_FOUND";
  documentId: string;
  facilityName: string;
  issuedAt: string;
  sha256Hash: string;
  copyType: string;
  revision: number;
  watermark: string | null;
  message: string;
}

export interface PmrReleaseAuditInput {
  organizationId: string;
  patientId: string;
  documentId: string;
  action: "view" | "print" | "pdf_download" | "share_link_created" | "share_link_accessed" | "email_sent";
  recipient: string;
  purpose: string;
  consentReference: string;
  sectionsIncluded: PmrSectionId[];
  ipAddress?: string;
  userAgent?: string;
}
