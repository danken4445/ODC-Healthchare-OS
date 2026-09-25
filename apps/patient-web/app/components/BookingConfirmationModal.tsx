"use client";

import type { AppointmentDeliveryMode, AppointmentSlotSummary, ClinicServiceSummary, OrganizationBranding } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import { useEffect } from "react";

interface BookingConfirmationModalProps {
  busy: boolean;
  isOpen: boolean;
  slot: AppointmentSlotSummary | null;
  mode: AppointmentDeliveryMode | null;
  service?: ClinicServiceSummary;
  clinicName?: string;
  branding?: OrganizationBranding | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function BookingConfirmationModal({
  busy,
  isOpen,
  slot,
  mode,
  service,
  clinicName,
  branding,
  onCancel,
  onConfirm,
}: BookingConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!isOpen || !slot || !mode) return null;

  const isVirtual = mode === "virtual";
  const clinicDisplayName = branding?.displayName || clinicName || "Odyssey Health Partner";
  const serviceName = service?.name || slot.service_type || "General consultation";

  // CMS message configured by admin in Company settings, with thoughtful fallback defaults
  const modeCmsMessage = isVirtual
    ? branding?.teleconsultMessage?.trim() ||
      "Please ensure you are in a quiet, well-lit environment with a stable internet connection. Your encrypted consultation video room link will automatically become accessible 30 minutes before the scheduled appointment time."
    : branding?.clinicVisitMessage?.trim() ||
      "Please arrive at the clinic at least 15 minutes before your scheduled appointment time. Bring a valid government-issued photo ID and any relevant previous medical records, diagnostic tests, or doctor referrals.";

  const generalCmsMessage = branding?.bookingConfirmationMessage?.trim() ||
    "Appointments are scheduled according to clinical provider availability. If you need to reschedule or cancel, please submit changes at least 2 hours in advance.";

  return (
    <div
      className="booking-modal-overlay"
      onClick={() => {
        if (!busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-confirmation-modal-title"
    >
      <div
        className="booking-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="booking-modal-header">
          <div className="booking-modal-badge" data-mode={mode}>
            {isVirtual ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m22 8-6 4 6 4V8Z" />
                  <rect width="14" height="12" x="2" y="6" rx="2" />
                </svg>
                <span>Virtual Tele-Consultation</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
                <span>In-Person Clinic Visit</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="booking-modal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation dialog"
          >
            ✕
          </button>
        </div>

        <div className="booking-modal-content">
          <h3 id="booking-confirmation-modal-title" className="booking-modal-title">
            Confirm your {isVirtual ? "Tele-Consultation" : "Clinic Visit"}
          </h3>
          <p className="booking-modal-subtitle">
            Please review your appointment summary and clinic guidelines before confirming.
          </p>

          {/* Appointment Details Box */}
          <div className="booking-summary-card">
            <div className="booking-summary-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="booking-summary-icon" aria-hidden="true">
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              <div>
                <span className="booking-summary-label">Date</span>
                <strong>{formatFullDate(slot.start_at)}</strong>
              </div>
            </div>

            <div className="booking-summary-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="booking-summary-icon" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div>
                <span className="booking-summary-label">Time & Service</span>
                <strong>
                  {formatTime(slot.start_at)} • {serviceName}
                </strong>
              </div>
            </div>

            <div className="booking-summary-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="booking-summary-icon" aria-hidden="true">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <div>
                <span className="booking-summary-label">Location / Provider</span>
                <strong>{clinicDisplayName}</strong>
              </div>
            </div>
          </div>

          {/* Admin CMS Notice Section */}
          <div className="booking-cms-card">
            <div className="booking-cms-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="booking-cms-icon" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <strong>Clinic Instructions & Confirmation Notice</strong>
            </div>
            <p className="booking-cms-text">{modeCmsMessage}</p>
            {generalCmsMessage ? (
              <p className="booking-cms-secondary-text">
                <small>{generalCmsMessage}</small>
              </p>
            ) : null}
          </div>
        </div>

        <div className="booking-modal-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Booking Appointment…" : isVirtual ? "Confirm Tele-Consultation" : "Confirm Clinic Visit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
