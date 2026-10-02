import assert from "node:assert/strict";
import test from "node:test";
import type { PmrDocument } from "@odyssey/types";
import { generatePmrHtml } from "../../ui/src/pmr/pmr-expo.ts";

function buildSamplePmrDocument(pageSize: "A4" | "Letter" = "A4"): PmrDocument {
  return {
    facilityHeader: {
      facilityName: "Philippine General Medical Center",
      facilityLogoUrl: null,
      facilityAddress: "Taft Avenue, Manila, Philippines",
      contactNumber: "+63 (2) 8554-8400",
      email: "records@pgmc.gov.ph",
      dohLicenseNumber: "DOH-NCR-01-2026",
      philhealthAccreditationNumber: "PHIC-992019-1",
      documentTitle: "PATIENT MEDICAL RECORD",
    },
    controlBlock: {
      documentId: "PMR-20261002-JUAN12",
      mrn: "MRN-100294",
      recordRevision: 1,
      generatedAtIso: "2026-10-02T08:30:00.000Z",
      generatedAtReadable: "October 2, 2026, 04:30 PM PHT",
      timezone: "Asia/Manila",
      generatedBy: {
        name: "Dr. Maria Santos",
        role: "ATTENDING PHYSICIAN",
        userId: "doc-1",
      },
      purposeOfRelease: "Official Medical Transfer",
      copyType: "Official Copy",
      watermark: null,
      sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      verificationUrl: "https://odyssey.health/verify/pmr/PMR-20261002-JUAN12",
    },
    patientIdentification: {
      patientId: "pat-1",
      mrn: "MRN-100294",
      fullName: "Juan Dela Cruz",
      sex: "Male",
      dateOfBirth: "1988-11-20",
      ageYears: 37,
      ageFormatted: "37 y/o",
      civilStatus: "Married",
      residentialAddress: "123 Taft Ave., Ermita, Manila",
      contactNumber: "+639171234567",
      emailAddress: "juan@example.ph",
      emergencyContact: {
        name: "Maria Dela Cruz",
        relationship: "Spouse",
        contactNumber: "+639189876543",
      },
      philhealthNumber: "12-345678901-2",
      hmoDetails: {
        providerName: "Maxicare Healthcare",
        policyNumber: "MAX-889102",
        status: "Active",
      },
      bloodType: "O+",
    },
    alertsBanner: {
      hasAllergies: true,
      allergyStatement: "1 active allergy warning(s) on file.",
      allergies: [
        {
          id: "al-1",
          substance: "Penicillin",
          clinicalStatus: "active",
          verificationStatus: "confirmed",
          category: "medication",
          criticality: "high",
          manifestation: "Severe anaphylactic bronchospasm",
        },
      ],
      criticalFlags: [
        {
          id: "flag-1",
          title: "HIGH CRITICALITY ALLERGY: Penicillin",
          description: "Manifestation: Severe anaphylactic bronchospasm",
          severity: "critical",
        },
      ],
      codeStatus: "Full Code",
    },
    problemList: {
      statement: "1 active problem(s) documented.",
      activeProblems: [
        {
          id: "pr-1",
          code: "I10",
          display: "Essential (primary) hypertension",
          clinicalStatus: "active",
          verificationStatus: "confirmed",
          onsetDate: "2024-02-10",
        },
      ],
      resolvedProblems: [],
    },
    currentMedications: {
      statement: "1 active medication prescription(s).",
      medications: [
        {
          id: "med-1",
          drugName: "Amlodipine Besylate",
          strength: "5mg",
          dosage: "5mg tablet, 1 tab once daily in the morning",
          route: "Oral",
          frequency: "Once daily",
          prescriberName: "Dr. Maria Santos",
          status: "active",
        },
      ],
    },
    vitalSignsTrend: {
      statement: "1 vital sign measurement(s) on file.",
      latestReading: {
        recordedAt: "2026-10-02T08:00:00.000Z",
        recordedAtFormatted: "October 2, 2026, 04:00 PM PHT",
        bloodPressure: "120/80",
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        respiratoryRateBpm: 16,
        temperatureCelsius: 36.6,
        oxygenSaturationPct: 98,
        bmi: 23.5,
      },
      historicalReadings: [
        {
          recordedAt: "2026-10-02T08:00:00.000Z",
          recordedAtFormatted: "October 2, 2026, 04:00 PM PHT",
          bloodPressure: "120/80",
          systolicBp: 120,
          diastolicBp: 80,
          heartRateBpm: 72,
          respiratoryRateBpm: 16,
          temperatureCelsius: 36.6,
          oxygenSaturationPct: 98,
          bmi: 23.5,
        },
      ],
    },
    encounterHistory: {
      statement: "1 encounter visit(s) documented.",
      encounters: [
        {
          id: "enc-1",
          date: "2026-10-02T08:00:00.000Z",
          dateFormatted: "October 2, 2026, 04:00 PM PHT",
          type: "Outpatient (OPD)",
          serviceName: "Cardiology Follow-up",
          attendingPhysician: "Dr. Maria Santos",
          chiefComplaint: "Routine follow-up blood pressure check",
          soapSummary: {
            subjective: "Patient feels well, adherent to medications.",
            objective: "BP 120/80 mmHg, S1/S2 distinct, no murmurs.",
            assessment: "Essential hypertension, well-controlled.",
            plan: "Continue Amlodipine 5mg OD. Follow up in 3 months.",
          },
          diagnoses: ["Essential (primary) hypertension"],
          ordersSummary: ["LAB: Lipid Profile, Serum Creatinine"],
          disposition: "Consultation Completed; Follow-up in 3 months",
        },
      ],
    },
    diagnosticResults: {
      statement: "1 laboratory & diagnostic result(s) registered.",
      results: [
        {
          id: "lab-1",
          reportCode: "2093-3",
          testName: "Total Cholesterol",
          category: "Laboratory",
          value: "185",
          unit: "mg/dL",
          referenceRange: "< 200 mg/dL",
          abnormalFlag: "NORMAL",
          collectionDate: "Oct 2, 2026",
          resultDate: "Oct 2, 2026",
          status: "Final",
          performingFacility: "PGMC Central Laboratory",
        },
      ],
    },
    proceduresAndImmunizations: {
      procedures: [
        {
          id: "proc-1",
          code: "93000",
          name: "12-Lead Electrocardiogram (ECG)",
          performedDate: "Oct 2, 2026",
          performedByName: "Dr. Maria Santos",
          notes: "Normal sinus rhythm, rate 72 bpm.",
        },
      ],
      immunizations: [],
      referrals: [],
      medicalCertificates: [
        {
          id: "cert-1",
          documentTitle: "Medical Certificate of Fit-to-Work",
          issuedDate: "Oct 2, 2026",
          statement: "Patient is physically fit for normal work duties.",
          attendingPhysician: "Dr. Maria Santos",
        },
      ],
    },
    pastMedicalHistory: {
      pastMedicalConditions: ["Hypertension"],
      pastSurgicalHistory: ["None"],
      familyHistory: ["Maternal: Type 2 Diabetes"],
      socialHistory: {
        tobaccoUse: "Non-smoker",
        alcoholUse: "None",
        occupationalExposure: "Office worker",
      },
    },
    attachmentsIndex: {
      statement: "0 external attachments cataloged.",
      attachments: [],
    },
    attestationAndSignatures: {
      attendingPhysician: {
        name: "Dr. Maria Santos, MD, FPCP",
        prcLicenseNo: "PRC Lic. No. 0104829",
        ptrNumber: "PTR No. 8492019",
        signedAtReadable: "October 2, 2026, 04:30 PM PHT",
      },
      recordsCustodian: {
        name: "Lourdes Mendoza, RRA",
        title: "Chief Medical Records Custodian",
        certificationStatement: "Certified true copy of institutional chart archives.",
      },
    },
    footer: {
      confidentialityNotice: "CONFIDENTIAL MEDICAL RECORD: PRIVILEGED HEALTH INFORMATION",
      dataPrivacyNotice: "Philippine Data Privacy Act of 2012 (Republic Act No. 10173)",
      qrVerificationPayload: "ODYSSEY|PMR|PMR-20261002-JUAN12|REV-1",
      qrVerificationUrl: "https://odyssey.health/verify/pmr/PMR-20261002-JUAN12",
      documentId: "PMR-20261002-JUAN12",
      revision: 1,
    },
    options: {
      pageSize,
      sectionsIncluded: [
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
      presetUsed: "full_record",
      redactionsApplied: [],
    },
    sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  };
}

test("generatePmrHtml produces valid HTML with all required clinical sections in strict order", () => {
  const doc = buildSamplePmrDocument("A4");
  const html = generatePmrHtml(doc);

  // Check doctype and title
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /PATIENT MEDICAL RECORD/);

  // Check strict sequence of key section titles
  const idxHeader = html.indexOf("PATIENT MEDICAL RECORD");
  const idxPatient = html.indexOf("Patient Identification");
  const idxAlerts = html.indexOf("CLINICAL ALERTS &amp; ALLERGIES");
  const idxProblems = html.indexOf("Problem List / Diagnoses");
  const idxMeds = html.indexOf("Current Medications");
  const idxVitals = html.indexOf("Vital Signs Trend");
  const idxEncounters = html.indexOf("Encounter History");
  const idxDiagnostics = html.indexOf("Laboratory &amp; Diagnostic Results");
  const idxSignatures = html.indexOf("Attending Physician");
  const idxFooter = html.indexOf("Republic Act No. 10173");

  assert.ok(idxHeader < idxPatient, "Header must precede Patient Identification");
  assert.ok(idxPatient < idxAlerts, "Patient Identification must precede Alerts");
  assert.ok(idxAlerts < idxProblems, "Alerts must precede Problem List");
  assert.ok(idxProblems < idxMeds, "Problem List must precede Current Medications");
  assert.ok(idxMeds < idxVitals, "Current Medications must precede Vital Signs");
  assert.ok(idxVitals < idxEncounters, "Vital Signs must precede Encounter History");
  assert.ok(idxEncounters < idxDiagnostics, "Encounter History must precede Diagnostics");
  assert.ok(idxDiagnostics < idxSignatures, "Diagnostics must precede Signatures");
  assert.ok(idxSignatures < idxFooter, "Signatures must precede Footer");

  // Check compliance: RA 10173 notice in footer
  assert.match(html, /Republic Act No\. 10173/);
  // Check verification url in footer
  assert.match(html, /https:\/\/odyssey\.health\/verify\/pmr\/PMR-20261002-JUAN12/);
  // Check SHA-256 non-repudiation digest
  assert.match(html, /e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855/);
});

test("generatePmrHtml sets appropriate @page size rules for A4 and Letter", () => {
  const a4Html = generatePmrHtml(buildSamplePmrDocument("A4"));
  assert.match(a4Html, /size:\s*A4 portrait/);

  const letterHtml = generatePmrHtml(buildSamplePmrDocument("Letter"));
  assert.match(letterHtml, /size:\s*letter portrait/);
});
