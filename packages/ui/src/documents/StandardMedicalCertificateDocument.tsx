import React from "react";

export interface StandardMedicalCertificateDocumentProps {
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
  title?: string;
  statement: string;
  diagnosisSummary?: string;
  restDays?: string | number;
  remarks?: string;
  template?: {
    title?: string;
    html?: string;
    certificate?: {
      variant?: "fitness_to_work" | "fitness_to_travel" | "general";
      remarks?: string;
      restDays?: string;
    };
  } | null;
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

export function StandardMedicalCertificateDocument({
  clinic,
  doctor,
  patient,
  date,
  encounterId,
  title = "MEDICAL CERTIFICATE",
  statement,
  diagnosisSummary,
  restDays,
  remarks,
  template,
  pageSize = "A4",
  className = "",
}: StandardMedicalCertificateDocumentProps) {
  const effectiveRestDays = restDays ?? template?.certificate?.restDays ?? "";
  const effectiveRemarks = remarks ?? template?.certificate?.remarks ?? "";

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
    rest_days: effectiveRestDays,
  };

  const renderedTemplateHtml = template?.html
    ? resolveTokens(template.html, tokenMap)
    : null;

  return (
    <article
      className={`std-doc std-cert-doc ${pageSize === "Letter" ? "size-letter" : "size-a4"} ${className}`.trim()}
      role="document"
      aria-label={title || "Medical Certificate"}
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
              🏥
            </div>
          )}
          <div className="std-doc-facility-info">
            <h1 className="std-doc-facility-name">{clinic.name}</h1>
            {clinic.address && <p className="std-doc-facility-address">{clinic.address}</p>}
            <p className="std-doc-facility-contact">
              {clinic.telecom && <span>Tel: {clinic.telecom}</span>}
              {clinic.email && <span>Email: {clinic.email}</span>}
              {clinic.accreditation && <span>Accreditation: {clinic.accreditation}</span>}
            </p>
          </div>
        </div>

        {/* Doctor Header Block */}
        <div className="std-doc-doctor-card">
          <div className="std-doc-doctor-name">{doctor.name}</div>
          <div className="std-doc-doctor-spec">
            {doctor.specialty || "General Medicine & Clinical Practice"}
          </div>
          <div className="std-doc-doctor-ids">
            {doctor.licenseNo && <span>Lic No: {doctor.licenseNo}</span>}
            {doctor.prcNo && <span>PRC No: {doctor.prcNo}</span>}
            {doctor.ptrNo && <span>PTR: {doctor.ptrNo}</span>}
          </div>
        </div>
      </header>

      {/* Certificate Title */}
      <div className="std-cert-title-container">
        <h2 className="std-cert-title">{template?.title || title}</h2>
        <div className="std-cert-date">Date Issued: {date}</div>
      </div>

      {/* Salutation */}
      <div className="std-cert-salutation">TO WHOM IT MAY CONCERN:</div>

      {/* Certificate Body */}
      <section className="std-cert-body">
        {renderedTemplateHtml ? (
          <div
            className="std-cert-template-content"
            dangerouslySetInnerHTML={{ __html: renderedTemplateHtml }}
          />
        ) : (
          <div className="std-cert-default-content">
            <p>
              This is to certify that <strong>{patient.name}</strong>,{" "}
              {patient.age ? `${patient.age} years old` : "adult"}, {patient.gender || ""},{" "}
              residing at {patient.address || "the address on file"}, was clinically evaluated
              and examined on <strong>{date}</strong>.
            </p>
            {diagnosisSummary && (
              <p>
                <strong>Diagnosis:</strong> {diagnosisSummary}
              </p>
            )}
            {statement && (
              <div className="std-cert-statement">
                <p>{statement}</p>
              </div>
            )}
            {effectiveRestDays && (
              <p>
                The patient is advised to rest for <strong>{effectiveRestDays}</strong> day(s)
                from the date of examination.
              </p>
            )}
            {effectiveRemarks && (
              <p>
                <strong>Remarks / Recommendations:</strong> {effectiveRemarks}
              </p>
            )}
            <p className="std-cert-disclaimer-body">
              This medical certification is issued upon the request of the patient for whatever
              legitimate medical, employment, or academic purpose it may serve, except for
              medico-legal cases.
            </p>
          </div>
        )}
      </section>

      {/* Patient Details Footer Box */}
      <section className="std-cert-meta-box" aria-label="Summary metadata">
        <div className="std-cert-meta-row">
          <span>
            <strong>Patient:</strong> {patient.name}
          </span>
          <span>
            <strong>Age/Sex:</strong> {patient.age ? `${patient.age} yrs` : "—"} /{" "}
            {patient.gender || "—"}
          </span>
          <span>
            <strong>Record Ref:</strong> {encounterId ? encounterId.slice(0, 8).toUpperCase() : "OPD"}
          </span>
        </div>
      </section>

      {/* Bottom Footer / Attestation / Signature Line */}
      <footer className="std-doc-footer">
        <div className="std-doc-compliance">
          <div className="std-doc-compliance-title">
            OFFICIAL CLINICAL MEDICAL CERTIFICATE
          </div>
          <div className="std-doc-compliance-text">
            NOT VALID FOR MEDICO-LEGAL PURPOSES. Certified authentic medical record document
            generated through Odyssey Healthcare OS.
          </div>
          <div className="std-doc-security-hash">
            Cert ID: {encounterId ? `MC-${encounterId.slice(0, 12)}` : "CERT-OFFICIAL"} · Verified Doctor Signature
          </div>
        </div>

        <div className="std-doc-signature-block">
          <div className="std-doc-signature-space">
            <div className="std-doc-digital-badge">DIGITALLY ATTESTED &amp; ISSUED</div>
          </div>
          <div className="std-doc-signature-line" />
          <div className="std-doc-doctor-signoff">
            <strong>{doctor.name}</strong>
            <div>{doctor.title || "Attending Physician"}</div>
            {doctor.licenseNo && <div>Lic No: {doctor.licenseNo}</div>}
            {doctor.prcNo && <div>PRC No: {doctor.prcNo}</div>}
            {doctor.ptrNo && <div>PTR: {doctor.ptrNo}</div>}
          </div>
        </div>
      </footer>
    </article>
  );
}
