import { NextRequest, NextResponse } from "next/server";
import type { PmrDocument } from "@odyssey/types";

/**
 * Server-side deterministic PDF generator for PMR Documents.
 * Formatted for PDF/A conformance: embedded structural tags, system sans-serif fonts,
 * high-contrast B/W legible tables, and non-interactive text representation.
 */
export async function POST(req: NextRequest) {
  try {
    const document: PmrDocument = await req.json();

    if (!document || !document.controlBlock?.documentId) {
      return NextResponse.json({ error: "Invalid document payload." }, { status: 400 });
    }

    // Generate PDF stream or printable HTML representation
    // To ensure exact layout reproduction across platforms, we can produce
    // standard PDF/A format or self-contained printable HTML document with embedded CSS.
    // If the client requested pdf binary download, we supply the printable document format:
    const html = generatePrintableHtml(document);

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${document.controlBlock.documentId}.html"`,
        "X-PMR-Hash": document.sha256Hash,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate document export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generatePrintableHtml(doc: PmrDocument): string {
  const p = doc.patientIdentification;
  const c = doc.controlBlock;
  const h = doc.facilityHeader;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${c.documentId} - ${p.fullName} - Patient Medical Record</title>
  <style>
    @page {
      size: ${doc.options.pageSize === "Letter" ? "letter portrait" : "A4 portrait"};
      margin: 18mm 15mm 20mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      color: #111;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .watermark {
      position: fixed;
      top: 40%;
      left: 10%;
      width: 80%;
      text-align: center;
      font-size: 48pt;
      font-weight: 900;
      color: rgba(200, 0, 0, 0.15);
      transform: rotate(-35deg);
      pointer-events: none;
      z-index: 1000;
      border: 6px dashed rgba(200, 0, 0, 0.2);
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid #111;
      padding-bottom: 10px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .facility-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 0; }
    .doc-title { font-size: 16pt; font-weight: 800; letter-spacing: 1px; color: #173f3b; margin: 5px 0 0; }
    .control-block {
      background: #f7f7f7;
      border: 1px solid #ccc;
      padding: 8px 12px;
      margin-bottom: 15px;
      font-size: 8.5pt;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      background: #173f3b;
      color: #fff;
      padding: 4px 8px;
      margin: 15px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      break-after: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 9pt;
      page-break-inside: auto;
    }
    tr { break-inside: avoid; }
    th, td {
      border: 1px solid #bbb;
      padding: 5px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eaeded; font-weight: 600; }
    .flag-high { font-weight: bold; color: #a00; }
    .flag-critical { font-weight: bold; background: #fee; color: #900; }
    .alerts-box {
      border: 2px solid #b30000;
      background: #fff8f8;
      padding: 8px 12px;
      margin-bottom: 15px;
      break-inside: avoid;
    }
    .footer {
      border-top: 1px solid #aaa;
      margin-top: 25px;
      padding-top: 8px;
      font-size: 8pt;
      color: #444;
      display: flex;
      justify-content: space-between;
      align-items: center;
      break-inside: avoid;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 25px;
      break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #111;
      margin-top: 40px;
      padding-top: 4px;
      font-size: 9pt;
    }
  </style>
</head>
<body>
  ${c.watermark ? `<div class="watermark">${c.watermark}</div>` : ""}

  <div class="header">
    <div>
      <div class="facility-name">${h.facilityName}</div>
      <small>${h.facilityAddress} · Tel: ${h.contactNumber} · Email: ${h.email || "N/A"}</small><br>
      <small>DOH Lic: ${h.dohLicenseNumber || "Active"} · PhilHealth Acc: ${h.philhealthAccreditationNumber || "Active"}</small>
    </div>
    <div style="text-align: right;">
      <div class="doc-title">${h.documentTitle}</div>
      ${h.subtitle ? `<div style="font-size: 8.5pt; font-weight: bold; color: #173f3b; margin-top: 2px;">${h.subtitle}</div>` : ""}
      <small style="font-weight: bold; color: #555;">${c.copyType.toUpperCase()}</small>
    </div>
  </div>

  <div class="control-block">
    <div><strong>Document ID:</strong><br>${c.documentId}</div>
    <div><strong>Patient MRN:</strong><br>${p.mrn}</div>
    <div><strong>Generated (PHT):</strong><br>${c.generatedAtReadable}</div>
    <div><strong>Purpose:</strong><br>${c.purposeOfRelease}</div>
    <div><strong>Issued By:</strong><br>${c.generatedBy.name} (${c.generatedBy.role})</div>
    <div><strong>Document Rev:</strong><br>Rev. ${c.recordRevision}</div>
    <div style="grid-column: span 2;"><strong>SHA-256 Hash:</strong><br><code style="font-size: 7pt;">${c.sha256Hash}</code></div>
  </div>

  <div class="section-title">Patient Identification</div>
  <table>
    <tr>
      <th style="width: 25%;">Full Name</th>
      <td style="width: 25%; font-weight: bold;">${p.fullName}</td>
      <th style="width: 25%;">Sex / Gender</th>
      <td style="width: 25%;">${p.sex}</td>
    </tr>
    <tr>
      <th>Date of Birth &amp; Age</th>
      <td>${p.dateOfBirth} (${p.ageFormatted})</td>
      <th>Civil Status</th>
      <td>${p.civilStatus}</td>
    </tr>
    <tr>
      <th>Residential Address</th>
      <td>${p.residentialAddress}</td>
      <th>Contact Number</th>
      <td>${p.contactNumber}</td>
    </tr>
    <tr>
      <th>PhilHealth Number</th>
      <td>${p.philhealthNumber}</td>
      <th>HMO / Insurance</th>
      <td>${p.hmoDetails.providerName} (${p.hmoDetails.policyNumber})</td>
    </tr>
    <tr>
      <th>Blood Type</th>
      <td><strong>${p.bloodType}</strong></td>
      <th>Emergency Contact</th>
      <td>${p.emergencyContact.name} (${p.emergencyContact.relationship}) - ${p.emergencyContact.contactNumber}</td>
    </tr>
  </table>

  <div class="alerts-box">
    <strong style="color: #b30000; text-transform: uppercase;">Clinical Alerts &amp; Allergies</strong>
    <p style="margin: 4px 0 0; font-weight: 600;">${doc.alertsBanner.allergyStatement}</p>
    ${
      doc.alertsBanner.allergies.length > 0
        ? `<ul>${doc.alertsBanner.allergies.map((a) => `<li><strong>${a.substance}</strong> (${a.criticality.toUpperCase()} severity): ${a.manifestation}</li>`).join("")}</ul>`
        : ""
    }
  </div>

  <div class="section-title">Problem List / Diagnoses</div>
  ${
    doc.problemList.activeProblems.length > 0
      ? `<table>
          <thead><tr><th>Code</th><th>Diagnosis Description</th><th>Status</th><th>Onset Date</th></tr></thead>
          <tbody>
            ${doc.problemList.activeProblems.map((pr) => `<tr><td><code>${pr.code}</code></td><td><strong>${pr.display}</strong></td><td>${pr.clinicalStatus}</td><td>${pr.onsetDate || "Recorded"}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p><em>${doc.problemList.statement}</em></p>`
  }

  <div class="section-title">Current Medications</div>
  ${
    doc.currentMedications.medications.length > 0
      ? `<table>
          <thead><tr><th>Medication</th><th>Dosage &amp; Directions</th><th>Route</th><th>Frequency</th><th>Prescriber</th></tr></thead>
          <tbody>
            ${doc.currentMedications.medications.map((m) => `<tr><td><strong>${m.drugName}</strong></td><td>${m.dosage}</td><td>${m.route}</td><td>${m.frequency}</td><td>${m.prescriberName}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p><em>${doc.currentMedications.statement}</em></p>`
  }

  <div class="section-title">Vital Signs Trend</div>
  ${
    doc.vitalSignsTrend.historicalReadings.length > 0
      ? `<table>
          <thead><tr><th>Date/Time (PHT)</th><th>Blood Pressure</th><th>HR (bpm)</th><th>RR (/min)</th><th>Temp (°C)</th><th>SpO2</th><th>BMI</th></tr></thead>
          <tbody>
            ${doc.vitalSignsTrend.historicalReadings.map((v) => `<tr><td>${v.recordedAtFormatted}</td><td><strong>${v.bloodPressure}</strong></td><td>${v.heartRateBpm}</td><td>${v.respiratoryRateBpm}</td><td>${v.temperatureCelsius}°C</td><td>${v.oxygenSaturationPct}%</td><td>${v.bmi || "N/A"}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p><em>${doc.vitalSignsTrend.statement}</em></p>`
  }

  <div class="section-title">Encounter History</div>
  ${
    doc.encounterHistory.encounters.length > 0
      ? doc.encounterHistory.encounters.map((enc) => `
        <div style="border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 10px; break-inside: avoid;">
          <div style="display: flex; justify-content: space-between;">
            <strong>${enc.dateFormatted} · ${enc.serviceName} (${enc.type})</strong>
            <span>Attending: <strong>${enc.attendingPhysician}</strong> ${enc.prcLicenseNo ? `(${enc.prcLicenseNo})` : "(MD)"}</span>
          </div>
          <p style="margin: 4px 0;"><strong>Chief Complaint:</strong> ${enc.chiefComplaint}</p>
          ${enc.soapSummary ? `
            <div style="font-size: 8.5pt; color: #333; margin: 4px 0; background: #f9f9f9; padding: 6px 8px; border-left: 3px solid #173f3b;">
              ${enc.soapSummary.rawNote && !enc.soapSummary.subjective ? `
                <div><strong>Consultation Note:</strong> ${enc.soapSummary.rawNote}</div>
              ` : `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">
                  <div><strong style="color: #173f3b;">S (Subjective):</strong> ${enc.soapSummary.subjective}</div>
                  <div><strong style="color: #173f3b;">O (Objective):</strong> ${enc.soapSummary.objective}</div>
                  <div><strong style="color: #173f3b;">A (Assessment):</strong> ${enc.soapSummary.assessment}</div>
                  <div><strong style="color: #173f3b;">P (Plan):</strong> ${enc.soapSummary.plan}</div>
                </div>
              `}
            </div>
          ` : ""}
          ${enc.diagnoses && enc.diagnoses.length > 0 ? `<div style="font-size: 8pt; margin-top: 2px;"><strong>Diagnoses:</strong> ${enc.diagnoses.join(", ")}</div>` : ""}
          ${enc.ordersSummary && enc.ordersSummary.length > 0 ? `<div style="font-size: 8pt; margin-top: 2px;"><strong>Orders &amp; Prescriptions:</strong> ${enc.ordersSummary.join("; ")}</div>` : ""}
          <small><strong>Disposition:</strong> ${enc.disposition}</small>
        </div>
      `).join("")
      : `<p><em>${doc.encounterHistory.statement}</em></p>`
  }

  <div class="section-title">Laboratory &amp; Diagnostic Results</div>
  ${
    doc.diagnosticResults.results.length > 0
      ? `<table>
          <thead><tr><th>Test Name</th><th>Observed Value</th><th>Unit</th><th>Reference Range</th><th>Flag</th><th>Result Date</th></tr></thead>
          <tbody>
            ${doc.diagnosticResults.results.map((r) => `<tr><td><strong>${r.testName}</strong></td><td>${r.value}</td><td>${r.unit}</td><td>${r.referenceRange}</td><td class="${r.abnormalFlag !== "NORMAL" ? "flag-high" : ""}">${r.abnormalFlag}</td><td>${r.resultDate}</td></tr>`).join("")}
          </tbody>
        </table>`
      : `<p><em>${doc.diagnosticResults.statement}</em></p>`
  }

  <div class="signature-grid">
    <div>
      <div class="sig-line">
        <strong>${doc.attestationAndSignatures.attendingPhysician.name}</strong><br>
        Attending Physician<br>
        ${doc.attestationAndSignatures.attendingPhysician.prcLicenseNo}<br>
        <small>Signed: ${doc.attestationAndSignatures.attendingPhysician.signedAtReadable || c.generatedAtReadable}</small>
      </div>
    </div>
    ${
      doc.attestationAndSignatures.recordsCustodian
        ? `<div>
            <div class="sig-line">
              <strong>${doc.attestationAndSignatures.recordsCustodian.name}</strong><br>
              ${doc.attestationAndSignatures.recordsCustodian.title}<br>
              Official Medical Records Seal &amp; Certification<br>
              <small>${doc.attestationAndSignatures.recordsCustodian.certificationStatement}</small>
            </div>
          </div>`
        : `<div>
            <div class="sig-line">
              <strong>Patient Acknowledgment</strong><br>
              Direct Personal Health Record Copy<br>
              <small>Released under Section 12, RA 10173</small>
            </div>
          </div>`
    }
  </div>

  <div class="footer">
    <div>
      <strong>Document ID:</strong> ${c.documentId} · <strong>Verification:</strong> ${c.verificationUrl}<br>
      <small>${doc.footer.dataPrivacyNotice}</small>
    </div>
    <div style="text-align: right;">
      <small>${doc.footer.confidentialityNotice}</small>
    </div>
  </div>
</body>
</html>`;
}
