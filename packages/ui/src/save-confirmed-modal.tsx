"use client";

import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, cn } from "./index";

export type SaveConfirmedBadgeVariant = "success" | "info" | "warning" | "accent";

export interface SaveSummaryItem {
  label: string;
  value: ReactNode;
  unit?: string;
  highlight?: boolean;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info";
  icon?: "heart" | "activity" | "thermometer" | "wind" | "clock" | "hash" | "user" | "file" | "scale" | "ruler" | "alert";
}

export interface SaveConfirmedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  badge?: string;
  badgeVariant?: SaveConfirmedBadgeVariant;
  recordType?: "triage" | "encounter" | "soap" | "prescription" | "certificate" | "order" | "general";
  patientName?: string;
  patientSubtitle?: string;
  timestamp?: Date | string;
  recordId?: string;
  summaryItems?: SaveSummaryItem[];
  detailsSnippet?: {
    title?: string;
    content: string;
    maxLines?: number;
  };
  auditInfo?: {
    savedBy?: string;
    organization?: string;
    version?: string | number;
    encryptionNotice?: string;
  };
  primaryAction?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "secondary" | "outline";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "secondary" | "outline" | "ghost";
  };
  tertiaryAction?: {
    label: string;
    onClick: () => void;
  };
  autoCloseDelayMs?: number;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Universal Reusable Confirmed Modal for Saving operations across the Healthcare OS.
 * Provides clear, unambiguous confirmation with rich clinical summaries, EHR commit verification,
 * and context-aware follow-up actions.
 */
