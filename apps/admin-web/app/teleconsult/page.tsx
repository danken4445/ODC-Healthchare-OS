"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Lock,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";
import {
  subscribeToAppointmentQueue,
  updateAppointmentStatus,
} from "@odyssey/supabase-client";

interface TeleconsultAppointment {
  id: string;
  patientId: string;
  patientName: string;
  patientTelecom: string | null;
  patientGender: string | null;
  patientBirthDate: string | null;
  initials: string;
  appointmentTime: string;
  rawStartAt: string | null;
  serviceType: string;
  mode: string;
  status: string;
  queueNumber: string | null;
  practitionerName: string;
  description: string | null;
  patientInstruction: string | null;
}

function parsePatientName(pName: any): string {
  if (!pName) return "Unnamed Patient";
  if (typeof pName === "string") return pName;
  if (Array.isArray(pName) && pName[0]?.text) return pName[0].text;
  if (typeof pName === "object" && pName?.text) return pName.text;
  if (pName?.family || pName?.given) {
    const given = Array.isArray(pName.given)
      ? pName.given.join(" ")
      : (pName.given ?? "");
    return `${given} ${pName.family ?? ""}`.trim();
  }
  return "Patient";
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w: string) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "PT"
  );
}

function getPatientMeetingLink(appointmentId: string): string {
  if (typeof window === "undefined") return `/teleconsult/${appointmentId}`;
  const origin = window.location.origin;
  if (origin.includes(":3002")) {
    return `${origin.replace(":3002", ":3000")}/teleconsult/${appointmentId}`;
  }
  if (origin.includes("admin.")) {
    return `${origin.replace("admin.", "patient.")}/teleconsult/${appointmentId}`;
  }
  if (origin.includes("admin-web")) {
    return `${origin.replace("admin-web", "patient-web")}/teleconsult/${appointmentId}`;
  }
  return `${origin}/patient/teleconsult/${appointmentId}`;
}

function getDoctorMeetingLink(appointmentId: string): string {
  if (typeof window === "undefined") return `/teleconsult/${appointmentId}`;
  const origin = window.location.origin;
  if (origin.includes(":3002")) {
    return `${origin.replace(":3002", ":3001")}/teleconsult/${appointmentId}`;
  }
  if (origin.includes("admin.")) {
    return `${origin.replace("admin.", "provider.")}/teleconsult/${appointmentId}`;
  }
  if (origin.includes("admin-web")) {
    return `${origin.replace("admin-web", "provider-web")}/teleconsult/${appointmentId}`;
  }
  return `${origin}/provider/teleconsult/${appointmentId}`;
}

function getStatusPillClass(status: string): string {
  switch (status.toLowerCase()) {
    case "arrived":
      return "vesper-alert-pill--emerald";
    case "booked":
    case "scheduled":
      return "vesper-alert-pill--blue";
    case "fulfilled":
    case "completed":
      return "vesper-alert-pill--emerald";
    case "cancelled":
    case "noshow":
      return "vesper-alert-pill--slate";
    default:
      return "vesper-alert-pill--amber";
  }
}

function formatStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "arrived":
      return "In Waiting Room";
    case "booked":
      return "Scheduled";
    case "fulfilled":
      return "Completed";
    case "noshow":
      return "No Show";
    case "cancelled":
      return "Cancelled";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export default function TeleconsultPage() {
  const { client, organization } = useAdminData();
  const [teleconsults, setTeleconsults] = useState<TeleconsultAppointment[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "booked" | "arrived" | "fulfilled" | "cancelled"
  >("all");
  const [selectedConsult, setSelectedConsult] =
    useState<TeleconsultAppointment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "info" = "success") => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 3200);
    },
    [],
  );

  const copyToClipboard = useCallback(
    (text: string, label: string, targetId?: string) => {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (targetId) {
        setCopiedId(targetId);
        setTimeout(
          () => setCopiedId((curr) => (curr === targetId ? null : curr)),
          2500,
        );
      }
      showToast(`${label} copied to clipboard!`, "success");
    },
    [showToast],
  );

  const loadTeleconsults = useCallback(async () => {
    if (!organization) return;
    try {
      setLoading(true);

      // Attempt to load practitioner roles to associate clinician names
      const practitionerRoleMap = new Map<string, string>();
      try {
        const { data: rolesData } = await client
          .from("practitioner_roles")
          .select("id, practitioners(name)")
          .eq("organization_id", organization.id);
        if (rolesData) {
          for (const r of rolesData as any[]) {
            const pracRaw = Array.isArray(r.practitioners)
              ? r.practitioners[0]
              : r.practitioners;
            const pName = parsePatientName(pracRaw?.name);
            if (pName && pName !== "Patient") {
              practitionerRoleMap.set(r.id, `Dr. ${pName}`);
            }
          }
        }
      } catch {
        // Practitioner role map is supplementary; ignore if unpopulated
      }

      const { data, error } = await client
        .from("appointments")
        .select(
          `
          id,
          start_at,
          status,
          delivery_mode,
          service_type,
          queue_number,
          description,
          patient_instruction,
          practitioner_role_id,
          patients (
            id,
            name,
            gender,
            birth_date,
            telecom
          )
        `,
        )
        .eq("organization_id", organization.id)
        .order("start_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("Error fetching teleconsult appointments:", error);
        setTeleconsults([]);
        return;
      }

      const virtual = (data ?? []).filter((a: any) => {
        const mode = String(a.delivery_mode ?? "").toLowerCase();
        const service = String(a.service_type ?? "").toLowerCase();
        return (
          mode === "virtual" ||
          service.includes("tele") ||
          service.includes("virtual") ||
          service.includes("video")
        );
      });

      const mapped: TeleconsultAppointment[] = virtual.map((a: any) => {
        const patientRaw = Array.isArray(a.patients)
          ? a.patients[0]
          : a.patients;
        const patientName = parsePatientName(patientRaw?.name);
        const initials = getInitials(patientName);

        let appointmentTime = "Flexible / Pending";
        if (a.start_at) {
          const dt = new Date(a.start_at);
          if (!isNaN(dt.getTime())) {
            appointmentTime = dt.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
          }
        }

        const practitionerName =
          (a.practitioner_role_id &&
            practitionerRoleMap.get(a.practitioner_role_id)) ||
          "Clinic Medical Staff";

        let telecomStr: string | null = null;
        if (patientRaw?.telecom) {
          if (typeof patientRaw.telecom === "string")
            telecomStr = patientRaw.telecom;
          else if (
            Array.isArray(patientRaw.telecom) &&
            patientRaw.telecom[0]?.value
          ) {
            telecomStr = patientRaw.telecom[0].value;
          } else if (
            typeof patientRaw.telecom === "object" &&
            patientRaw.telecom.value
          ) {
            telecomStr = patientRaw.telecom.value;
          }
        }

        return {
          id: a.id,
          patientId: patientRaw?.id ?? a.id,
          patientName,
          patientTelecom: telecomStr,
          patientGender: patientRaw?.gender ?? null,
          patientBirthDate: patientRaw?.birth_date ?? null,
          initials,
          appointmentTime,
          rawStartAt: a.start_at ?? null,
          serviceType: a.service_type || "General Virtual Consultation",
          mode: "HD WebRTC",
          status: a.status ?? "scheduled",
          queueNumber: a.queue_number ?? null,
          practitionerName,
          description: a.description ?? null,
          patientInstruction: a.patient_instruction ?? null,
        };
      });

      setTeleconsults(mapped);
    } catch (err) {
      console.warn("Failed to load teleconsult appointments:", err);
      setTeleconsults([]);
    } finally {
      setLoading(false);
    }
  }, [client, organization]);

  useEffect(() => {
    if (!organization) return;
    void loadTeleconsults();
    const unsub = subscribeToAppointmentQueue(
      client,
      organization.id,
      () => void loadTeleconsults(),
    );
    return () => {
      unsub();
    };
  }, [client, organization, loadTeleconsults]);

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: "arrived" | "cancelled" | "noshow",
  ) => {
    setActionInProgress(appointmentId);
    try {
      const res = await updateAppointmentStatus(
        client,
        appointmentId,
        newStatus,
      );
      if (res.error) {
        showToast(`Failed to update status: ${res.error.message}`, "info");
      } else {
        setTeleconsults((prev) =>
          prev.map((item) =>
            item.id === appointmentId ? { ...item, status: newStatus } : item,
          ),
        );
        if (selectedConsult && selectedConsult.id === appointmentId) {
          setSelectedConsult((prev) =>
            prev ? { ...prev, status: newStatus } : null,
          );
        }
        showToast(
          newStatus === "arrived"
            ? "Patient checked in and marked ready in waiting room."
            : `Appointment marked as ${formatStatusLabel(newStatus)}.`,
          "success",
        );
      }
    } catch (err: any) {
      showToast(err?.message ?? "Error updating appointment status", "info");
    } finally {
      setActionInProgress(null);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const total = teleconsults.length;
    const booked = teleconsults.filter((t) =>
      ["booked", "scheduled", "proposed"].includes(t.status.toLowerCase()),
    ).length;
    const arrived = teleconsults.filter(
      (t) => t.status.toLowerCase() === "arrived",
    ).length;
    const fulfilled = teleconsults.filter((t) =>
      ["fulfilled", "completed"].includes(t.status.toLowerCase()),
    ).length;
    const cancelled = teleconsults.filter((t) =>
      ["cancelled", "noshow"].includes(t.status.toLowerCase()),
    ).length;
    return { total, booked, arrived, fulfilled, cancelled };
  }, [teleconsults]);

  // Filtered consultations
  const filteredTeleconsults = useMemo(() => {
    return teleconsults.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.serviceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.practitionerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.patientTelecom && t.patientTelecom.includes(searchQuery));

      if (!matchesSearch) return false;

      if (statusFilter === "booked") {
        return ["booked", "scheduled", "proposed"].includes(
          t.status.toLowerCase(),
        );
      }
      if (statusFilter === "arrived") {
        return t.status.toLowerCase() === "arrived";
      }
      if (statusFilter === "fulfilled") {
        return ["fulfilled", "completed"].includes(t.status.toLowerCase());
      }
      if (statusFilter === "cancelled") {
        return ["cancelled", "noshow"].includes(t.status.toLowerCase());
      }
      return true;
    });
  }, [teleconsults, searchQuery, statusFilter]);

  return (
    <div className="vesper-page-container">
      {/* Toast Notification */}
      {toast && (
        <div className="vesper-toast-container">
          <div className="vesper-toast">
            <CheckCircle2 size={16} className="vesper-text-emerald" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Teleconsultation</h1>
          <p className="vesper-header-subcopy">
            Virtual visit coordination, secure room dispatch, and patient
            check-in for {organization?.name ?? "Odyssey Clinic"}.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="vesper-btn-outline"
            onClick={() => void loadTeleconsults()}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
            Schedule
          </button>
          <Link href="/appointments" className="vesper-btn-primary">
            <Calendar size={14} /> Schedule Virtual Visit
          </Link>
        </div>
      </div>

      {/* KPI / Metric Chips Strip */}
      <div
        className="vesper-kpi-grid"
        style={{ marginTop: "20px", marginBottom: "20px" }}
      >
        <div className="vesper-kpi-card">
          <span className="vesper-kpi-card__label">Total Virtual Visits</span>
          <div className="vesper-kpi-card__value-group">
            <span className="vesper-kpi-card__value">{metrics.total}</span>
            <span className="vesper-kpi-card__pill vesper-kpi-card__pill--neutral">
              All Records
            </span>
          </div>
        </div>
        <div className="vesper-kpi-card">
          <span className="vesper-kpi-card__label">In Waiting Room</span>
          <div className="vesper-kpi-card__value-group">
            <span className="vesper-kpi-card__value vesper-text-emerald">
              {metrics.arrived}
            </span>
            <span className="vesper-kpi-card__pill vesper-kpi-card__pill--success">
              Ready for Doctor
            </span>
          </div>
        </div>
        <div className="vesper-kpi-card">
          <span className="vesper-kpi-card__label">Upcoming Scheduled</span>
          <div className="vesper-kpi-card__value-group">
            <span className="vesper-kpi-card__value">{metrics.booked}</span>
            <span className="vesper-kpi-card__pill vesper-kpi-card__pill--neutral">
              Awaiting Intake
            </span>
          </div>
        </div>
        <div className="vesper-kpi-card">
          <span className="vesper-kpi-card__label">Completed Sessions</span>
          <div className="vesper-kpi-card__value-group">
            <span className="vesper-kpi-card__value">{metrics.fulfilled}</span>
            <span className="vesper-kpi-card__pill vesper-kpi-card__pill--neutral">
              Fulfilled
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="vesper-widget-row--teleconsult">
        {/* Left Card: Video Visits Table */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Scheduled Video Visits</h2>
              <p className="vesper-card__subtitle">
                {filteredTeleconsults.length} consultation
                {filteredTeleconsults.length === 1 ? "" : "s"} visible
              </p>
            </div>
          </div>

          {/* Search Box */}
          <div className="vesper-search-box">
            <Search size={15} className="vesper-search-icon" />
            <input
              type="text"
              placeholder="Search by patient name, phone, or service..."
              className="vesper-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="vesper-filter-tabs">
            <button
              type="button"
              className={`vesper-filter-tab ${statusFilter === "all" ? "vesper-filter-tab--active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({metrics.total})
            </button>
            <button
              type="button"
              className={`vesper-filter-tab ${statusFilter === "arrived" ? "vesper-filter-tab--active" : ""}`}
              onClick={() => setStatusFilter("arrived")}
            >
              In Waiting Room ({metrics.arrived})
            </button>
            <button
              type="button"
              className={`vesper-filter-tab ${statusFilter === "booked" ? "vesper-filter-tab--active" : ""}`}
              onClick={() => setStatusFilter("booked")}
            >
              Scheduled ({metrics.booked})
            </button>
            <button
              type="button"
              className={`vesper-filter-tab ${statusFilter === "fulfilled" ? "vesper-filter-tab--active" : ""}`}
              onClick={() => setStatusFilter("fulfilled")}
            >
              Completed ({metrics.fulfilled})
            </button>
            <button
              type="button"
              className={`vesper-filter-tab ${statusFilter === "cancelled" ? "vesper-filter-tab--active" : ""}`}
              onClick={() => setStatusFilter("cancelled")}
            >
              Cancelled / No-Show ({metrics.cancelled})
            </button>
          </div>

          {/* Visits Table */}
          <div className="vesper-table-container">
            <table className="vesper-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Clinician</th>
                  <th>Appointment Time</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeleconsults.length > 0 ? (
                  filteredTeleconsults.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="vesper-patient-cell">
                          <div className="vesper-avatar-chip">{t.initials}</div>
                          <div>
                            <span className="vesper-patient-name">
                              {t.patientName}
                            </span>
                            {t.patientTelecom && (
                              <div
                                style={{ fontSize: "11px", color: "#64748b" }}
                              >
                                {t.patientTelecom}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "12.5px",
                            color: "#334155",
                          }}
                        >
                          <Stethoscope
                            size={13}
                            style={{ color: "#2563eb", flexShrink: 0 }}
                          />
                          <span>{t.practitionerName}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: "12.5px" }}>
                        {t.appointmentTime}
                      </td>
                      <td>
                        <span className="vesper-alert-pill vesper-alert-pill--low">
                          {t.mode}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`vesper-alert-pill ${getStatusPillClass(t.status)}`}
                        >
                          {formatStatusLabel(t.status)}
                        </span>
                      </td>
                      <td>
                        <div className="vesper-action-group">
                          {/* Manage / Details Action */}
                          <button
                            type="button"
                            className="vesper-btn-outline"
                            style={{
                              padding: "4px 10px",
                              fontSize: "12px",
                              gap: "4px",
                            }}
                            onClick={() => setSelectedConsult(t)}
                            title="View visit details and manage link dispatch"
                          >
                            <FileText size={13} /> Manage
                          </button>

                          {/* 1-Click Copy Patient Link */}
                          <button
                            type="button"
                            className="vesper-btn-outline"
                            style={{
                              padding: "4px 10px",
                              fontSize: "12px",
                              gap: "4px",
                            }}
                            title="Copy secure patient consultation invite link"
                            onClick={() =>
                              copyToClipboard(
                                getPatientMeetingLink(t.id),
                                "Patient consultation link",
                                t.id,
                              )
                            }
                          >
                            {copiedId === t.id ? (
                              <Check
                                size={13}
                                className="vesper-text-emerald"
                              />
                            ) : (
                              <Link2 size={13} />
                            )}
                            <span>
                              {copiedId === t.id ? "Copied" : "Copy Link"}
                            </span>
                          </button>

                          {/* Quick Check-in for Booked Patients */}
                          {["booked", "scheduled"].includes(
                            t.status.toLowerCase(),
                          ) && (
                            <button
                              type="button"
                              className="vesper-btn-primary"
                              style={{
                                padding: "4px 10px",
                                fontSize: "12px",
                                gap: "4px",
                                background: "#059669",
                                borderColor: "#059669",
                              }}
                              disabled={actionInProgress === t.id}
                              onClick={() =>
                                void handleStatusChange(t.id, "arrived")
                              }
                              title="Mark patient as arrived in virtual waiting room"
                            >
                              <UserCheck size={13} /> Check In
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="vesper-table-empty">
                      {loading
                        ? "Loading scheduled video consultations..."
                        : searchQuery || statusFilter !== "all"
                          ? "No scheduled consultations match your current filter."
                          : "No scheduled video visits available for this organization."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Card: Telehealth Operations & Dispatch Desk */}
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">
                Telehealth Operations & Media Gateway
              </h2>
              <p className="vesper-card__subtitle">
                Odyssey Private Media Gateway · Virtual Care Oversight
              </p>
            </div>
          </div>

          <div style={{ padding: "4px 0" }}>
            {/* System Status Indicators */}
            <div className="vesper-contact-list">
              <div className="vesper-contact-item">
                <ShieldCheck
                  size={16}
                  className="vesper-text-emerald"
                  style={{ flexShrink: 0 }}
                />
                <div>
                  <strong
                    style={{
                      fontSize: "12.5px",
                      color: "#0f172a",
                      display: "block",
                    }}
                  >
                    Private WebRTC Gateway Operational
                  </strong>
                  <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                    Peer-to-peer encrypted signaling and media relay active.
                  </span>
                </div>
              </div>
              <div className="vesper-contact-item">
                <Lock
                  size={16}
                  className="vesper-text-emerald"
                  style={{ flexShrink: 0 }}
                />
                <div>
                  <strong
                    style={{
                      fontSize: "12.5px",
                      color: "#0f172a",
                      display: "block",
                    }}
                  >
                    Clinical Privacy & Role Restriction
                  </strong>
                  <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                    Video rooms are strictly restricted to attending physicians
                    and verified patients.
                  </span>
                </div>
              </div>
              <div className="vesper-contact-item">
                <CheckCircle2
                  size={16}
                  className="vesper-text-emerald"
                  style={{ flexShrink: 0 }}
                />
                <div>
                  <strong
                    style={{
                      fontSize: "12.5px",
                      color: "#0f172a",
                      display: "block",
                    }}
                  >
                    Integrated SOAP Documentation
                  </strong>
                  <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                    Clinical encounters sync live to patient EHR upon physician
                    admission.
                  </span>
                </div>
              </div>
            </div>

            {/* Admin Operating Guidelines */}
            <div
              style={{
                marginTop: "20px",
                padding: "14px 16px",
                background: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#1e293b",
                  margin: "0 0 8px 0",
                }}
              >
                Administrator Operating Procedures
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "18px",
                  fontSize: "12px",
                  color: "#475569",
                  lineHeight: "1.6",
                }}
              >
                <li>
                  <strong>Dispatch Invites:</strong> Use the <em>Manage</em> or{" "}
                  <em>Copy Link</em> action to send patient access URLs via SMS
                  or email when patients need reconnection.
                </li>
                <li>
                  <strong>Triage & Check-in:</strong> Verify patient contact
                  details and click <em>Check In</em> to place them into the
                  virtual waiting room for the assigned doctor.
                </li>
                <li>
                  <strong>Rescheduling:</strong> Manage appointments directly or
                  open the Booking Manager to reschedule or reassign clinicians.
                </li>
              </ul>
            </div>

            {/* Quick Action Navigation */}
            <div
              style={{
                marginTop: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <Link
                href="/appointments"
                className="vesper-btn-outline"
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Calendar size={14} /> Open Clinic Booking Manager
              </Link>
              <Link
                href="/queue"
                className="vesper-btn-outline"
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Users size={14} /> View Outpatient Queue
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Virtual Consultation Management & Dispatch Modal */}
      {selectedConsult && (
        <div
          className="vesper-modal-backdrop"
          onClick={() => setSelectedConsult(null)}
        >
          <div
            className="vesper-modal vesper-modal--wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="vesper-modal__header">
              <div className="vesper-patient-modal-title-group">
                <div className="vesper-patient-modal-avatar">
                  {selectedConsult.initials}
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <h2 className="vesper-modal__title">
                      {selectedConsult.patientName}
                    </h2>
                    <span
                      className={`vesper-alert-pill ${getStatusPillClass(selectedConsult.status)}`}
                    >
                      {formatStatusLabel(selectedConsult.status)}
                    </span>
                  </div>
                  <p className="vesper-modal__desc">
                    Virtual Care Session • {selectedConsult.serviceType} • Mode:{" "}
                    <strong>{selectedConsult.mode}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="vesper-modal__close-btn"
                onClick={() => setSelectedConsult(null)}
                aria-label="Close session details"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="vesper-modal__body">
              {/* Session Overview Grid */}
              <div className="vesper-patient-info-grid">
                <div className="vesper-info-card">
                  <span className="vesper-info-card__label">
                    Scheduled Time
                  </span>
                  <strong className="vesper-info-card__value">
                    {selectedConsult.appointmentTime}
                  </strong>
                </div>

                <div className="vesper-info-card">
                  <span className="vesper-info-card__label">
                    Attending Clinician
                  </span>
                  <strong className="vesper-info-card__value vesper-text-emerald">
                    {selectedConsult.practitionerName}
                  </strong>
                </div>

                <div className="vesper-info-card">
                  <span className="vesper-info-card__label">Queue / Slip</span>
                  <strong className="vesper-info-card__value">
                    {selectedConsult.queueNumber
                      ? `Queue #${selectedConsult.queueNumber}`
                      : "Direct Booking"}
                  </strong>
                </div>

                <div className="vesper-info-card">
                  <span className="vesper-info-card__label">
                    Patient Contact
                  </span>
                  <strong className="vesper-info-card__value">
                    {selectedConsult.patientTelecom ?? "No phone recorded"}
                  </strong>
                </div>
              </div>

              {/* Secure Link Dispatch Section (Admin Superpower) */}
              <div
                className="vesper-detail-section"
                style={{ marginTop: "16px" }}
              >
                <h3
                  className="vesper-detail-section__title"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Link2 size={15} className="vesper-text-emerald" /> Secure
                  Room Access & Link Dispatch
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    margin: "4px 0 12px 0",
                  }}
                >
                  Consultation audio & video rooms are restricted to the
                  verified patient and attending physician. As clinic
                  administrator, copy and dispatch the direct join links below
                  to assist patients or doctors.
                </p>

                {/* Patient Room Link */}
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                    }}
                  >
                    Patient Consultation Link
                  </label>
                  <div className="vesper-link-box">
                    <input
                      type="text"
                      readOnly
                      value={getPatientMeetingLink(selectedConsult.id)}
                    />
                    <button
                      type="button"
                      className="vesper-btn-outline"
                      style={{
                        padding: "5px 12px",
                        fontSize: "12px",
                        gap: "4px",
                      }}
                      onClick={() =>
                        copyToClipboard(
                          getPatientMeetingLink(selectedConsult.id),
                          "Patient consultation link",
                          `modal-patient-${selectedConsult.id}`,
                        )
                      }
                    >
                      {copiedId === `modal-patient-${selectedConsult.id}` ? (
                        <Check size={13} className="vesper-text-emerald" />
                      ) : (
                        <Copy size={13} />
                      )}
                      <span>
                        {copiedId === `modal-patient-${selectedConsult.id}`
                          ? "Copied"
                          : "Copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Provider Room Link */}
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                    }}
                  >
                    Attending Physician Portal Link
                  </label>
                  <div className="vesper-link-box">
                    <input
                      type="text"
                      readOnly
                      value={getDoctorMeetingLink(selectedConsult.id)}
                    />
                    <button
                      type="button"
                      className="vesper-btn-outline"
                      style={{
                        padding: "5px 12px",
                        fontSize: "12px",
                        gap: "4px",
                      }}
                      onClick={() =>
                        copyToClipboard(
                          getDoctorMeetingLink(selectedConsult.id),
                          "Physician room link",
                          `modal-doctor-${selectedConsult.id}`,
                        )
                      }
                    >
                      {copiedId === `modal-doctor-${selectedConsult.id}` ? (
                        <Check size={13} className="vesper-text-emerald" />
                      ) : (
                        <Copy size={13} />
                      )}
                      <span>
                        {copiedId === `modal-doctor-${selectedConsult.id}`
                          ? "Copied"
                          : "Copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Quick SMS / Messaging Template Dispatch */}
                <div style={{ marginTop: "14px" }}>
                  <button
                    type="button"
                    className="vesper-btn-outline"
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                    onClick={() => {
                      const msg = `Hello ${selectedConsult.patientName}, your virtual medical consultation with ${
                        organization?.name ?? "Odyssey Clinic"
                      } is scheduled for ${selectedConsult.appointmentTime}. Please click the secure link to enter your private consultation room: ${getPatientMeetingLink(
                        selectedConsult.id,
                      )}`;
                      copyToClipboard(
                        msg,
                        "Patient SMS / Messaging invitation template",
                        "modal-sms",
                      );
                    }}
                  >
                    <MessageSquare size={14} />
                    {copiedId === "modal-sms"
                      ? "Invitation Template Copied!"
                      : "Copy SMS / WhatsApp Invitation Template"}
                  </button>
                </div>
              </div>

              {/* Administrative Status Actions */}
              <div
                className="vesper-detail-section"
                style={{ marginTop: "16px" }}
              >
                <h3 className="vesper-detail-section__title">
                  Administrative Status & Triage
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "10px",
                  }}
                >
                  {["booked", "scheduled"].includes(
                    selectedConsult.status.toLowerCase(),
                  ) && (
                    <button
                      type="button"
                      className="vesper-btn-primary"
                      style={{ background: "#059669", borderColor: "#059669" }}
                      disabled={actionInProgress === selectedConsult.id}
                      onClick={() =>
                        void handleStatusChange(selectedConsult.id, "arrived")
                      }
                    >
                      <UserCheck size={14} /> Check In Patient (Mark Ready)
                    </button>
                  )}

                  {selectedConsult.status.toLowerCase() === "arrived" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: "#ecfdf5",
                        color: "#059669",
                        borderRadius: "8px",
                        fontSize: "12.5px",
                        fontWeight: 500,
                      }}
                    >
                      <CheckCircle2 size={16} /> Patient is in the virtual
                      waiting room ready for doctor.
                    </div>
                  )}

                  {["booked", "scheduled", "arrived"].includes(
                    selectedConsult.status.toLowerCase(),
                  ) && (
                    <>
                      <button
                        type="button"
                        className="vesper-btn-outline"
                        disabled={actionInProgress === selectedConsult.id}
                        onClick={() =>
                          void handleStatusChange(selectedConsult.id, "noshow")
                        }
                      >
                        Mark as No-Show
                      </button>
                      <button
                        type="button"
                        className="vesper-btn-outline"
                        style={{ color: "#dc2626", borderColor: "#fecdd3" }}
                        disabled={actionInProgress === selectedConsult.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Are you sure you want to cancel this virtual appointment?",
                            )
                          ) {
                            void handleStatusChange(
                              selectedConsult.id,
                              "cancelled",
                            );
                          }
                        }}
                      >
                        Cancel Appointment
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="vesper-modal__footer">
              <Link
                href="/appointments"
                className="vesper-btn-outline"
                onClick={() => setSelectedConsult(null)}
              >
                <Calendar size={14} /> Open in Booking Schedule
              </Link>
              <Link
                href="/patients"
                className="vesper-btn-outline"
                onClick={() => setSelectedConsult(null)}
              >
                <User size={14} /> View Patient Chart
              </Link>
              <button
                type="button"
                className="vesper-btn-primary"
                onClick={() => setSelectedConsult(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
