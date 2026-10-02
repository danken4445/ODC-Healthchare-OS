"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MoreVertical,
  Radio,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import type { AppointmentQueueItem } from "@odyssey/types";
import type { VesperPatientRecord } from "../../hooks/use-vesper-dashboard-data";

interface VesperPatientRecordsProps {
  patients: VesperPatientRecord[];
  appointments?: AppointmentQueueItem[];
  onSelectPatient: (patient: VesperPatientRecord) => void;
  onRefresh?: () => void;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "PT"
  );
}

export function VesperPatientRecords({
  patients,
  appointments = [],
  onSelectPatient,
  onRefresh,
}: VesperPatientRecordsProps) {
  const [activeTab, setActiveTab] = useState<"records" | "appointments">(
    "records",
  );
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="vesper-card">
      <div className="vesper-card__header">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 className="vesper-card__title">
              {activeTab === "records"
                ? "Patient Records"
                : "Today's Appointments"}
            </h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                padding: "2px 8px",
                borderRadius: "9999px",
                border: "1px solid rgba(16, 185, 129, 0.25)",
              }}
              title="Real-time live sync active"
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  boxShadow: "0 0 6px #10b981",
                }}
              />
              Live
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("records")}
              style={{
                background: "none",
                border: "none",
                padding: "3px 8px",
                fontSize: "0.8rem",
                fontWeight: activeTab === "records" ? 600 : 400,
                color:
                  activeTab === "records"
                    ? "var(--color-primary, #0284c7)"
                    : "#64748b",
                borderBottom:
                  activeTab === "records"
                    ? "2px solid var(--color-primary, #0284c7)"
                    : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              Patients ({patients.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("appointments")}
              style={{
                background: "none",
                border: "none",
                padding: "3px 8px",
                fontSize: "0.8rem",
                fontWeight: activeTab === "appointments" ? 600 : 400,
                color:
                  activeTab === "appointments"
                    ? "var(--color-primary, #0284c7)"
                    : "#64748b",
                borderBottom:
                  activeTab === "appointments"
                    ? "2px solid var(--color-primary, #0284c7)"
                    : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              Appointments ({appointments.length})
            </button>
          </div>
        </div>
        <div className="vesper-card__actions">
          <button
            className="vesper-icon-btn"
            type="button"
            aria-label="Patient records menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="vesper-dropdown-menu">
              <button
                type="button"
                className="vesper-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRefresh?.();
                }}
              >
                Refresh now
              </button>
              <Link
                href="/patients"
                className="vesper-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                View all patients
              </Link>
              <Link
                href="/appointments"
                className="vesper-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                View all appointments
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="vesper-table-container">
        {activeTab === "records" ? (
          <table className="vesper-table">
            <thead>
              <tr>
                <th style={{ width: "42%" }}>Full Name</th>
                <th style={{ width: "18%" }}>Age</th>
                <th style={{ width: "18%" }}>Bed/Slot</th>
                <th style={{ width: "22%" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {patients.length > 0 ? (
                patients.map((patient) => {
                  const alertClass =
                    patient.alertsCount >= 5
                      ? "vesper-alert-pill--high"
                      : patient.alertsCount >= 3
                        ? "vesper-alert-pill--medium"
                        : patient.alertsCount >= 2
                          ? "vesper-alert-pill--amber"
                          : "vesper-alert-pill--low";

                  return (
                    <tr
                      key={patient.id}
                      onClick={() => onSelectPatient(patient)}
                      className="vesper-table-row--interactive"
                    >
                      <td>
                        <div className="vesper-patient-cell">
                          <div className="vesper-avatar-chip">
                            {patient.initials}
                          </div>
                          <span className="vesper-patient-name">
                            {patient.fullName}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="vesper-age-gender">
                          {patient.age}{" "}
                          <span
                            className={
                              patient.gender === "female"
                                ? "vesper-gender-female"
                                : "vesper-gender-male"
                            }
                          >
                            {patient.gender === "female" ? "♀" : "♂"}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="vesper-bed-number">
                          {patient.bedOrQueue}
                        </span>
                      </td>
                      <td>
                        <span className={`vesper-alert-pill ${alertClass}`}>
                          {patient.alertsCount} alert
                          {patient.alertsCount === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="vesper-table-empty">
                    No patient records available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="vesper-table">
            <thead>
              <tr>
                <th style={{ width: "38%" }}>Patient</th>
                <th style={{ width: "22%" }}>Time</th>
                <th style={{ width: "22%" }}>Service</th>
                <th style={{ width: "18%" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length > 0 ? (
                appointments.map((appt) => {
                  const initials = getInitials(appt.patientName || "PT");
                  const isVirtual = appt.delivery_mode === "virtual";
                  const isBooked = appt.status === "booked";
                  const isArrived = appt.status === "arrived";
                  const isFulfilled = appt.status === "fulfilled";

                  const pillClass = isFulfilled
                    ? "vesper-alert-pill--low"
                    : isArrived
                      ? "vesper-alert-pill--high"
                      : isBooked
                        ? "vesper-alert-pill--amber"
                        : "vesper-alert-pill--low";

                  return (
                    <tr key={appt.id} className="vesper-table-row--interactive">
                      <td>
                        <div className="vesper-patient-cell">
                          <div className="vesper-avatar-chip">{initials}</div>
                          <div>
                            <span className="vesper-patient-name">
                              {appt.patientName || "Patient"}
                            </span>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.75rem",
                                color: "#64748b",
                              }}
                            >
                              {isVirtual ? (
                                <Video
                                  size={11}
                                  aria-hidden="true"
                                  style={{ color: "#0284c7" }}
                                />
                              ) : (
                                <Stethoscope
                                  size={11}
                                  aria-hidden="true"
                                  style={{ color: "#10b981" }}
                                />
                              )}
                              <span>
                                {isVirtual ? "Teleconsult" : "In Person"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="vesper-date-text">
                          {formatTime(appt.start_at)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.82rem", color: "#334155" }}>
                          {appt.service_type || "General Consultation"}
                        </span>
                      </td>
                      <td>
                        <span className={`vesper-alert-pill ${pillClass}`}>
                          {appt.status
                            ? appt.status.charAt(0).toUpperCase() +
                              appt.status.slice(1)
                            : "Booked"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="vesper-table-empty">
                    No scheduled appointments for today
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