export function SaveConfirmedModal({
  isOpen,
  onClose,
  title = "Saved Successfully",
  subtitle = "Your changes have been safely recorded and committed to the longitudinal medical record.",
  badge = "CONFIRMED & COMMITTED",
  badgeVariant = "success",
  recordType = "general",
  patientName,
  patientSubtitle,
  timestamp,
  recordId,
  summaryItems = [],
  detailsSnippet,
  auditInfo,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  autoCloseDelayMs,
  closeOnBackdrop = true,
  closeOnEsc = true,
  children,
  className,
}: SaveConfirmedModalProps) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus primary button when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        primaryBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // Handle optional autoClose timer
  useEffect(() => {
    if (!isOpen || !autoCloseDelayMs || autoCloseDelayMs <= 0) return;
    const intervalMs = 50;
    const step = (intervalMs / autoCloseDelayMs) * 100;

    const timer = setInterval(() => {
      if (!isPaused) {
        setProgress((prev) => {
          if (prev <= step) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev - step;
        });
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isOpen, autoCloseDelayMs, isPaused, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && closeOnBackdrop) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose],
  );

  if (!isOpen) return null;

  const formattedTime = timestamp
    ? typeof timestamp === "string"
      ? timestamp
      : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={cn("odyssey-save-modal-backdrop", className)}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="odyssey-save-modal-title"
      aria-describedby="odyssey-save-modal-subtitle"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="odyssey-save-modal-card"
        data-record-type={recordType}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="odyssey-save-modal__glow" />

        {/* Close "X" Button */}
        <button
          type="button"
          className="odyssey-save-modal__close-btn"
          onClick={onClose}
          aria-label="Close save confirmation"
          title="Close (Esc)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="odyssey-save-modal__header">
          {/* Animated Success Checkmark */}
          <div className="odyssey-save-modal__icon-wrap">
            <div className="odyssey-save-modal__icon-pulse" />
            <svg
              className="odyssey-save-modal__check-svg"
              viewBox="0 0 52 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle
                className="odyssey-save-modal__check-circle"
                cx="26"
                cy="26"
                r="24"
                stroke="currentColor"
                strokeWidth="3.5"
              />
              <path
                className="odyssey-save-modal__check-path"
                d="M15 27.5L22.5 35L37 19"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Badge */}
          {badge && (
            <div
              className={cn(
                "odyssey-save-modal__badge",
                `odyssey-save-modal__badge--${badgeVariant}`,
              )}
            >
              <span className="odyssey-save-modal__badge-dot" />
              <span>{badge}</span>
            </div>
          )}

          {/* Title & Subtitle */}
          <h2 id="odyssey-save-modal-title" className="odyssey-save-modal__title">
            {title}
          </h2>
          {subtitle && (
            <p
              id="odyssey-save-modal-subtitle"
              className="odyssey-save-modal__subtitle"
            >
              {subtitle}
            </p>
          )}

          {/* Patient Context Pill (if applicable) */}
          {patientName && (
            <div className="odyssey-save-modal__patient-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <strong>{patientName}</strong>
              {patientSubtitle && <span>· {patientSubtitle}</span>}
            </div>
          )}
        </div>

        {/* Modal Body / Summary Section */}
        <div className="odyssey-save-modal__body">
          {/* Metadata bar (Timestamp & Reference ID) */}
          {(formattedTime || recordId) && (
            <div className="odyssey-save-modal__meta-bar">
              <div className="odyssey-save-modal__meta-item">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Recorded: {formattedTime}</span>
              </div>
              {recordId && (
                <div className="odyssey-save-modal__meta-item">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="4" y1="9" x2="20" y2="9" />
                    <line x1="4" y1="15" x2="20" y2="15" />
                    <line x1="10" y1="3" x2="8" y2="21" />
                    <line x1="16" y1="3" x2="14" y2="21" />
                  </svg>
                  <span className="odyssey-save-modal__code">{recordId}</span>
                </div>
              )}
            </div>
          )}

          {/* Structured Key-Value Summaries */}
          {summaryItems.length > 0 && (
            <div className="odyssey-save-modal__summary-grid">
              {summaryItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className={cn(
                    "odyssey-save-modal__summary-card",
                    item.highlight && "odyssey-save-modal__summary-card--highlight",
                  )}
                >
                  <span className="odyssey-save-modal__summary-label">
                    {item.label}
                  </span>
                  <div className="odyssey-save-modal__summary-value-wrap">
                    {item.badgeVariant ? (
                      <span
                        className={cn(
                          "odyssey-save-modal__value-badge",
                          `odyssey-save-modal__value-badge--${item.badgeVariant}`,
                        )}
                      >
                        {item.value}
                      </span>
                    ) : (
                      <span className="odyssey-save-modal__summary-value">
                        {item.value}
                      </span>
                    )}
                    {item.unit && (
                      <span className="odyssey-save-modal__summary-unit">
                        {item.unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Details / Text Snippet */}
          {detailsSnippet && detailsSnippet.content && (
            <div className="odyssey-save-modal__snippet-wrap">
              {detailsSnippet.title && (
                <h4 className="odyssey-save-modal__snippet-title">
                  {detailsSnippet.title}
                </h4>
              )}
              <div
                className="odyssey-save-modal__snippet-text"
                style={
                  detailsSnippet.maxLines
                    ? {
                        display: "-webkit-box",
                        WebkitLineClamp: detailsSnippet.maxLines,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }
                    : undefined
                }
              >
                {detailsSnippet.content}
              </div>
            </div>
          )}

          {/* Custom Slot / Children */}
          {children}

          {/* Audit & EHR Commitment Guarantee */}
          <div className="odyssey-save-modal__audit-banner">
            <div className="odyssey-save-modal__audit-icon">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="odyssey-save-modal__audit-text">
              <strong>Secure EHR Commitment:</strong>{" "}
              {auditInfo?.encryptionNotice ||
                "Encrypted with AES-256 GCM · Immutable audit trail · Synchronized across clinical stations."}
              {auditInfo?.version != null && ` (Revision v${auditInfo.version})`}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="odyssey-save-modal__footer">
          {tertiaryAction && (
            <button
              type="button"
              className="odyssey-save-modal__tertiary-btn"
              onClick={tertiaryAction.onClick}
            >
              {tertiaryAction.label}
            </button>
          )}
          <div className="odyssey-save-modal__action-group">
            {secondaryAction && (
              <Button
                variant={secondaryAction.variant || "outline"}
                onClick={secondaryAction.onClick}
                className="odyssey-save-modal__sec-btn"
              >
                {secondaryAction.label}
              </Button>
            )}
            <button
              ref={primaryBtnRef}
              type="button"
              className={cn(
                "odyssey-button",
                `odyssey-button--${primaryAction?.variant || "default"}`,
                "odyssey-save-modal__pri-btn",
              )}
              onClick={primaryAction ? primaryAction.onClick : onClose}
            >
              {primaryAction?.label || "Acknowledge & Close"}
            </button>
          </div>
        </div>

        {/* AutoClose Progress Indicator */}
        {autoCloseDelayMs && autoCloseDelayMs > 0 && (
          <div
            className="odyssey-save-modal__progress-bar"
            style={{ width: `${progress}%` }}
            title="Auto-dismiss timer (paused while hovering)"
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIZED PRESET: TRIAGE CONFIRMED SAVE MODAL
// ─────────────────────────────────────────────────────────────────────────────

export interface TriageVitalsSummary {
  systolicBp: number | string;
  diastolicBp: number | string;
  pulseBpm: number | string;
  respiratoryRate: number | string;
  temperatureC: number | string;
  oxygenSaturation: number | string;
  weightKg?: number | string | null;
  heightCm?: number | string | null;
  painScore?: number | string | null;
  acuity?: "routine" | "urgent" | "emergency" | string;
}

export interface TriageSaveConfirmedModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  appointmentId?: string;
  vitals: TriageVitalsSummary;
  chiefComplaint?: string | null;
  notes?: string | null;
  isCorrection?: boolean;
  onProceedToConsultation?: () => void;
  onReturnToQueue?: () => void;
  onKeepEditing?: () => void;
  className?: string;
}

/**
 * Reusable modal for confirming Triage vital signs & assessments have been saved.
 * Displays blood pressure, pulse, temperature, SpO2, respiratory rate, acuity badge,
/**
 * Pure builder function for Triage vital sign summary items.
 */
export function buildTriageSaveSummary(vitals: TriageVitalsSummary): SaveSummaryItem[] {
  const acuity = (vitals.acuity || "routine").toLowerCase();
  const acuityVariant =
    acuity === "emergency"
      ? "danger"
      : acuity === "urgent"
        ? "warning"
        : "success";

  const acuityLabel =
    acuity === "emergency"
      ? "Emergency"
      : acuity === "urgent"
        ? "Urgent"
        : "Routine";

  const summaryItems: SaveSummaryItem[] = [
    {
      label: "Blood Pressure",
      value: `${vitals.systolicBp}/${vitals.diastolicBp}`,
      unit: "mmHg",
      highlight: true,
    },
    {
      label: "Pulse Rate",
      value: vitals.pulseBpm,
      unit: "bpm",
    },
    {
      label: "Oxygen Saturation",
      value: vitals.oxygenSaturation,
      unit: "%",
    },
    {
      label: "Temperature",
      value: vitals.temperatureC,
      unit: "°C",
    },
    {
      label: "Respiratory Rate",
      value: vitals.respiratoryRate,
      unit: "/min",
    },
    {
      label: "Clinical Acuity",
      value: acuityLabel,
      badgeVariant: acuityVariant,
    },
  ];

  if (vitals.painScore != null && vitals.painScore !== "") {
    summaryItems.push({
      label: "Pain Score",
      value: `${vitals.painScore} / 10`,
      badgeVariant: Number(vitals.painScore) >= 7 ? "danger" : Number(vitals.painScore) >= 4 ? "warning" : "info",
    });
  }

  if (vitals.weightKg != null && vitals.weightKg !== "") {
    summaryItems.push({
      label: "Weight",
      value: vitals.weightKg,
      unit: "kg",
    });
  }

  if (vitals.heightCm != null && vitals.heightCm !== "") {
    summaryItems.push({
      label: "Height",
      value: vitals.heightCm,
      unit: "cm",
    });
  }

  return summaryItems;
}

/**
 * Reusable modal for confirming Triage vital signs & assessments have been saved.
 * Displays blood pressure, pulse, temperature, SpO2, respiratory rate, acuity badge,
 * and chief complaint with clear next clinical steps (Return to Queue or Proceed to Consult).
 */
export function TriageSaveConfirmedModal({
  isOpen,
  onClose,
  patientName,
  appointmentId,
  vitals,
  chiefComplaint,
  notes,
  isCorrection = false,
  onProceedToConsultation,
  onReturnToQueue,
  onKeepEditing,
  className,
}: TriageSaveConfirmedModalProps) {
  const summaryItems = buildTriageSaveSummary(vitals);

  return (
    <SaveConfirmedModal
      isOpen={isOpen}
      onClose={onClose}
      recordType="triage"
      title={isCorrection ? "Triage Correction Saved & Verified" : "Triage Assessment Confirmed & Saved"}
      subtitle={
        isCorrection
          ? "A new verified revision of the patient's vital signs has been saved to the longitudinal record."
          : "Vital signs recorded successfully. The patient is marked as triage-complete and ready for doctor consultation."
      }
      badge={isCorrection ? "TRIAGE REVISION VERIFIED" : "TRIAGE COMPLETE · EHR COMMITTED"}
      badgeVariant={isCorrection ? "info" : "success"}
      patientName={patientName}
      patientSubtitle="Outpatient Check-in & Triage"
      recordId={appointmentId ? `APT-${appointmentId.slice(0, 8).toUpperCase()}` : undefined}
      summaryItems={summaryItems}
      detailsSnippet={
        chiefComplaint
          ? {
              title: "Chief Complaint / Reason for Visit",
              content: chiefComplaint,
              maxLines: 3,
            }
          : notes
            ? {
                title: "Triage Clinical Notes",
                content: notes,
                maxLines: 3,
              }
            : undefined
      }
      auditInfo={{
        encryptionNotice: "Triage observations cryptographically verified and broadcast to clinic queue.",
      }}
      primaryAction={{
        label: onReturnToQueue ? "Return to Daily Queue" : onProceedToConsultation ? "Open Doctor Consultation" : "Done",
        onClick: () => {
          onClose();
          if (onReturnToQueue) onReturnToQueue();
          else if (onProceedToConsultation) onProceedToConsultation();
        },
      }}
      secondaryAction={{
        label: onKeepEditing ? "Keep Editing Triage" : "Close",
        onClick: () => {
          onClose();
          if (onKeepEditing) onKeepEditing();
        },
        variant: "outline",
      }}
      className={className}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIZED PRESET: ENCOUNTER / SOAP CONFIRMED SAVE MODAL
// ─────────────────────────────────────────────────────────────────────────────

export interface EncounterSaveConfirmedModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  encounterId: string;
  noteSnippet?: string;
  revisionNumber?: number | string;
  timestamp?: Date | string;
  onContinueEncounter?: () => void;
  onFinishEncounter?: () => void;
  className?: string;
}

/**
 * Pure builder function for Encounter consultation note summary items.
 */
export function buildEncounterSaveSummary(
  encounterId: string,
  noteSnippet?: string,
  revisionNumber?: number | string,
): SaveSummaryItem[] {
  const isRevision = Boolean(revisionNumber && Number(revisionNumber) > 1);

  const wordCount = noteSnippet
    ? noteSnippet.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const hasSubjective = noteSnippet ? /subjective:/i.test(noteSnippet) : false;
  const hasObjective = noteSnippet ? /objective:/i.test(noteSnippet) : false;
  const hasAssessment = noteSnippet ? /assessment:/i.test(noteSnippet) : false;
  const hasPlan = noteSnippet ? /plan:/i.test(noteSnippet) : false;

  const sectionsCount = [hasSubjective, hasObjective, hasAssessment, hasPlan].filter(Boolean).length;

  return [
    {
      label: "Encounter Reference",
      value: `ENC-${encounterId.slice(0, 8).toUpperCase()}`,
      highlight: true,
    },
    {
      label: "Documentation Status",
      value: isRevision ? `Revision #${revisionNumber}` : "Active Record",
      badgeVariant: "success",
    },
    {
      label: "Word Count",
      value: `${wordCount} words`,
      unit: sectionsCount > 0 ? `(${sectionsCount}/4 SOAP sections)` : undefined,
    },
  ];
}

/**
 * Reusable modal for confirming Clinical Encounter & SOAP documentation has been saved.
 * Reassures the clinician that notes, orders, and diagnostic findings are committed to
 * the EHR record with revision tracking.
 */
export function EncounterSaveConfirmedModal({
  isOpen,
  onClose,
  patientName,
  encounterId,
  noteSnippet,
  revisionNumber,
  timestamp,
  onContinueEncounter,
  onFinishEncounter,
  className,
}: EncounterSaveConfirmedModalProps) {
  const isRevision = Boolean(revisionNumber && Number(revisionNumber) > 1);
  const summaryItems = buildEncounterSaveSummary(encounterId, noteSnippet, revisionNumber);

  return (
    <SaveConfirmedModal
      isOpen={isOpen}
      onClose={onClose}
      recordType="encounter"
      title="Clinical Consultation Note Saved"
      subtitle="Your clinical assessment and management plan have been safely committed to the patient's EHR record."
      badge={isRevision ? `REVISION #${revisionNumber} SAVED` : "EHR DOCUMENTATION COMMITTED"}
      badgeVariant="success"
      patientName={patientName}
      patientSubtitle="Active Clinical Encounter"
      recordId={`ENC-${encounterId.slice(0, 8).toUpperCase()}`}
      timestamp={timestamp}
      summaryItems={summaryItems}
      detailsSnippet={
        noteSnippet
          ? {
              title: "Recorded Consultation Note Excerpt",
              content: noteSnippet,
              maxLines: 4,
            }
          : undefined
      }
      auditInfo={{
        version: revisionNumber || 1,
        encryptionNotice: "Encrypted at rest · Patient privacy safeguarded under EHR compliance standard.",
      }}
      primaryAction={{
        label: "Continue Consultation",
        onClick: () => {
          onClose();
          if (onContinueEncounter) onContinueEncounter();
        },
      }}
      secondaryAction={{
        label: onFinishEncounter ? "Complete Encounter" : "Close",
        onClick: () => {
          onClose();
          if (onFinishEncounter) onFinishEncounter();
        },
        variant: "outline",
      }}
      className={className}
    />
  );
}
