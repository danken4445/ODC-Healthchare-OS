"use client";

import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  HandCoins,
  MoreVertical,
  Plus,
  Share2,
  Stethoscope,
  User,
  UserCheck,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import type {
  AppointmentQueueItem,
  DiagnosticsWorkspace,
  OrganizationClinicalRecords,
} from "@odyssey/types";
import type { WorkspaceTab } from "./WorkspaceHeader";

interface DoctorOverviewProps {
  doctorName: string;
  department: string | null;
  queue: AppointmentQueueItem[];
  diagnostics: DiagnosticsWorkspace | null;
  clinicalRecords: OrganizationClinicalRecords | null;
  activeEncounterId: string | null;
  onStartConsultation: (appointment: AppointmentQueueItem) => void;
  onOpenTriage: (appointment: AppointmentQueueItem) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
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

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "Not scheduled";
  return dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function DoctorOverview({
  doctorName,
  department,
  queue,
  diagnostics,
  clinicalRecords,
  activeEncounterId,
  onStartConsultation,
  onOpenTriage,
  onNavigateTab,
}: DoctorOverviewProps) {
  // Metrics computation for Doctor's Stat Cards
  const todayQueueCount = queue.length;
  const waitingCount = queue.filter(
    (a) =>
      a.status !== "fulfilled" &&
      a.status !== "cancelled" &&
      a.encounterStatus !== "finished"
  ).length;
  const activeConsultCount = activeEncounterId ? 1 : 0;
  const pendingDiagnosticsCount =
    diagnostics?.serviceRequests.filter(
      (sr) => sr.status === "active" || sr.status === "draft"
    ).length ?? 0;

  // Next up in queue: non-fulfilled appointments
  const upNextQueue = queue
    .filter((a) => a.status !== "fulfilled" && a.status !== "cancelled")
    .slice(0, 6);

  // Diagnostic tests
  const diagnosticTests = diagnostics?.serviceRequests.slice(0, 6) ?? [];

  // Recent encounters from clinical records
  const recentEncounters = clinicalRecords?.encounters.slice(0, 6) ?? [];

  return (
    <div className="vesper-dashboard-content" style={{ marginTop: "20px" }}>
      {/* 4 Doctor Stat Cards Row */}
      <section className="vesper-kpi-grid">
        {/* Card 1: Today's Queue */}
        <div className="vesper-stat-card">
          <div className="vesper-stat-card__top">
            <span className="vesper-stat-card__label">Today&apos;s Queue</span>
            <div className="vesper-stat-card__icon-badge">
              <Users size={16} />
            </div>
          </div>
          <div className="vesper-stat-card__bottom">
            <div className="vesper-stat-card__value-group">
              <span className="vesper-stat-card__value">{todayQueueCount}</span>
              <span className="vesper-stat-card__unit">patients</span>
            </div>
            <div className="vesper-stat-card__delta-group">
              <span className="vesper-stat-card__delta-pill vesper-stat-card__delta-pill--positive">
                Daily list
              </span>
              <span className="vesper-stat-card__delta-context">Scheduled</span>
            </div>
          </div>
        </div>

        {/* Card 2: Waiting for Doctor */}
        <div className="vesper-stat-card">
          <div className="vesper-stat-card__top">
            <span className="vesper-stat-card__label">Waiting in Queue</span>
            <div className="vesper-stat-card__icon-badge">
              <Clock size={16} />
            </div>
          </div>
          <div className="vesper-stat-card__bottom">
            <div className="vesper-stat-card__value-group">
              <span className="vesper-stat-card__value">{waitingCount}</span>
              <span className="vesper-stat-card__unit">waiting</span>
            </div>
            <div className="vesper-stat-card__delta-group">
              <span className="vesper-stat-card__delta-pill vesper-stat-card__delta-pill--positive">
                Ready for consult
              </span>
              <span className="vesper-stat-card__delta-context">Triage queue</span>
            </div>
          </div>
        </div>

        {/* Card 3: Active Consultation */}
        <div className="vesper-stat-card">
          <div className="vesper-stat-card__top">
            <span className="vesper-stat-card__label">In Consultation</span>
            <div className="vesper-stat-card__icon-badge">
              <UserCheck size={16} />
            </div>
          </div>
          <div className="vesper-stat-card__bottom">
            <div className="vesper-stat-card__value-group">
              <span className="vesper-stat-card__value">{activeConsultCount}</span>
              <span className="vesper-stat-card__unit">active</span>
            </div>
            <div className="vesper-stat-card__delta-group">
              <span
                className={`vesper-stat-card__delta-pill ${
                  activeConsultCount > 0
                    ? "vesper-stat-card__delta-pill--positive"
                    : "vesper-stat-card__delta-pill--neutral"
                }`}
              >
                {activeConsultCount > 0 ? "In Room" : "Room open"}
              </span>
              <span className="vesper-stat-card__delta-context">
                {activeConsultCount > 0 ? "Chart active" : "Ready for next"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Pending Diagnostics */}
        <div className="vesper-stat-card">
          <div className="vesper-stat-card__top">
            <span className="vesper-stat-card__label">Pending Diagnostics</span>
            <div className="vesper-stat-card__icon-badge">
              <FlaskConical size={16} />
            </div>
          </div>
          <div className="vesper-stat-card__bottom">
            <div className="vesper-stat-card__value-group">
              <span className="vesper-stat-card__value">{pendingDiagnosticsCount}</span>
              <span className="vesper-stat-card__unit">orders</span>
            </div>
            <div className="vesper-stat-card__delta-group">
              <span className="vesper-stat-card__delta-pill vesper-stat-card__delta-pill--positive">
                Lab & Imaging
              </span>
              <span className="vesper-stat-card__delta-context">Awaiting report</span>
            </div>
          </div>
        </div>
      </section>

      {/* Row 1: Up Next in Queue & Diagnostic Test Status */}
      <section className="vesper-widget-row">
        {/* Widget 1: Up Next in Queue */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Up Next in Queue</h2>
              <p className="vesper-card__subtitle">
                Patients waiting for triage or outpatient consultation
              </p>
            </div>
            <button
              type="button"
              className="vesper-action-link"
              onClick={() => onNavigateTab("queue")}
            >
              See all queue
            </button>
          </div>

          <div className="vesper-table-container">
            <table className="vesper-table">
              <thead>
                <tr>
                  <th style={{ width: "36%" }}>Patient</th>
                  <th style={{ width: "22%" }}>Time</th>
                  <th style={{ width: "22%" }}>Status</th>
                  <th style={{ width: "20%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {upNextQueue.length > 0 ? (
                  upNextQueue.map((item) => {
                    const initials = getInitials(item.patientName || "PT");
                    const isInProgress = item.encounterStatus === "in_progress";

                    return (
                      <tr key={item.id} className="vesper-table-row--interactive">
                        <td>
                          <div className="vesper-patient-cell">
                            <div className="vesper-avatar-chip">{initials}</div>
                            <div>
                              <span className="vesper-patient-name">
                                {item.patientName || "Unnamed Patient"}
                              </span>
                              <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                                {item.service_type || "General Consultation"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="vesper-date-text">
                            {formatTime(item.start_at)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`vesper-alert-pill ${
                              isInProgress
                                ? "vesper-alert-pill--high"
                                : item.triageStatus === "complete"
                                ? "vesper-alert-pill--low"
                                : "vesper-alert-pill--amber"
                            }`}
                          >
                            {isInProgress
                              ? "In Consult"
                              : item.triageStatus === "complete"
                              ? "Triage Done"
                              : "Waiting"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="vesper-action-link"
                            onClick={() => onStartConsultation(item)}
                          >
                            {isInProgress ? "Resume" : "Start Consult"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="vesper-table-empty">
                      No patients currently waiting in queue today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Widget 2: Diagnostic Test Status */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Diagnostic Test Status</h2>
              <p className="vesper-card__subtitle">
                Recent lab and imaging orders for clinic patients
              </p>
            </div>
            <button
              type="button"
              className="vesper-action-link"
              onClick={() => onNavigateTab("diagnostics")}
            >
              Diagnostics Hub
            </button>
          </div>

          <div className="vesper-table-container">
            <table className="vesper-table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Test / Order</th>
                  <th style={{ width: "25%" }}>Date</th>
                  <th style={{ width: "30%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {diagnosticTests.length > 0 ? (
                  diagnosticTests.map((sr) => {
                    const statusClass =
                      sr.status === "completed"
                        ? "vesper-alert-pill--low"
                        : sr.status === "active"
                        ? "vesper-alert-pill--amber"
                        : "vesper-alert-pill--low";

                    return (
                      <tr key={sr.id}>
                        <td>
                          <div className="vesper-test-cell">
                            <span className="vesper-shape-indicator vesper-shape-circle vesper-color-teal" />
                            <div>
                              <strong className="vesper-test-name">
                                {sr.code_display || "Laboratory Order"}
                              </strong>
                              <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                                Category: {sr.category || "Laboratory"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="vesper-date-text">
                            {formatDate(sr.created_at)}
                          </span>
                        </td>
                        <td>
                          <span className={`vesper-alert-pill ${statusClass}`}>
                            {sr.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="vesper-table-empty">
                      No diagnostic test records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Row 2: Recent Clinical Encounters & Clinical Shortcuts */}
      <section className="vesper-widget-row">
        {/* Widget 3: Recent Clinical Encounters */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Recent Clinical Encounters</h2>
              <p className="vesper-card__subtitle">
                Recently completed outpatient visits and notes
              </p>
            </div>
          </div>

          <div className="vesper-table-container">
            <table className="vesper-table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Patient / Chart</th>
                  <th style={{ width: "28%" }}>Encounter Date</th>
                  <th style={{ width: "30%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEncounters.length > 0 ? (
                  recentEncounters.map((enc) => {
                    const queuePatient = queue.find((q) => q.patient_id === enc.patient_id);
                    const patientName = queuePatient?.patientName || "Patient Record";
                    const initials = getInitials(patientName);

                    return (
                      <tr key={enc.id}>
                        <td>
                          <div className="vesper-patient-cell">
                            <div className="vesper-avatar-chip">{initials}</div>
                            <div>
                              <span className="vesper-patient-name">{patientName}</span>
                              <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                                {enc.service_type || "Outpatient Consultation"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="vesper-date-text">
                            {formatDate(enc.period_start)}
                          </span>
                        </td>
                        <td>
                          <span className="vesper-alert-pill vesper-alert-pill--low">
                            {enc.status === "finished" ? "Finalized" : enc.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="vesper-table-empty">
                      No recent clinical encounters available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Widget 4: Clinical Shortcuts & Tools */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Clinical Shortcuts</h2>
              <p className="vesper-card__subtitle">
                Quick actions and provider resources
              </p>
            </div>
          </div>

          <div style={{ padding: "4px 0" }}>
            <div className="vesper-contact-list">
              <Link href="/teleconsult" className="vesper-contact-item" style={{ textDecoration: "none" }}>
                <Video size={16} className="vesper-text-teal" />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "13px" }}>
                    Launch Video Teleconsultation
                  </strong>
                  <span style={{ color: "#64748B", fontSize: "12px" }}>
                    Open WebRTC peer video room for scheduled virtual visits
                  </span>
                </div>
                <ExternalLink size={14} style={{ color: "#94A3B8" }} />
              </Link>

              <Link href="/payouts" className="vesper-contact-item" style={{ textDecoration: "none" }}>
                <HandCoins size={16} className="vesper-text-emerald" />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "13px" }}>
                    Doctor Payouts & Entitlements
                  </strong>
                  <span style={{ color: "#64748B", fontSize: "12px" }}>
                    Review settled consultation fees and revenue share balances
                  </span>
                </div>
                <ExternalLink size={14} style={{ color: "#94A3B8" }} />
              </Link>

              <div
                className="vesper-contact-item"
                style={{ cursor: "pointer" }}
                onClick={() => onNavigateTab("queue")}
              >
                <Users size={16} className="vesper-text-blue" />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "13px" }}>
                    Live Patient Queue Board
                  </strong>
                  <span style={{ color: "#64748B", fontSize: "12px" }}>
                    Manage triage vital signs and consultation call sequence
                  </span>
                </div>
              </div>

              <div
                className="vesper-contact-item"
                style={{ cursor: "pointer" }}
                onClick={() => onNavigateTab("schedule")}
              >
                <CalendarDays size={16} className="vesper-text-amber" />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "13px" }}>
                    Weekly Availability Studio
                  </strong>
                  <span style={{ color: "#64748B", fontSize: "12px" }}>
                    Configure bookable clinic hours, duration, and teleconsult modes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
