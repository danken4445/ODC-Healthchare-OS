"use client";

import { Button } from "@odyssey/ui";

export type PatientTab = "all" | "book" | "bookings" | "records" | "billing" | "profile";

export interface PatientHeaderProps {
  signedInAs?: string | null;
  patientName?: string | null;
  displayName?: string | null;
  selectedClinicName?: string | null;
  liveStatus: string;
  activeTab: PatientTab;
  onSelectTab: (tab: PatientTab) => void;
  bookingCount?: number;
  bookingsCount?: number;
  virtualBookingCount?: number;
  virtualCount?: number;
  invoicesCount?: number;
  hasActiveVirtual?: boolean;
  onSignOut: () => void;
}

export function PatientHeader({
  signedInAs,
  patientName,
  displayName,
  selectedClinicName,
  liveStatus,
  activeTab,
  onSelectTab,
  bookingCount,
  bookingsCount,
  virtualBookingCount,
  virtualCount,
  invoicesCount = 0,
  hasActiveVirtual,
  onSignOut,
}: PatientHeaderProps) {
  const isOnline = liveStatus === "Live" || liveStatus === "Listening for updates";
  const nameToDisplay = patientName || displayName || signedInAs;
  const totalBookings = bookingCount ?? bookingsCount ?? 0;
  const totalVirtual = virtualBookingCount ?? virtualCount ?? 0;

  return (
    <>
      <header className="patient-header">
        <div className="patient-header-bar">
          <div className="patient-title-group">
            <div className="patient-brand-tag">
              <span className="eyebrow" style={{ letterSpacing: "0.08em", margin: 0 }}>
                Odyssey Healthcare OS
              </span>
              <span
                className={`live-pulse-badge ${isOnline ? "" : "offline"}`}
                title={`Realtime connection: ${liveStatus}`}
              >
                <span className={`pulse-dot ${isOnline ? "" : "offline"}`} />
                <span className="live-indicator-text">{liveStatus}</span>
              </span>
            </div>

            <div className="patient-heading-row">
              <h1 className="patient-portal-title">
                {selectedClinicName ? `${selectedClinicName}` : "Patient Care Portal"}
              </h1>
            </div>

            {nameToDisplay && (
              <div className="patient-meta-row">
                <span className="patient-greeting">
                  Hello, <strong>{nameToDisplay}</strong>
                </span>
                {selectedClinicName && (
                  <span className="patient-clinic-chip">
                    🏥 {selectedClinicName}
                  </span>
                )}
              </div>
            )}
          </div>

          <nav className="session-actions">
            <Button size="sm" variant="ghost" onClick={onSignOut} className="patient-signout-btn">
              <span>Sign out</span>
            </Button>
          </nav>
        </div>

        {/* Desktop Navigation Tabs (Hidden on mobile) */}
        <div
          className="patient-nav-tabs patient-nav-tabs-desktop"
          role="tablist"
          aria-label="Patient Portal Navigation Tabs"
        >
          <button
            role="tab"
            aria-selected={activeTab === "all"}
            className={`patient-nav-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => onSelectTab("all")}
            type="button"
          >
            <span>🌟 Overview (All)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "bookings"}
            className={`patient-nav-tab ${activeTab === "bookings" ? "active" : ""}`}
            onClick={() => onSelectTab("bookings")}
            type="button"
          >
            <span>📋 My Bookings</span>
            {hasActiveVirtual && (
              <span className="nav-virtual-pulse">
                <span className="virtual-dot" />
                LIVE
              </span>
            )}
            {totalBookings > 0 && !hasActiveVirtual && (
              <span
                className="tab-badge"
                style={{
                  background: totalVirtual > 0 ? "var(--odyssey-indigo)" : "var(--odyssey-emerald)",
                  color: "#ffffff",
                }}
              >
                {totalBookings}
              </span>
            )}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "book"}
            className={`patient-nav-tab ${activeTab === "book" ? "active" : ""}`}
            onClick={() => onSelectTab("book")}
            type="button"
          >
            <span>📅 Book Appointment</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "records"}
            className={`patient-nav-tab ${activeTab === "records" ? "active" : ""}`}
            onClick={() => onSelectTab("records")}
            type="button"
          >
            <span>📑 Health Records</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "billing"}
            className={`patient-nav-tab ${activeTab === "billing" ? "active" : ""}`}
            onClick={() => onSelectTab("billing")}
            type="button"
          >
            <span>💳 Bills &amp; Invoices</span>
            {invoicesCount > 0 && <span className="tab-badge">{invoicesCount}</span>}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "profile"}
            className={`patient-nav-tab ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => onSelectTab("profile")}
            type="button"
          >
            <span>👤 My Profile</span>
          </button>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar (WCAG compliant, thumb-zone ergonomics) */}
      <nav
        className="mobile-bottom-nav"
        role="navigation"
        aria-label="Mobile Navigation Menu"
      >
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "all" ? "active" : ""}`}
          onClick={() => onSelectTab("all")}
          aria-label="Overview"
          aria-current={activeTab === "all" ? "page" : undefined}
        >
          <span className="mobile-nav-icon">🌟</span>
          <span className="mobile-nav-label">Home</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "bookings" ? "active" : ""}`}
          onClick={() => onSelectTab("bookings")}
          aria-label="My Bookings"
          aria-current={activeTab === "bookings" ? "page" : undefined}
        >
          <div className="mobile-nav-icon-container">
            <span className="mobile-nav-icon">📋</span>
            {hasActiveVirtual ? (
              <span className="mobile-nav-live-dot" title="Active live teleconsultation" />
            ) : totalBookings > 0 ? (
              <span className="mobile-nav-badge">{totalBookings}</span>
            ) : null}
          </div>
          <span className="mobile-nav-label">Bookings</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item mobile-nav-item--book ${activeTab === "book" ? "active" : ""}`}
          onClick={() => onSelectTab("book")}
          aria-label="Book new appointment"
          aria-current={activeTab === "book" ? "page" : undefined}
        >
          <div className="mobile-nav-highlight-circle">
            <span className="mobile-nav-icon">📅</span>
          </div>
          <span className="mobile-nav-label">Book</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "records" ? "active" : ""}`}
          onClick={() => onSelectTab("records")}
          aria-label="Health Records"
          aria-current={activeTab === "records" ? "page" : undefined}
        >
          <span className="mobile-nav-icon">📑</span>
          <span className="mobile-nav-label">Records</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "billing" || activeTab === "profile" ? "active" : ""}`}
          onClick={() => onSelectTab(activeTab === "billing" ? "profile" : "billing")}
          aria-label="Bills and Profile"
          aria-current={activeTab === "profile" || activeTab === "billing" ? "page" : undefined}
        >
          <div className="mobile-nav-icon-container">
            <span className="mobile-nav-icon">{activeTab === "billing" ? "💳" : "👤"}</span>
            {invoicesCount > 0 && <span className="mobile-nav-badge">{invoicesCount}</span>}
          </div>
          <span className="mobile-nav-label">{activeTab === "billing" ? "Bills" : "Profile"}</span>
        </button>
      </nav>
    </>
  );
}
