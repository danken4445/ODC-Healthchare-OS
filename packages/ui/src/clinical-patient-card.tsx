import { PatientQrCode } from "./patient-qr-code";

export interface ClinicalPatientCardProps {
  bloodType?: string | null;
  birthDate?: string | null;
  compact?: boolean;
  displayName: string;
  gender?: string | null;
  photoUrl?: string | null;
  planName?: string | null;
  policyNumber?: string | null;
  qrPayload: string;
}

function ageAtPresent(birthDate?: string | null): string {
  if (!birthDate) return "Not recorded";
  const birthday = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birthday.getTime())) return "Not recorded";
  const now = new Date();
  let age = now.getFullYear() - birthday.getFullYear();
  if (
    now.getMonth() < birthday.getMonth() ||
    (now.getMonth() === birthday.getMonth() &&
      now.getDate() < birthday.getDate())
  )
    age -= 1;
  return `${age} years`;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PT"
  );
}

export function ClinicalPatientCard({
  bloodType,
  birthDate,
  compact = false,
  displayName,
  gender,
  photoUrl,
  planName,
  policyNumber,
  qrPayload,
}: ClinicalPatientCardProps) {
  return (
    <section
      className="odyssey-clinical-patient"
      aria-labelledby="clinical-patient-name"
    >
      <div className="odyssey-clinical-patient__identity">
        {photoUrl ? (
          <img
            alt=""
            className="odyssey-clinical-patient__photo"
            src={photoUrl}
          />
        ) : (
          <span
            className="odyssey-clinical-patient__photo odyssey-clinical-patient__photo--placeholder"
            aria-hidden="true"
          >
            {initials(displayName)}
          </span>
        )}
        <div>
          <p>Patient</p>
          <h2 id="clinical-patient-name">{displayName}</h2>
        </div>
      </div>
      <dl className="odyssey-clinical-patient__facts">
        <div>
          <dt>Date of birth</dt>
          <dd>{birthDate ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{ageAtPresent(birthDate)}</dd>
        </div>
        <div>
          <dt>Gender</dt>
          <dd>{gender ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Blood type</dt>
          <dd>{bloodType ?? "Not recorded"}</dd>
        </div>
      </dl>
      {compact ? (
        <details className="odyssey-clinical-patient__more">
          <summary>Full profile, coverage and patient QR</summary>
          <PatientAdditionalContext
            planName={planName}
            policyNumber={policyNumber}
            qrPayload={qrPayload}
          />
        </details>
      ) : (
        <PatientAdditionalContext
          planName={planName}
          policyNumber={policyNumber}
          qrPayload={qrPayload}
        />
      )}
    </section>
  );
}

function PatientAdditionalContext({
  planName,
  policyNumber,
  qrPayload,
}: Pick<ClinicalPatientCardProps, "planName" | "policyNumber" | "qrPayload">) {
  return (
    <>
      <div className="odyssey-clinical-patient__coverage">
        <div>
          <span>Plan</span>
          <strong>{planName ?? "No active plan recorded"}</strong>
        </div>
        <div>
          <span>Policy / subscriber</span>
          <strong>{policyNumber ?? "Not recorded"}</strong>
        </div>
      </div>
      <div className="odyssey-clinical-patient__qr-row">
        <PatientQrCode payload={qrPayload} size={104} />
        <p>
          <strong>Patient QR</strong>
          <span>
            For clinic identification only. This code does not grant portal
            access.
          </span>
        </p>
      </div>
    </>
  );
}
