import React from "react";
import type { PmrAttestationSection } from "@odyssey/types";

export interface SignatureBlockProps {
  attestation: PmrAttestationSection;
  generatedAtReadable: string;
}

export function SignatureBlock({ attestation, generatedAtReadable }: SignatureBlockProps) {
  const { attendingPhysician, recordsCustodian } = attestation;

  return (
    <div className="pmr-signatures" aria-label="Attestation and Signatures">
      <div>
        <div className="pmr-signature-line">
          {attendingPhysician.signatureUrl ? (
            <img
              src={attendingPhysician.signatureUrl}
              alt="Physician e-signature"
              style={{ maxHeight: 40, marginBottom: 4 }}
            />
          ) : (
            <div style={{ height: 35 }} />
          )}
          <strong style={{ fontSize: "9.5pt", display: "block" }}>
            {attendingPhysician.name}
          </strong>
          <div>Attending Physician</div>
          <div>{attendingPhysician.prcLicenseNo}</div>
          {attendingPhysician.ptrNumber && <div>{attendingPhysician.ptrNumber}</div>}
          {attendingPhysician.s2Number && <div>{attendingPhysician.s2Number}</div>}
          <small style={{ color: "#555" }}>
            Signed: {attendingPhysician.signedAtReadable || generatedAtReadable}
          </small>
        </div>
      </div>

      <div>
        {recordsCustodian ? (
          <div className="pmr-signature-line">
            {recordsCustodian.signatureUrl ? (
              <img
                src={recordsCustodian.signatureUrl}
                alt="Custodian e-signature"
                style={{ maxHeight: 40, marginBottom: 4 }}
              />
            ) : (
              <div style={{ height: 35 }} />
            )}
            <strong style={{ fontSize: "9.5pt", display: "block" }}>
              {recordsCustodian.name}
            </strong>
            <div>{recordsCustodian.title}</div>
            <div>Institutional Records Custodian</div>
            <small style={{ display: "block", marginTop: 2, color: "#444", fontSize: "7pt" }}>
              {recordsCustodian.certificationStatement}
            </small>
          </div>
        ) : (
          <div className="pmr-signature-line">
            <div style={{ height: 35 }} />
            <strong style={{ fontSize: "9.5pt", display: "block" }}>
              Patient Portal Electronic Release
            </strong>
            <div>Personal Health Record Copy</div>
            <small style={{ color: "#555" }}>
              Compliant with Republic Act No. 10173 (Data Privacy Act of 2012)
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
