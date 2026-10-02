import { verifyPmrDocument, createBrowserSupabaseClient } from "@odyssey/supabase-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinical Document Verification - Odyssey Health",
  description: "Public verification service for official Patient Medical Records (RA 10173 compliant).",
};

interface VerifyPageProps {
  params: Promise<{ docId: string }>;
}

export default async function VerifyPmrPage({ params }: VerifyPageProps) {
  const { docId } = await params;
  const client = createBrowserSupabaseClient();
  const verification = await verifyPmrDocument(client, docId);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: "32px 24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        color: "#1c2b29",
      }}
    >
      <div
        style={{
          borderBottom: "2px solid #173f3b",
          paddingBottom: 16,
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#173f3b" }}>
            Odyssey Health OS
          </h1>
          <small style={{ color: "#555" }}>
            Official Medical Document Verification Service
          </small>
        </div>
        <span
          style={{
            fontSize: "0.8rem",
            background: "#e8f4f2",
            color: "#173f3b",
            padding: "4px 8px",
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          RA 10173 Protected
        </span>
      </div>

      <div
        style={{
          border: verification.valid ? "2px solid #2e7d32" : "2px solid #d32f2f",
          background: verification.valid ? "#f1f8e9" : "#ffebee",
          borderRadius: 8,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: "2rem" }}>{verification.valid ? "✓" : "⚠"}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", color: verification.valid ? "#2e7d32" : "#d32f2f" }}>
              {verification.valid
                ? "AUTHENTIC CLINICAL DOCUMENT VERIFIED"
                : `DOCUMENT STATUS: ${verification.status}`}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.95rem" }}>
              {verification.message}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 16,
            marginTop: 16,
            display: "grid",
            gap: 12,
            fontSize: "0.9rem",
          }}
        >
          <div>
            <span style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
              Document Control Identifier
            </span>
            <strong style={{ fontFamily: "monospace", fontSize: "1rem" }}>
              {verification.documentId}
            </strong>
          </div>

          <div>
            <span style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
              Issuing Facility / Clinic
            </span>
            <strong>{verification.facilityName}</strong>
          </div>

          {verification.issuedAt && (
            <div>
              <span style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
                Date &amp; Time Issued (Philippine Standard Time)
              </span>
              <span>{verification.issuedAt}</span>
            </div>
          )}

          {verification.copyType && (
            <div>
              <span style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
                Copy Classification &amp; Revision
              </span>
              <span>
                {verification.copyType} · Revision {verification.revision}
              </span>
            </div>
          )}

          {verification.sha256Hash && (
            <div>
              <span style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
                SHA-256 Cryptographic Integrity Digest
              </span>
              <code
                style={{
                  display: "block",
                  padding: "6px 8px",
                  background: "#f5f5f5",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {verification.sha256Hash}
              </code>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #ccc",
          paddingTop: 16,
          fontSize: "0.8rem",
          color: "#555",
          lineHeight: 1.5,
        }}
      >
        <p style={{ margin: "0 0 8px" }}>
          <strong>Privacy Safeguard (Republic Act 10173):</strong> In strict compliance with
          the Philippine Data Privacy Act, patient names, diagnoses, medical interventions,
          and protected health information (PHI) are never displayed on public verification
          endpoints.
        </p>
        <p style={{ margin: 0 }}>
          To view the authorized medical chart contents, please present the formal printed
          Official Copy or use the secure passcode-protected link provided directly by the patient.
        </p>
      </div>
    </main>
  );
}
