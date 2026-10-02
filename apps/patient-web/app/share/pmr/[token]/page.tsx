"use client";

import { useEffect, useState, use } from "react";
import { createBrowserSupabaseClient } from "@odyssey/supabase-client";
import type { PmrDocument } from "@odyssey/types";
import { PmrDocumentView } from "@odyssey/ui";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default function SharePmrPage({ params }: SharePageProps) {
  const { token } = use(params);
  const [passcode, setPasscode] = useState("");
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [document, setDocument] = useState<PmrDocument | null>(null);
  const [viewsRemaining, setViewsRemaining] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSharedDocument(passcodeAttempt?: string) {
    setLoading(true);
    setError(null);
    try {
      const client = createBrowserSupabaseClient();
      const dynamicClient = client as unknown as {
        rpc: (name: string, params: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { data, error: rpcError } = await dynamicClient.rpc("access_pmr_share_link", {
        p_share_token: token,
        p_passcode: passcodeAttempt || null,
        p_ip_address: null,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

      if (rpcError) {
        if (rpcError.message.includes("Passcode is required") || rpcError.message.includes("incorrect")) {
          setPasscodeRequired(true);
          setError(passcodeAttempt ? "Incorrect passcode. Please try again." : null);
          setLoading(false);
          return;
        }
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError("Unable to retrieve shared clinical document.");
        setLoading(false);
        return;
      }

      const r = row as {
        document_payload: PmrDocument;
        views_remaining: number;
        expires_at: string;
      };

      setDocument(r.document_payload);
      setViewsRemaining(r.views_remaining);
      setExpiresAt(r.expires_at);
      setPasscodeRequired(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSharedDocument();
  }, [token]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", fontFamily: "sans-serif" }}>
        <p>Verifying secure link and decrypting clinical document...</p>
      </div>
    );
  }

  if (passcodeRequired && !document) {
    return (
      <div
        style={{
          maxWidth: 440,
          margin: "80px auto",
          padding: 32,
          border: "1px solid #ccc",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          fontFamily: "sans-serif",
          background: "#fff",
        }}
      >
        <h2 style={{ margin: "0 0 8px", color: "#173f3b" }}>Passcode Protected Record</h2>
        <p style={{ fontSize: "0.9rem", color: "#555", margin: "0 0 20px" }}>
          This Patient Medical Record has been secured with a confidential access code set by the patient or issuing facility.
        </p>

        {error && (
          <div
            style={{
              padding: "8px 12px",
              background: "#ffebee",
              color: "#c62828",
              borderRadius: 4,
              fontSize: "0.85rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadSharedDocument(passcode);
          }}
        >
          <label
            style={{
              display: "block",
              fontWeight: 600,
              fontSize: "0.85rem",
              marginBottom: 6,
            }}
          >
            Enter Access Passcode
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: "1rem",
              border: "1px solid #bbb",
              borderRadius: 4,
              marginBottom: 20,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "#173f3b",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Unlock Medical Record
          </button>
        </form>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div
        style={{
          maxWidth: 500,
          margin: "80px auto",
          padding: 32,
          border: "2px solid #d32f2f",
          background: "#fff8f8",
          borderRadius: 8,
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#d32f2f", margin: "0 0 12px" }}>Access Restricted</h2>
        <p style={{ margin: "0 0 16px", color: "#333" }}>{error || "Link is expired or invalid."}</p>
        <small style={{ color: "#666" }}>
          Please contact the patient or medical records custodian to request a new secure link.
        </small>
      </div>
    );
  }

  return (
    <div style={{ background: "#f0f2f2", minHeight: "100vh", padding: "20px 0" }}>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto 16px",
          padding: "12px 20px",
          background: "#ffffff",
          borderRadius: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid #d0d7d7",
        }}
      >
        <div>
          <strong style={{ color: "#173f3b" }}>Secure Shared Patient Medical Record</strong>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>
            {viewsRemaining !== null && `Remaining Views: ${viewsRemaining} · `}
            {expiresAt && `Expires: ${new Date(expiresAt).toLocaleString()}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "8px 16px",
            background: "#173f3b",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Print / Save PDF
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <PmrDocumentView document={document} />
      </div>
    </div>
  );
}
