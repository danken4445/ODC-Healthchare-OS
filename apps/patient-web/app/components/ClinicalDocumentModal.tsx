"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@odyssey/ui";

export interface ClinicalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  downloadFilename: string;
  onDownloadPdf: () => Promise<void>;
  children: React.ReactNode;
}

export function ClinicalDocumentModal({
  isOpen,
  onClose,
  title,
  downloadFilename,
  onDownloadPdf,
  children,
}: ClinicalDocumentModalProps) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleDownload() {
    setDownloading(true);
    try {
      await onDownloadPdf();
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="clinical-doc-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflowY: "auto",
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(6px)",
        padding: "24px 16px",
      }}
    >
      {/* Sticky Top Toolbar */}
      <div
        className="clinical-doc-modal-toolbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          maxWidth: 960,
          margin: "0 auto 20px auto",
          background: "#ffffff",
          borderRadius: "8px",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "1.25rem" }}>📄</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
              {title}
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                color: "#0f766e",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Standard Format PDF · Doctor Template Format
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            style={{
              backgroundColor: "#0f766e",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 600,
            }}
          >
            {downloading ? "Exporting PDF…" : "📥 Download PDF"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            🖨️ Print
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onClose}
            aria-label="Close document preview"
          >
            ✕ Close
          </Button>
        </div>
      </div>

      {/* Printable / Rendered Document Target */}
      <div
        id="clinical-document-pdf-target"
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
