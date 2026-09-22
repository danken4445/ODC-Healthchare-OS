"use client";

import type { AppointmentSummary } from "@odyssey/types";
import { AppointmentStatusBadge, Button, DataTable } from "@odyssey/ui";
import Link from "next/link";
import { useState, useMemo } from "react";

function formatAppointmentTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

interface PatientBookingsViewProps {
  appointments: AppointmentSummary[];
  liveStatus: string;
}

export function PatientBookingsView({
  appointments,
  liveStatus: _liveStatus,
}: PatientBookingsViewProps) {
  const [filter, setFilter] = useState<"all" | "virtual" | "in_person" | "active" | "done">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const total = appointments.length;

  const isVirtual = (appt: AppointmentSummary) =>
    appt.delivery_mode === "virtual" ||
    (appt.service_type?.toLowerCase().includes("virtual") ?? false);

  const isActive = (appt: AppointmentSummary) =>
    appt.status === "booked" ||
    appt.status === "arrived" ||
    appt.status === "pending" ||
    appt.status === "proposed";

  const isDone = (appt: AppointmentSummary) =>
    appt.status === "fulfilled" ||
    appt.status === "cancelled" ||
    appt.status === "noshow";

  const virtualBookings = appointments.filter(isVirtual);
  const inPersonBookings = appointments.filter((a) => !isVirtual(a));
  const activeBookings = appointments.filter(isActive);
  const doneBookings = appointments.filter(isDone);
  const activeVirtualAppts = appointments.filter(
    (a) => isVirtual(a) && (a.status === "booked" || a.status === "arrived"),
  );

  const filteredAppointments = useMemo(() => {
    if (filter === "virtual") return virtualBookings;
    if (filter === "in_person") return inPersonBookings;
    if (filter === "active") return activeBookings;
    if (filter === "done") return doneBookings;
    return appointments;
  }, [appointments, filter, virtualBookings, inPersonBookings, activeBookings, doneBookings]);

  return (
    <div className="bookings-studio-container">
      {/* Active Ongoing Virtual Consultation Banner (Prominent on Mobile) */}
      {activeVirtualAppts.length > 0 && (
        <div
          className="active-virtual-banner"
          role="region"
          aria-label="Active Ongoing Virtual Appointment Alert"
        >
          <div className="active-virtual-banner__header">
            <span className="active-virtual-banner__badge">
              <span className="live-call-pulse-dot" />
              Live Consultation Ready
            </span>
            <span className="active-virtual-banner__subtext">
              Dr. is waiting in the encrypted room
            </span>
          </div>

          {activeVirtualAppts.map((appt) => (
            <div key={appt.id} className="active-virtual-banner__body">
              <div className="active-virtual-banner__content">
                <h3 className="active-virtual-banner__title">
                  {appt.service_type ?? "Virtual Doctor Consultation"}
                </h3>
                <p className="active-virtual-banner__time">
                  🗓️ Scheduled: <strong>{formatAppointmentTime(appt.start_at)}</strong>
                </p>
                <div className="active-virtual-banner__features">
                  <span>🔒 End-to-End Encrypted</span>
                  <span>⚡ WebRTC HD Media</span>
                  <span>📱 Mobile Optimized</span>
                </div>
              </div>

              <div className="active-virtual-banner__cta-container">
                <Link href={`/teleconsult/${appt.id}`} className="active-virtual-banner__cta-link">
                  <Button
                    size="default"
                    className="active-virtual-banner__cta-btn"
                  >
                    <span>📹 Join Video Call Now</span>
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics Ribbon (Responsive 2x2 grid on mobile) */}
      <div className="bookings-metrics-ribbon">
        <div className="booking-metric-card">
          <span className="booking-metric-card__label">Total Visits</span>
          <span className="booking-metric-card__value" style={{ color: "var(--odyssey-foreground)" }}>
            {total}
          </span>
          <span className="booking-metric-card__hint">
            Lifetime visits
          </span>
        </div>

        <div className="booking-metric-card">
          <span className="booking-metric-card__label">🟢 Upcoming</span>
          <span className="booking-metric-card__value" style={{ color: "var(--odyssey-emerald)" }}>
            {activeBookings.length}
          </span>
          <span className="booking-metric-card__hint" style={{ color: "var(--odyssey-emerald-text)" }}>
            Active appointments
          </span>
        </div>

        <div className="booking-metric-card">
          <span className="booking-metric-card__label">📹 Teleconsults</span>
          <span className="booking-metric-card__value" style={{ color: "var(--odyssey-indigo)" }}>
            {virtualBookings.length}
          </span>
          <span className="booking-metric-card__hint" style={{ color: "var(--odyssey-indigo-text)" }}>
            Virtual video rooms
          </span>
        </div>

        <div className="booking-metric-card">
          <span className="booking-metric-card__label">✅ Completed</span>
          <span className="booking-metric-card__value" style={{ color: "var(--odyssey-slate-blocked)" }}>
            {doneBookings.length}
          </span>
          <span className="booking-metric-card__hint">
            Past visits
          </span>
        </div>
      </div>

      {/* Filter Bar with Horizontal Scroll for Mobile */}
      <div className="bookings-filter-bar">
        <div className="filter-pills-scrollable">
          <button
            type="button"
            className={`filter-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({total})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "virtual" ? "active" : ""}`}
            onClick={() => setFilter("virtual")}
          >
            📹 Teleconsults ({virtualBookings.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "in_person" ? "active" : ""}`}
            onClick={() => setFilter("in_person")}
          >
            🏥 In-Person ({inPersonBookings.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            🟢 Active ({activeBookings.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "done" ? "active" : ""}`}
            onClick={() => setFilter("done")}
          >
            ✅ Past ({doneBookings.length})
          </button>
        </div>

        {/* View Mode (Cards / Table) on Desktop */}
        <div className="bookings-viewmode-toggle">
          <span style={{ fontSize: "0.8rem", color: "var(--odyssey-muted-foreground)", fontWeight: 600 }}>
            Layout:
          </span>
          <div className="viewmode-pill-group">
            <button
              type="button"
              className={`viewmode-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={`viewmode-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Visual Mobile-First Cards View */}
      {viewMode === "cards" && (
        <>
          {filteredAppointments.length === 0 ? (
            <div className="empty-appointments-box">
              <p className="empty-appointments-title">
                No appointments found
              </p>
              <p className="hint">
                Switch filters or book a new appointment using the &quot;Book&quot; tab.
              </p>
            </div>
          ) : (
            <div className="booking-cards-grid">
              {filteredAppointments.map((appt) => {
                const virtual = isVirtual(appt);
                const active = isActive(appt);

                return (
                  <article
                    key={appt.id}
                    className={`booking-card ${virtual ? "booking-card--virtual" : "booking-card--in-person"}`}
                  >
                    <div>
                      <div className="booking-card__top">
                        <span
                          className={`delivery-badge ${virtual ? "delivery-badge--virtual" : "delivery-badge--in-person"}`}
                        >
                          {virtual ? "📹 Teleconsultation" : "🏥 In-Person Clinic"}
                        </span>
                        <AppointmentStatusBadge status={appt.status} />
                      </div>

                      <div className="booking-card__details">
                        <h4 className="booking-card__service-name">
                          {appt.service_type ?? "General Consultation"}
                        </h4>
                        <p className="booking-card__time">
                          🗓️ {formatAppointmentTime(appt.start_at)}
                        </p>
                      </div>

                      {/* In-Person Queue ticket if applicable */}
                      {!virtual && appt.queue_number && (
                        <div className="booking-card__queue-row">
                          <span className="queue-badge">
                            A-{String(appt.queue_number).padStart(3, "0")}
                          </span>
                          <span className="queue-label">
                            Front-desk queue ticket
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Teleconsult Action Box for Virtual Bookings */}
                    {virtual && (
                      <div className="teleconsult-cta-box">
                        <div className="teleconsult-cta-header">
                          <span className="teleconsult-cta-status">
                            {active ? "📹 Virtual Video Room" : "✅ Teleconsult Concluded"}
                          </span>
                          <span className="teleconsult-cta-tag">
                            {active ? "Active" : "Archived"}
                          </span>
                        </div>
                        <p className="teleconsult-cta-desc">
                          {active
                            ? "Encrypted HD video consultation. Join with one tap."
                            : "Encounter notes and prescription archived in Health Records."}
                        </p>
                        <div className="teleconsult-cta-btn-wrap">
                          <Link href={`/teleconsult/${appt.id}`} style={{ textDecoration: "none", width: "100%" }}>
                            <Button
                              size="default"
                              variant={active ? "default" : "outline"}
                              className="teleconsult-card-btn"
                            >
                              {active ? "📹 Enter Teleconsult Room" : "View Consultation"}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Classic Table View (Retained for wide screens and automated tests) */}
      <div style={{ display: viewMode === "table" ? "block" : "none" }}>
        <DataTable
          caption="Appointments visible at the selected clinic only."
          data={filteredAppointments}
          emptyMessage="No appointments booked yet."
          getRowId={(appointment) => appointment.id}
          columns={[
            {
              id: "queue",
              header: "Queue",
              cell: (appointment) =>
                !isVirtual(appointment) && appointment.queue_number
                  ? `A-${String(appointment.queue_number).padStart(3, "0")}`
                  : "—",
            },
            {
              id: "time",
              header: "Date and time",
              cell: (appointment) =>
                formatAppointmentTime(appointment.start_at),
            },
            {
              id: "service",
              header: "Service",
              cell: (appointment) =>
                appointment.service_type ?? "Consultation",
            },
            {
              id: "type",
              header: "Type",
              cell: (appointment) =>
                isVirtual(appointment) ? (
                  <span style={{ color: "var(--odyssey-indigo)", fontWeight: 600, fontSize: "0.85rem" }}>
                    📹 Virtual
                  </span>
                ) : (
                  <span style={{ color: "var(--odyssey-primary)", fontWeight: 600, fontSize: "0.85rem" }}>
                    🏥 In-Person
                  </span>
                ),
            },
            {
              id: "status",
              header: "Status",
              cell: (appointment) => (
                <AppointmentStatusBadge status={appointment.status} />
              ),
            },
            {
              id: "action",
              header: "",
              cell: (appointment) =>
                isVirtual(appointment) ? (
                  <Link href={`/teleconsult/${appointment.id}`}>
                    <Button size="sm">Open teleconsult</Button>
                  </Link>
                ) : null,
            },
          ]}
        />
      </div>
    </div>
  );
}
