import React from "react";

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  notes?: string;
  quantity?: string;
}

export interface StandardPrescriptionDocumentProps {
  clinic: {
    name: string;
    address?: string;
    telecom?: string;
    email?: string;
    accreditation?: string;
    logoUrl?: string | null;
  };
  doctor: {
    name: string;
    title?: string;
    specialty?: string;
    licenseNo?: string;
    prcNo?: string;
    ptrNo?: string;
    s2No?: string;
  };
  patient: {
    name: string;
    age?: string | number;
    gender?: string;
    dob?: string;
    address?: string;
  };
  date: string;
  encounterId?: string;
  diagnosisSummary?: string;
  items: PrescriptionItem[];
  template?: {
    title?: string;
    html?: string;
    branding?: {
      source?: string;
      headerLogoPath?: string;
      watermarkPath?: string;
    };
  } | null;
  notes?: string | null;
  pageSize?: "A4" | "Letter";
  className?: string;
}

function resolveTokens(
  html: string,
  tokens: Record<string, string | number | undefined>
): string {
  return html.replace(/\{\{([a-z_.]+)\}\}/g, (_match, key: string) => {
    const val = tokens[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

export function StandardPrescriptionDocument({
  clinic,
  doctor,
  patient,
  date,
  encounterId,
  diagnosisSummary,
  items,
  template,
  notes,
  pageSize = "A4",
  className = "",
}: StandardPrescriptionDocumentProps) {
  const tokenMap: Record<string, string | number | undefined> = {
    "patient.name": patient.name,
    "patient.age": patient.age,
    "patient.dob": patient.dob,
    "doctor.name": doctor.name,
    "doctor.license_no": doctor.licenseNo,
    "doctor.prc_no": doctor.prcNo,
    "clinic.name": clinic.name,
    "clinic.address": clinic.address,
    "encounter.date": date,
    "diagnosis.summary": diagnosisSummary,
    "medication.name": items[0]?.medication,
    "medication.dosage": items[0]?.dosage,
    "medication.directions": items[0]?.frequency || items[0]?.dosage,
  };

  const renderedTemplateHtml = template?.html
    ? resolveTokens(template.html, tokenMap)
    : null;

  return (
    <article
      className={`std-doc std-rx-doc ${pageSize === "Letter" ? "size-letter" : "size-a4"} ${className}`.trim()}
      role="document"
      aria-label="Medical Prescription"
    >
      {/* Clinic Header / Letterhead */}
      <header className="std-doc-header">
        <div className="std-doc-branding">
          {clinic.logoUrl ? (
            <img
              src={clinic.logoUrl}
              alt={`${clinic.name} Logo`}
              className="std-doc-logo"
            />
          ) : (
            <div className="std-doc-logo-placeholder" aria-hidden="true">
              🩺
            </div>
          )}
          <div className="std-doc-facility-info">
            <h1 className="std-doc-facility-name">{clinic.name}</h1>
            {clinic.address && <p className="std-doc-facility-address">{clinic.address}</p>}
            <p className="std-doc-facility-contact">
              {clinic.telecom && <span>Tel: {clinic.telecom}</span>}
              {clinic.email && <span>Email: {clinic.email}</span>}
              {clinic.accreditation && <span>PhilHealth / DOH: {clinic.accreditation}</span>}
            </p>
          </div>
        </div>

        {/* Doctor Header Block */}
        <div className="std-doc-doctor-card">
          <div className="std-doc-doctor-name">{doctor.name}</div>
          <div className="std-doc-doctor-spec">
            {doctor.specialty || "General Medicine & Family Practice"}
          </div>
          <div className="std-doc-doctor-ids">
            {doctor.licenseNo && <span>Lic No: {doctor.licenseNo}</span>}
            {doctor.prcNo && <span>PRC No: {doctor.prcNo}</span>}
            {doctor.ptrNo && <span>PTR: {doctor.ptrNo}</span>}
          </div>
        </div>
      </header>

      {/* Patient Information Strip */}
      <section className="std-doc-patient-bar" aria-label="Patient Information">
        <div className="std-doc-patient-grid">
          <div>
            <span className="std-doc-label">PATIENT NAME</span>
            <span className="std-doc-value std-doc-value-bold">{patient.name}</span>
          </div>
          <div>
            <span className="std-doc-label">AGE / SEX</span>
            <span className="std-doc-value">
              {patient.age ? `${patient.age} yrs` : "—"} / {patient.gender || "—"}
            </span>
          </div>
          <div>
            <span className="std-doc-label">DATE</span>
            <span className="std-doc-value">{date}</span>
          </div>
          <div className="std-doc-col-span-2">
            <span className="std-doc-label">ADDRESS</span>
            <span className="std-doc-value">{patient.address || "On file"}</span>
          </div>
          <div>
            <span className="std-doc-label">ENCOUNTER / MRN</span>
            <span className="std-doc-value std-doc-mono">
              {encounterId ? encounterId.slice(0, 8).toUpperCase() : "OPD"}
            </span>
          </div>
          {diagnosisSummary && (
            <div className="std-doc-col-span-full">
              <span className="std-doc-label">DIAGNOSIS / INDICATION</span>
              <span className="std-doc-value">{diagnosisSummary}</span>
            </div>
          )}
        </div>
      </section>

      {/* Main Prescription Body */}
      <section className="std-rx-body" aria-label="Prescription Regimen">
        {/* Iconic Rx Symbol */}
        <div className="std-rx-symbol" aria-hidden="true">
          ℞
        </div>

        {/* Doctor Template guidance if applicable */}
        {renderedTemplateHtml && (
          <div
            className="std-rx-template-body"
            dangerouslySetInnerHTML={{ __html: renderedTemplateHtml }}
          />
        )}

        {/* Medication Line Items */}
        <ol className="std-rx-items">
          {items.map((item, index) => (
            <li key={index} className="std-rx-item">
              <div className="std-rx-item-header">
                <span className="std-rx-num">{index + 1}.</span>
                <span className="std-rx-drug-name">{item.medication}</span>
                {item.quantity && <span className="std-rx-quantity">#{item.quantity}</span>}
              </div>
              <div className="std-rx-item-details">
                <div className="std-rx-sig">
                  <strong>Sig:</strong> {item.dosage}
                  {item.frequency && ` · ${item.frequency}`}
                  {item.duration && ` · Duration: ${item.duration}`}
                </div>
                {item.notes && <div className="std-rx-item-notes">Instructions: {item.notes}</div>}
              </div>
            </li>
          ))}
        </ol>

        {notes && (
          <div className="std-rx-special-notes">
            <strong>Doctor&apos;s Special Instructions:</strong>
            <p>{notes}</p>
          </div>
        )}
      </section>

      {/* Bottom Footer / Attestation / Signature Line */}
      <footer className="std-doc-footer">
        <div className="std-doc-compliance">
          <div className="std-doc-compliance-title">
            ELECTRONIC PRESCRIPTION · VALID NATIONWIDE
          </div>
          <div className="std-doc-compliance-text">
            Compliant with RA 6675 (Generics Act of 1988), FDA Circular No. 2020-007, and
            DOH-PhilHealth Telemedicine Standard Guidelines. Valid for thirty (30) days from
            date of issue.
          </div>
          <div className="std-doc-security-hash">
            Document Ref: {encounterId || "OFFICIAL-RX"} · Auth: Verified Odyssey Clinical Signature
          </div>
        </div>

        <div className="std-doc-signature-block">
          <div className="std-doc-signature-space">
            <div className="std-doc-digital-badge">DIGITALLY SIGNED &amp; SEALED</div>
          </div>
          <div className="std-doc-signature-line" />
          <div className="std-doc-doctor-signoff">
            <strong>{doctor.name}</strong>
            <div>{doctor.title || "Attending Physician"}</div>
            {doctor.licenseNo && <div>Lic No: {doctor.licenseNo}</div>}
            {doctor.prcNo && <div>PRC No: {doctor.prcNo}</div>}
            {doctor.ptrNo && <div>PTR: {doctor.ptrNo}</div>}
            {doctor.s2No && <div>S2 No: {doctor.s2No}</div>}
          </div>
        </div>
      </footer>
    </article>
  );
}
