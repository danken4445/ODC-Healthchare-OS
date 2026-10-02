import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PmrDocument } from "@odyssey/types";
import {
  buildPmrDocument,
  computeSha256Hex,
  calculateAge,
  formatManilaDateTime,
  formatManilaDate,
  parseSoapSections,
  formatTriageVitalsSummary,
  extractPractitionerLicense,
} from "../src/pmr-builder.ts";

function createMockSupabase(overrides: {
  patient?: Record<string, unknown>;
  allergies?: Record<string, unknown>[];
  conditions?: Record<string, unknown>[];
  encounters?: Record<string, unknown>[];
  observations?: Record<string, unknown>[];
  medications?: Record<string, unknown>[];
  diagnosticReports?: Record<string, unknown>[];
  serviceRequests?: Record<string, unknown>[];
  documentReferences?: Record<string, unknown>[];
} = {}) {
  const patientRow = overrides.patient ?? {
    id: "d8c54178-5d3e-4d89-980b-0db56fb89a42",
    organization_id: "721245fa-2849-43c2-aa92-74768393e157",
    name: { text: "Juan Dela Cruz", given: ["Juan"], family: "Dela Cruz" },
    birth_date: "1990-05-15",
    gender: "male",
    blood_type: "O+",
    walk_in_id: "P-9021",
    address: [{ text: "123 Mabini St., Ermita, Manila" }],
    telecom: [
      { system: "phone", value: "+639171234567" },
      { system: "email", value: "juan@example.ph" },
    ],
    contact: [
      {
        name: { text: "Maria Dela Cruz" },
        relationship: [{ text: "Spouse" }],
        telecom: [{ system: "phone", value: "+639189876543" }],
      },
    ],
    identifier: [{ system: "philhealth", value: "12-345678901-2" }],
  };

  const orgRow = {
    id: "721245fa-2849-43c2-aa92-74768393e157",
    name: "Odyssey General Hospital",
    telecom: [{ system: "phone", value: "+63 (2) 8888-1234" }],
  };

  const client = {
    from: (table: string) => {
      return {
        select: (_cols?: string) => {
          return {
            eq: (_col: string, _val: unknown) => {
              const chain = {
                eq: (_col2: string, _val2: unknown) => chain,
                order: (_col3: string, _opts: unknown) => chain,
                single: async () => {
                  if (table === "patients") return { data: patientRow, error: null };
                  if (table === "organizations") return { data: orgRow, error: null };
                  return { data: null, error: null };
                },
                then: (resolve: (val: { data: unknown[]; error: null }) => void) => {
                  if (table === "coverages") resolve({ data: [], error: null });
                  else if (table === "allergy_intolerances") resolve({ data: overrides.allergies ?? [], error: null });
                  else if (table === "conditions") resolve({ data: overrides.conditions ?? [], error: null });
                  else if (table === "encounters") resolve({ data: overrides.encounters ?? [], error: null });
                  else if (table === "observations") resolve({ data: overrides.observations ?? [], error: null });
                  else if (table === "medication_requests") resolve({ data: overrides.medications ?? [], error: null });
                  else if (table === "diagnostic_reports") resolve({ data: overrides.diagnosticReports ?? [], error: null });
                  else if (table === "service_requests") resolve({ data: overrides.serviceRequests ?? [], error: null });
                  else if (table === "document_references") resolve({ data: overrides.documentReferences ?? [], error: null });
                  else if (table === "immunizations") resolve({ data: [], error: null });
                  else if (table === "procedures") resolve({ data: [], error: null });
                  else resolve({ data: [], error: null });
                },
              };
              return chain;
            },
            single: async () => {
              if (table === "patients") return { data: patientRow, error: null };
              if (table === "organizations") return { data: orgRow, error: null };
              return { data: null, error: null };
            },
          };
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient<Database>;

  return { client, patientRow };
}

test("buildPmrDocument builds 14 required sections in canonical sequence", async () => {
  const { client, patientRow } = createMockSupabase();

  const doc = await buildPmrDocument(client, patientRow.id as string, {
    preset: "full_record",
    copyType: "Patient Copy",
  });

  // Verify Header
  assert.equal(doc.facilityHeader.documentTitle, "PATIENT MEDICAL RECORD");
  assert.equal(doc.facilityHeader.facilityName, "Odyssey General Hospital");

  // Verify Control Block
  assert.match(doc.controlBlock.documentId, /^PMR-/);
  assert.equal(doc.controlBlock.mrn, "MRN-P-9021");
  assert.equal(doc.controlBlock.timezone, "Asia/Manila");
  assert.equal(doc.controlBlock.copyType, "Patient Copy");
  assert.equal(doc.controlBlock.watermark, null);
  assert.ok(doc.controlBlock.sha256Hash.length === 64);

  // Verify Patient Identification
  assert.equal(doc.patientIdentification.fullName, "Juan Dela Cruz");
  assert.equal(doc.patientIdentification.sex, "Male");
  assert.equal(doc.patientIdentification.bloodType, "O+");
  assert.equal(doc.patientIdentification.philhealthNumber, "12-345678901-2");
  assert.equal(doc.patientIdentification.emergencyContact.name, "Maria Dela Cruz");

  // Verify 14 sections included
  assert.equal(doc.options.sectionsIncluded.length, 14);
  assert.equal(doc.options.sectionsIncluded[0], "header");
  assert.equal(doc.options.sectionsIncluded[1], "control_block");
  assert.equal(doc.options.sectionsIncluded[2], "patient_identification");
  assert.equal(doc.options.sectionsIncluded[3], "alerts_banner");
  assert.equal(doc.options.sectionsIncluded[4], "problem_list");
  assert.equal(doc.options.sectionsIncluded[5], "current_medications");
  assert.equal(doc.options.sectionsIncluded[6], "vital_signs_trend");
  assert.equal(doc.options.sectionsIncluded[7], "encounter_history");
  assert.equal(doc.options.sectionsIncluded[8], "diagnostic_results");
  assert.equal(doc.options.sectionsIncluded[9], "procedures_and_immunizations");
  assert.equal(doc.options.sectionsIncluded[10], "past_medical_history");
  assert.equal(doc.options.sectionsIncluded[11], "attachments_index");
  assert.equal(doc.options.sectionsIncluded[12], "attestation_and_signatures");
  assert.equal(doc.options.sectionsIncluded[13], "footer");
});

test("handles empty states gracefully with explicit statements, never blanks", async () => {
  const { client, patientRow } = createMockSupabase();

  const doc = await buildPmrDocument(client, patientRow.id as string);

  // Allergies: explicit NKDA statement
  assert.equal(doc.alertsBanner.allergies.length, 0);
  assert.equal(
    doc.alertsBanner.allergyStatement,
    "No known drug allergies (NKDA) reported."
  );

  // Problem list
  assert.equal(doc.problemList.activeProblems.length, 0);
  assert.equal(
    doc.problemList.statement,
    "No active problem list diagnoses recorded."
  );

  // Medications
  assert.equal(doc.currentMedications.medications.length, 0);
  assert.equal(
    doc.currentMedications.statement,
    "No current medications on record."
  );

  // Vitals
  assert.equal(doc.vitalSignsTrend.historicalReadings.length, 0);
  assert.equal(
    doc.vitalSignsTrend.statement,
    "No vital signs readings recorded."
  );

  // Encounters
  assert.equal(doc.encounterHistory.encounters.length, 0);
  assert.equal(
    doc.encounterHistory.statement,
    "No encounter history recorded."
  );

  // Diagnostics
  assert.equal(doc.diagnosticResults.results.length, 0);
  assert.equal(
    doc.diagnosticResults.statement,
    "No laboratory or diagnostic results on file."
  );
});

test("redacts sensitive health categories (mental health, HIV) under RA 10173 unless explicitly consented", async () => {
  const { client, patientRow } = createMockSupabase({
    conditions: [
      {
        id: "cond-1",
        code: "F32.9",
        code_display: "Major depressive disorder, single episode",
        clinical_status: "active",
      },
      {
        id: "cond-2",
        code: "I10",
        code_display: "Essential (primary) hypertension",
        clinical_status: "active",
      },
    ],
  });

  // 1. Without explicit consent for mental_health: depression is redacted
  const unconsentedDoc = await buildPmrDocument(client, patientRow.id as string, {
    includeSensitiveCategories: [],
  });

  const redactedProblem = unconsentedDoc.problemList.activeProblems.find(
    (p) => p.code === "F32.9"
  );
  assert.ok(redactedProblem);
  assert.match(
    redactedProblem.display,
    /\[REDACTED - Sensitive Category: Explicit Patient Consent Required\]/
  );
  assert.equal(unconsentedDoc.options.redactionsApplied.length, 1);
  assert.equal(
    unconsentedDoc.options.redactionsApplied[0].category,
    "mental_health"
  );

  // Hypertension remains visible
  const nonSensitiveProblem = unconsentedDoc.problemList.activeProblems.find(
    (p) => p.code === "I10"
  );
  assert.ok(nonSensitiveProblem);
  assert.equal(nonSensitiveProblem.display, "Essential (primary) hypertension");

  // 2. With explicit consent: depression is fully displayed
  const consentedDoc = await buildPmrDocument(client, patientRow.id as string, {
    includeSensitiveCategories: ["mental_health"],
  });

  const consentedProblem = consentedDoc.problemList.activeProblems.find(
    (p) => p.code === "F32.9"
  );
  assert.ok(consentedProblem);
  assert.equal(
    consentedProblem.display,
    "Major depressive disorder, single episode"
  );
  assert.equal(consentedDoc.options.redactionsApplied.length, 0);
});

test("preset filtering correctly limits sections (Continuity of Care vs Full Record)", async () => {
  const { client, patientRow } = createMockSupabase();

  const summaryDoc = await buildPmrDocument(client, patientRow.id as string, {
    preset: "continuity_of_care",
  });

  assert.equal(summaryDoc.options.presetUsed, "continuity_of_care");
  assert.ok(summaryDoc.options.sectionsIncluded.includes("alerts_banner"));
  assert.ok(summaryDoc.options.sectionsIncluded.includes("current_medications"));
  assert.ok(!summaryDoc.options.sectionsIncluded.includes("attachments_index"));
  assert.ok(!summaryDoc.options.sectionsIncluded.includes("past_medical_history"));
});

test("watermark rules: UNCONTROLLED COPY for uncontrolled copy type", async () => {
  const { client, patientRow } = createMockSupabase();

  const doc = await buildPmrDocument(client, patientRow.id as string, {
    copyType: "Uncontrolled Copy",
  });

  assert.equal(doc.controlBlock.copyType, "Uncontrolled Copy");
  assert.equal(doc.controlBlock.watermark, "UNCONTROLLED COPY");
});

test("reproducibility: SHA-256 hash is deterministic for identical data", async () => {
  const { client, patientRow } = createMockSupabase({
    allergies: [
      {
        id: "al-1",
        substance: "Penicillin G",
        clinical_status: "active",
        criticality: "high",
        manifestation: "Anaphylaxis and urticaria",
      },
    ],
  });

  const doc1 = await buildPmrDocument(client, patientRow.id as string);
  const doc2 = await buildPmrDocument(client, patientRow.id as string);

  assert.equal(doc1.sha256Hash, doc2.sha256Hash);
  assert.equal(doc1.controlBlock.sha256Hash, doc2.controlBlock.sha256Hash);
});

test("age calculation handles years and infancy correctly", () => {
  // Infant 6 months old
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const infantAge = calculateAge(sixMonthsAgo.toISOString().split("T")[0]);
  assert.equal(infantAge.years, 0);
  assert.match(infantAge.formatted, /mos$/);

  // Adult
  const adultAge = calculateAge("1990-01-01");
  assert.ok(adultAge.years >= 30);
  assert.match(adultAge.formatted, /y\/o$/);
});

test("parseSoapSections extracts structured S, O, A, P components correctly", () => {
  const soapText = `Subjective: Patient reports productive cough and mild fever for 3 days.
Objective: Chest exam reveals bilateral rhonchi. Throat is mildly erythematous.
Assessment: Acute bronchitis, likely viral.
Plan: Hydration, paracetamol 500mg PRN, follow up if symptoms persist.`;

  const parsed = parseSoapSections(soapText);
  assert.ok(parsed);
  assert.match(parsed.subjective || "", /productive cough/);
  assert.match(parsed.objective || "", /bilateral rhonchi/);
  assert.match(parsed.assessment || "", /Acute bronchitis/);
  assert.match(parsed.plan || "", /Hydration, paracetamol/);
});

test("formatTriageVitalsSummary formats recorded triage measurements", () => {
  const summary = formatTriageVitalsSummary({
    bloodPressure: "130/85",
    heartRate: 78,
    temperatureC: 37.2,
    oxygenSaturation: 99,
    respiratoryRate: 18,
  });

  assert.equal(summary, "BP 130/85 mmHg, HR 78 bpm, Temp 37.2°C, SpO2 99%, RR 18/min");
});

test("extractPractitionerLicense pulls real PRC license from practitioner identifier", () => {
  const practitioner = {
    name: [{ text: "Dr. Juanito Santos" }],
    identifier: [
      { system: "https://prc.gov.ph/license", value: "0104829" },
    ],
  };

  const license = extractPractitionerLicense(practitioner);
  assert.equal(license, "PRC-0104829");
});

test("encounterId option scopes PMR to specific encounter and sets clinical subtitle", async () => {
  const enc1Id = "enc-1111-aaaa";
  const enc2Id = "enc-2222-bbbb";

  const { client, patientRow } = createMockSupabase({
    encounters: [
      {
        id: enc1Id,
        period_start: "2026-09-30T10:00:00Z",
        service_type: "Pediatric Consultation",
        status: "finished",
        subject_note: "Fever and mild dry cough for 2 days",
        objective_note: "Temp 38.1°C, clear breath sounds",
        assessment_note: "Viral upper respiratory tract infection",
        plan_note: "Antipyretics, adequate fluid intake",
      },
      {
        id: enc2Id,
        period_start: "2026-08-15T09:00:00Z",
        service_type: "General Consultation",
        status: "finished",
        subject_note: "Annual physical exam",
      },
    ],
    observations: [
      {
        id: "obs-soap-1",
        encounter_id: enc1Id,
        code: "SOAP-NOTE",
        value: {
          text: "Subjective: Fever and cough.\nObjective: Temp 38.1°C.\nAssessment: URTI.\nPlan: Rest and fluids.",
        },
      },
    ],
  });

  // 1. When no encounterId passed: all 2 encounters included
  const fullDoc = await buildPmrDocument(client, patientRow.id as string);
  assert.equal(fullDoc.encounterHistory.encounters.length, 2);
  assert.equal(fullDoc.facilityHeader.subtitle, null);
  assert.ok(!fullDoc.controlBlock.documentId.includes("ENC"));

  // 2. When encounterId is enc1Id: scoped to only enc1
  const scopedDoc = await buildPmrDocument(client, patientRow.id as string, {
    encounterId: enc1Id,
  });

  assert.equal(scopedDoc.encounterHistory.encounters.length, 1);
  assert.equal(scopedDoc.encounterHistory.encounters[0].id, enc1Id);
  assert.equal(scopedDoc.controlBlock.encounterScopedId, enc1Id);
  assert.match(scopedDoc.controlBlock.documentId, /ENC/);
  assert.ok(scopedDoc.facilityHeader.subtitle);
  assert.match(scopedDoc.facilityHeader.subtitle, /CLINICAL VISIT NOTE/);
  assert.match(scopedDoc.facilityHeader.subtitle, /Pediatric Consultation/);

  // Encounter details use actual clinical data, not dummy fallback text
  const encItem = scopedDoc.encounterHistory.encounters[0];
  assert.equal(encItem.chiefComplaint, "Fever and mild dry cough for 2 days");
  assert.equal(encItem.soapSummary.subjective, "Fever and cough.");
  assert.equal(encItem.soapSummary.objective, "Temp 38.1°C.");
  assert.equal(encItem.soapSummary.assessment, "URTI.");
  assert.equal(encItem.soapSummary.plan, "Rest and fluids.");
});
