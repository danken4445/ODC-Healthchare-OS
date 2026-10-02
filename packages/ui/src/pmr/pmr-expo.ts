/**
 * Patient Medical Record (PMR) - React Native (Expo) Integration
 * Single Source of Truth: Consumes the shared PmrDocument view-model
 * and compiles to deterministic HTML for expo-print and expo-sharing.
 */

import type { PmrDocument } from "@odyssey/types";

export interface ExpoPrintModule {
  printAsync: (options: { html: string; printerUrl?: string }) => Promise<void>;
  printToFileAsync: (options: { html: string; width?: number; height?: number; base64?: boolean }) => Promise<{ uri: string; numberOfPages: number; base64?: string }>;
}

export interface ExpoSharingModule {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (url: string, options?: { mimeType?: string; dialogTitle?: string; UTI?: string }) => Promise<void>;
}

export interface ExpoFileSystemModule {
  documentDirectory: string | null;
  copyAsync?: (options: { from: string; to: string }) => Promise<void>;
}

/**
 * Generates identical, fully styled HTML for Expo print and PDF/A compilation.
 */
export function generatePmrHtml(doc: PmrDocument): string {
  const p = doc.patientIdentification;
  const c = doc.controlBlock;
  const h = doc.facilityHeader;
  const a = doc.alertsBanner;
  const pr = doc.problemList;
  const m = doc.currentMedications;
  const v = doc.vitalSignsTrend;
  const e = doc.encounterHistory;
  const d = doc.diagnosticResults;
  const pi = doc.proceduresAndImmunizations;
  const pmh = doc.pastMedicalHistory;
  const att = doc.attachmentsIndex;
  const sig = doc.attestationAndSignatures;
  const f = doc.footer;

  const pageSizeRule = doc.options.pageSize === "Letter" ? "letter portrait" : "A4 portrait";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.documentId} - ${p.fullName} - Patient Medical Record</title>
  <style>
    @page {
      size: ${pageSizeRule};
      margin: 18mm 15mm 20mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .watermark {
      position: fixed;
      top: 42%;
      left: 5%;
      width: 90%;
      text-align: center;
      font-size: 50pt;
      font-weight: 900;
      color: rgba(180, 0, 0, 0.12);
      transform: rotate(-35deg);
      pointer-events: none;
      z-index: 1000;
      text-transform: uppercase;
      letter-spacing: 4px;
    }
    .header {
      border-bottom: 2px solid #173f3b;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      break-inside: avoid;
    }
    .facility-name {
      font-size: 13pt;
      font-weight: 800;
      color: #173f3b;
      text-transform: uppercase;
      margin: 0 0 2px;
    }
    .facility-sub {
      font-size: 8.5pt;
      color: #4b5563;
      line-height: 1.35;
    }
    .doc-title {
      font-size: 15pt;
      font-weight: 900;
      color: #0e2926;
      letter-spacing: 0.8px;
      margin: 0;
      text-align: right;
    }
    .copy-badge {
      display: inline-block;
      font-size: 8.5pt;
      font-weight: 700;
      color: #173f3b;
      border: 1px solid #173f3b;
      padding: 1px 6px;
      border-radius: 3px;
      margin-top: 3px;
    }
    .control-block {
      background: #f9fafb;
      border: 1px solid #9ca3af;
      padding: 8px 10px;
      margin-bottom: 14px;
      font-size: 8.5pt;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px 12px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      background: #173f3b;
      color: #ffffff;
      padding: 3px 8px;
      margin: 14px 0 6px;
      break-after: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 8px;
      break-inside: auto;
    }
    tr { break-inside: avoid; }
    th, td {
      border: 1px solid #9ca3af;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eaeded; font-weight: 700; }
    .flag-high { font-weight: bold; color: #b91c1c; }
    .flag-critical { font-weight: 800; color: #7f1d1d; background: #fee2e2; padding: 1px 4px; }
    .alerts-box {
      border: 2px solid #b91c1c;
      background: #fef2f2;
      padding: 8px 10px;
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 20px;
      break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #111;
      padding-top: 4px;
      font-size: 8.5pt;
      margin-top: 35px;
    }
    .footer {
      border-top: 1.5px solid #9ca3af;
      padding-top: 6px;
      margin-top: 20px;
      font-size: 7.5pt;
      color: #4b5563;
      display: flex;
      justify-content: space-between;
      align-items: center;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  ${c.watermark ? `<div class="watermark">${c.watermark}</div>` : ""}

  <!-- 1. Header -->
  <div class="header">
    <div>
      <div class="facility-name">${h.facilityName}</div>
      <div class="facility-sub">
        <div>${h.facilityAddress} · Tel: ${h.contactNumber}</div>
        <div>DOH Lic: <strong>${h.dohLicenseNumber || "Active"}</strong> · PhilHealth Acc: <strong>${h.philhealthAccreditationNumber || "Active"}</strong></div>
      </div>
    </div>
    <div style="text-align: right;">
      <div class="doc-title">${h.documentTitle}</div>
      ${h.subtitle ? `<div style="font-size: 8pt; font-weight: 700; color: #173f3b; margin-top: 2px;">${h.subtitle}</div>` : ""}
      <span class="copy-badge">${c.copyType}</span>
    </div>
  </div>

  <!-- 2. Document Control Block -->
  <div class="control-block">
    <div><strong>Document ID:</strong><br>${c.documentId}</div>
    <div><strong>MRN:</strong><br>${p.mrn}</div>
    <div><strong>Generated (PHT):</strong><br>${c.generatedAtReadable}</div>
    <div><strong>Purpose:</strong><br>${c.purposeOfRelease}</div>
    <div><strong>Issued By:</strong><br>${c.generatedBy.name} (${c.generatedBy.role})</div>
    <div><strong>Revision:</strong><br>Rev. ${c.recordRevision}</div>
    <div style="grid-column: span 2;"><strong>SHA-256 Digest:</strong><br><code style="font-size: 7pt;">${c.sha256Hash}</code></div>
  </div>

  <!-- 3. Patient Identification -->
  <div class="section-title">Patient Identification</div>
  <table>
    <tr>
      <th style="width: 20%;">Full Name</th>
      <td style="width: 30%;"><strong>${p.fullName}</strong></td>
      <th style="width: 20%;">Sex / Gender</th>
      <td style="width: 30%;">${p.sex}</td>
    </tr>
    <tr>
      <th>Date of Birth &amp; Age</th>
      <td>${p.dateOfBirth} (${p.ageFormatted})</td>
      <th>Civil Status</th>
      <td>${p.civilStatus}</td>
    </tr>
    <tr>
      <th>Address</th>
      <td>${p.residentialAddress}</td>
      <th>Contact</th>
      <td>${p.contactNumber}</td>
    </tr>
    <tr>
      <th>PhilHealth No.</th>
      <td><strong>${p.philhealthNumber}</strong></td>
      <th>HMO / Plan</th>
      <td>${p.hmoDetails.providerName} (${p.hmoDetails.policyNumber})</td>
    </tr>
    <tr>
      <th>Blood Type</th>
      <td><strong>${p.bloodType}</strong></td>
      <th>Emergency Contact</th>
      <td>${p.emergencyContact.name} (${p.emergencyContact.relationship}) - ${p.emergencyContact.contactNumber}</td>
    </tr>
  </table>

  <!-- 4. Alerts Banner -->
  <div class="alerts-box">
    <div style="display: flex; justify-content: space-between; font-weight: 800; color: #b91c1c;">
      <span>CLINICAL ALERTS &amp; ALLERGIES</span>
      <span style="color: #111;">CODE STATUS: ${a.codeStatus}</span>
    </div>
    <p style="margin: 4px 0; font-weight: 600;">${a.allergyStatement}</p>
    ${
      a.allergies.length > 0
        ? `<ul>${a.allergies.map((al) => `<li><strong>${al.substance}</strong>: ${al.manifestation} ${al.criticality === "high" ? '<span class="flag-critical">[CRITICAL]</span>' : ""}</li>`).join("")}</ul>`
        : ""
    }
  </div>

  <!-- 5. Problem List -->
  <div class="section-title">Problem List / Diagnoses</div>
  ${
    pr.activeProblems.length > 0
      ? `<table>
          <thead><tr><th>Code</th><th>Diagnosis</th><th>Status</th><th>Onset</th></tr></thead>
          <tbody>
            ${pr.activeProblems.map((item) => `<tr><td><code>${item.code}</code></td><td><strong>${item.display}</strong></td><td>${item.clinicalStatus}</td><td>${item.onsetDate || "Recorded"}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-style: italic; font-size: 8.5pt;">${pr.statement}</p>`
  }

  <!-- 6. Current Medications -->
  <div class="section-title">Current Medications</div>
  ${
    m.medications.length > 0
      ? `<table>
          <thead><tr><th>Medication</th><th>Dosage &amp; Directions</th><th>Route</th><th>Prescriber</th></tr></thead>
          <tbody>
            ${m.medications.map((item) => `<tr><td><strong>${item.drugName}</strong></td><td>${item.dosage}</td><td>${item.route} (${item.frequency})</td><td>${item.prescriberName}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-style: italic; font-size: 8.5pt;">${m.statement}</p>`
  }

  <!-- 7. Vital Signs Trend -->
  <div class="section-title">Vital Signs Trend</div>
  ${
    v.historicalReadings.length > 0
      ? `<table>
          <thead><tr><th>Date/Time (PHT)</th><th>Blood Pressure</th><th>HR</th><th>RR</th><th>Temp</th><th>SpO2</th><th>BMI</th></tr></thead>
          <tbody>
            ${v.historicalReadings.map((reading) => `<tr><td>${reading.recordedAtFormatted}</td><td><strong>${reading.bloodPressure}</strong></td><td>${reading.heartRateBpm} bpm</td><td>${reading.respiratoryRateBpm}/min</td><td>${reading.temperatureCelsius}°C</td><td>${reading.oxygenSaturationPct}%</td><td>${reading.bmi || "N/A"}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-style: italic; font-size: 8.5pt;">${v.statement}</p>`
  }

  <!-- 8. Encounter History -->
  <div class="section-title">Encounter History</div>
  ${
    e.encounters.length > 0
      ? e.encounters.map((enc) => `
        <div style="border: 1px solid #9ca3af; padding: 6px 8px; margin-bottom: 8px; font-size: 8.5pt; break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>${enc.dateFormatted} · ${enc.serviceName} (${enc.type})</span>
            <span>Attending: ${enc.attendingPhysician} (${enc.prcLicenseNo || "MD"})</span>
          </div>
          <div><strong>Chief Complaint:</strong> ${enc.chiefComplaint}</div>
          ${enc.soapSummary ? `
            <div style="font-size: 8pt; color: #374151; margin: 4px 0; background: #f9fafb; padding: 4px 6px; border-left: 2px solid #173f3b;">
              ${enc.soapSummary.rawNote && !enc.soapSummary.subjective ? `
                <div><strong>Consultation Note:</strong> ${enc.soapSummary.rawNote}</div>
              ` : `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px;">
                  <div><strong>S:</strong> ${enc.soapSummary.subjective}</div>
                  <div><strong>O:</strong> ${enc.soapSummary.objective}</div>
                  <div><strong>A:</strong> ${enc.soapSummary.assessment}</div>
                  <div><strong>P:</strong> ${enc.soapSummary.plan}</div>
                </div>
              `}
            </div>
          ` : ""}
          ${enc.diagnoses && enc.diagnoses.length > 0 ? `<div style="font-size: 7.5pt; margin-top: 2px;"><strong>Diagnoses:</strong> ${enc.diagnoses.join(", ")}</div>` : ""}
          ${enc.ordersSummary && enc.ordersSummary.length > 0 ? `<div style="font-size: 7.5pt; margin-top: 2px;"><strong>Orders:</strong> ${enc.ordersSummary.join("; ")}</div>` : ""}
          <div><strong>Disposition:</strong> ${enc.disposition}</div>
        </div>
      `).join("")
      : `<p style="font-style: italic; font-size: 8.5pt;">${e.statement}</p>`
  }

  <!-- 9. Diagnostic Results -->
  <div class="section-title">Laboratory &amp; Diagnostic Results</div>
  ${
    d.results.length > 0
      ? `<table>
          <thead><tr><th>Test</th><th>Value</th><th>Unit</th><th>Reference</th><th>Flag</th><th>Date</th></tr></thead>
          <tbody>
            ${d.results.map((r) => `<tr><td><strong>${r.testName}</strong></td><td>${r.value}</td><td>${r.unit}</td><td>${r.referenceRange}</td><td class="${r.abnormalFlag !== "NORMAL" ? "flag-high" : ""}">${r.abnormalFlag}</td><td>${r.resultDate}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-style: italic; font-size: 8.5pt;">${d.statement}</p>`
  }

  <!-- 10. Procedures & Certificates -->
  <div class="section-title">Procedures, Referrals &amp; Certificates</div>
  ${
    pi.procedures.length > 0 || pi.medicalCertificates.length > 0
      ? `<table>
          <thead><tr><th>Item</th><th>Details</th><th>Provider</th><th>Date</th></tr></thead>
          <tbody>
            ${pi.procedures.map((proc) => `<tr><td>Procedure: <strong>${proc.name}</strong></td><td>${proc.notes || "Completed"}</td><td>${proc.performedByName}</td><td>${proc.performedDate}</td></tr>`).join("")}
            ${pi.medicalCertificates.map((cert) => `<tr><td>Medical Certificate: <strong>${cert.documentTitle}</strong></td><td>${cert.statement}</td><td>${cert.attendingPhysician}</td><td>${cert.issuedDate}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-style: italic; font-size: 8.5pt;">No procedures or certificates on record.</p>`
  }

  <!-- 13. Signatures & Attestation -->
  <div class="signature-grid">
    <div>
      <div class="sig-line">
        <strong>${sig.attendingPhysician.name}</strong><br>
        Attending Physician<br>
        ${sig.attendingPhysician.prcLicenseNo}<br>
        <small>Signed: ${sig.attendingPhysician.signedAtReadable || c.generatedAtReadable}</small>
      </div>
    </div>
    <div>
      <div class="sig-line">
        <strong>${sig.recordsCustodian ? sig.recordsCustodian.name : "Patient Portal Electronic Verification"}</strong><br>
        ${sig.recordsCustodian ? sig.recordsCustodian.title : "Direct Personal Health Record Copy"}<br>
        <small>${sig.recordsCustodian ? sig.recordsCustodian.certificationStatement : "Republic Act No. 10173 Compliant"}</small>
      </div>
    </div>
  </div>

  <!-- 14. Footer -->
  <div class="footer">
    <div>
      <strong>Document ID:</strong> ${c.documentId} · <strong>Verification:</strong> ${c.verificationUrl}<br>
      <small>${f.dataPrivacyNotice}</small>
    </div>
    <div style="text-align: right;">
      <small>${f.confidentialityNotice}</small>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Mobile Native Export: Prints the PMR Document using expo-print.
 */
export async function printPmrMobileAsync(
  doc: PmrDocument,
  expoPrint: ExpoPrintModule
): Promise<void> {
  const html = generatePmrHtml(doc);
  await expoPrint.printAsync({ html });
}

/**
 * Mobile Native Export: Generates a reproducible local PDF file using expo-print.
 */
export async function generatePmrPdfMobileAsync(
  doc: PmrDocument,
  expoPrint: ExpoPrintModule
): Promise<{ uri: string; numberOfPages: number }> {
  const html = generatePmrHtml(doc);
  return await expoPrint.printToFileAsync({ html });
}

/**
 * Mobile Native Export: Shares the generated PMR PDF via the device native share sheet (expo-sharing).
 */
export async function sharePmrMobileAsync(
  doc: PmrDocument,
  expoPrint: ExpoPrintModule,
  expoSharing: ExpoSharingModule
): Promise<void> {
  const isAvailable = await expoSharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Device sharing is not supported on this platform.");
  }

  const { uri } = await generatePmrPdfMobileAsync(doc, expoPrint);

  await expoSharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: `Share Patient Medical Record (${doc.controlBlock.documentId})`,
    UTI: "com.adobe.pdf",
  });
}
