"use client";

import React, { useState } from "react";
import type {
  PmrDocument,
  PmrPageSize,
  PmrPreset,
  PmrSectionId,
  PmrShareLinkSummary,
} from "@odyssey/types";
import { PMR_SECTION_PRESETS } from "@odyssey/types";

export interface PmrEncounterOption {
  id: string;
  label: string;
  dateFormatted?: string;
  serviceName?: string;
}

export interface PmrToolbarProps {
  document: PmrDocument;
  encounters?: PmrEncounterOption[];
  selectedEncounterId?: string | null;
  onEncounterChange?: (encounterId: string | null) => void;
  onPageSizeChange?: (size: PmrPageSize) => void;
  onSectionsChange?: (sections: PmrSectionId[]) => void;
  onPresetChange?: (preset: PmrPreset) => void;
  onSavePdf?: () => Promise<void> | void;
  onCreateShareLink?: (input: {
    recipientName: string;
    recipientEmail?: string;
    purpose: string;
    passcode?: string;
    expiresInHours: number;
    sectionsIncluded: PmrSectionId[];
  }) => Promise<PmrShareLinkSummary | null>;
  onClose?: () => void;
}

export function PmrToolbar({
  document,
  encounters,
  selectedEncounterId,
  onEncounterChange,
  onPageSizeChange,
  onPresetChange,
  onSavePdf,
  onCreateShareLink,
  onClose,
}: PmrToolbarProps) {
  const [pageSize, setPageSize] = useState<PmrPageSize>(document.options.pageSize);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purpose, setPurpose] = useState(document.controlBlock.purposeOfRelease || "Continuity of Care Consultation");
  const [passcode, setPasscode] = useState("");
  const [expiresHours, setExpiresHours] = useState(72);
  const [selectedPreset, setSelectedPreset] = useState<PmrPreset>(document.options.presetUsed || "full_record");
  const [createdShare, setCreatedShare] = useState<PmrShareLinkSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  function handlePrint() {
    window.print();
  }

  async function handleSavePdf() {
    if (onSavePdf) {
      setIsSavingPdf(true);
      try {
        await onSavePdf();
      } finally {
        setIsSavingPdf(false);
      }
    } else {
      handlePrint();
    }
  }

  function handleSizeToggle(size: PmrPageSize) {
    setPageSize(size);
    onPageSizeChange?.(size);
  }

  async function handleShareSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onCreateShareLink) return;

    setIsSubmitting(true);
    try {
      const sections = PMR_SECTION_PRESETS[selectedPreset]?.sections ?? document.options.sectionsIncluded;
      const res = await onCreateShareLink({
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim() || undefined,
        purpose: purpose.trim(),
        passcode: passcode.trim() || undefined,
        expiresInHours: expiresHours,
        sectionsIncluded: sections,
      });
      if (res) {
        setCreatedShare(res);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function copyShareUrl() {
    if (!createdShare) return;
    const fullUrl = `${window.location.origin}${createdShare.shareUrl}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <div className="pmr-screen-toolbar no-print" style={toolbarContainerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong style={{ color: "#173f3b", fontSize: "0.95rem", display: "block" }}>
              Patient Medical Record (PMR)
            </strong>
            <span style={{ fontSize: "0.8rem", color: "#666" }}>
              {document.controlBlock.documentId} · {document.controlBlock.copyType}
            </span>
          </div>

          {onEncounterChange && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
              <label htmlFor="pmr-scope-select" style={{ fontSize: "0.8rem", color: "#4b5563", fontWeight: 600 }}>
                Scope:
              </label>
              <select
                id="pmr-scope-select"
                value={selectedEncounterId ?? document.controlBlock.encounterScopedId ?? ""}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  onEncounterChange(val ? val : null);
                }}
                style={selectStyle}
                aria-label="Filter PMR by encounter"
              >
                <option value="">All Encounters (Full Medical Record)</option>
                {encounters && encounters.length > 0
                  ? encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.label}
                      </option>
                    ))
                  : document.encounterHistory.encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.dateFormatted} · {enc.serviceName}
                      </option>
                    ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Page Size Toggle */}
          <div style={segmentedControlStyle}>
            <button
              type="button"
              onClick={() => handleSizeToggle("A4")}
              style={pageSize === "A4" ? activeSegmentStyle : segmentStyle}
            >
              A4
            </button>
            <button
              type="button"
              onClick={() => handleSizeToggle("Letter")}
              style={pageSize === "Letter" ? activeSegmentStyle : segmentStyle}
            >
              Letter
            </button>
          </div>

          {/* Print */}
          <button type="button" onClick={handlePrint} style={primaryBtnStyle}>
            🖨 Print Record
          </button>

          {/* Save PDF */}
          <button
            type="button"
            onClick={() => void handleSavePdf()}
            disabled={isSavingPdf}
            style={{
              ...outlineBtnStyle,
              opacity: isSavingPdf ? 0.7 : 1,
              cursor: isSavingPdf ? "wait" : "pointer",
            }}
          >
            {isSavingPdf ? "⏳ Saving PDF..." : "💾 Save PDF"}
          </button>

          {/* Share Link */}
          {onCreateShareLink && (
            <button
              type="button"
              onClick={() => {
                setCreatedShare(null);
                setShareModalOpen(true);
              }}
              style={outlineBtnStyle}
            >
              🔗 Secure Share
            </button>
          )}

          {onClose && (
            <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close document">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Share Modal Dialog */}
      {shareModalOpen && (
        <div style={modalBackdropStyle} role="dialog" aria-labelledby="share-modal-title" aria-modal="true">
          <div style={modalCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 id="share-modal-title" style={{ margin: 0, color: "#173f3b" }}>
                Create Secure Medical Record Share Link
              </h3>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {createdShare ? (
              <div>
                <div style={{ padding: 12, background: "#e8f5e9", borderRadius: 6, marginBottom: 16 }}>
                  <strong style={{ color: "#2e7d32", display: "block", marginBottom: 4 }}>
                    ✓ Secure Share Link Active
                  </strong>
                  <p style={{ margin: "0 0 8px", fontSize: "0.85rem" }}>
                    Expires in {expiresHours} hours · Maximum 10 views · Logged to RA 10173 Audit Trail.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}${createdShare.shareUrl}`}
                      style={{ flex: 1, padding: "8px 10px", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
                    />
                    <button type="button" onClick={copyShareUrl} style={primaryBtnStyle}>
                      {copied ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(false)}
                  style={{ width: "100%", ...outlineBtnStyle }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleShareSubmit}>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Section Preset</label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => {
                      const val = e.target.value as PmrPreset;
                      setSelectedPreset(val);
                      onPresetChange?.(val);
                    }}
                    style={inputStyle}
                  >
                    <option value="full_record">Full Medical Record (All Sections)</option>
                    <option value="continuity_of_care">Summary (Continuity of Care)</option>
                    <option value="referral_packet">Referral Packet (Specialist Consultation)</option>
                    <option value="patient_copy">Patient Copy (Personal Health Record)</option>
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Authorized Recipient Name *</label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Dr. Juan Dela Cruz / St. Luke's Medical Center"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Purpose of Release (RA 10173 Mandatory) *</label>
                  <input
                    type="text"
                    required
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Second opinion specialist referral"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Access Passcode (Optional)</label>
                    <input
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Leave blank for none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Expiration</label>
                    <select
                      value={expiresHours}
                      onChange={(e) => setExpiresHours(Number(e.target.value))}
                      style={inputStyle}
                    >
                      <option value={24}>24 Hours</option>
                      <option value={72}>72 Hours (Default)</option>
                      <option value={168}>7 Days</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={() => setShareModalOpen(false)} style={outlineBtnStyle}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} style={primaryBtnStyle}>
                    {isSubmitting ? "Creating..." : "Generate Share Link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const toolbarContainerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  width: "100%",
  maxWidth: "960px",
  margin: "0 auto 16px",
  backgroundColor: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  padding: "10px 16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
};

const segmentedControlStyle: React.CSSProperties = {
  display: "flex",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  overflow: "hidden",
};

const segmentStyle: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: "0.8rem",
  background: "#f9fafb",
  border: "none",
  cursor: "pointer",
  color: "#4b5563",
};

const activeSegmentStyle: React.CSSProperties = {
  ...segmentStyle,
  background: "#173f3b",
  color: "#ffffff",
  fontWeight: 600,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  backgroundColor: "#173f3b",
  color: "#ffffff",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

const outlineBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  backgroundColor: "#ffffff",
  color: "#173f3b",
  border: "1px solid #173f3b",
  borderRadius: "4px",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "1rem",
  color: "#6b7280",
  cursor: "pointer",
  padding: "4px 8px",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalCardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "24px",
  maxWidth: "500px",
  width: "90%",
  boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  fontSize: "0.85rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
};

const selectStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "0.8rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  backgroundColor: "#f9fafb",
  color: "#111827",
  cursor: "pointer",
  maxWidth: "260px",
};
