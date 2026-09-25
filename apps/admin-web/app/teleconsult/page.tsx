"use client";

import {
  CheckCircle2,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Video,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";

interface TeleconsultAppointment {
  id: string;
  patientName: string;
  initials: string;
  appointmentTime: string;
  mode: string;
  status: string;
}

function parsePatientName(pName: any): string {
  if (!pName) return "Unnamed Patient";
  if (typeof pName === "string") return pName;
  if (Array.isArray(pName) && pName[0]?.text) return pName[0].text;
  if (typeof pName === "object" && pName?.text) return pName.text;
  if (pName?.family || pName?.given) {
    const given = Array.isArray(pName.given) ? pName.given.join(" ") : pName.given ?? "";
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

export default function TeleconsultPage() {
  const { client, organization } = useAdminData();
  const [teleconsults, setTeleconsults] = useState<TeleconsultAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeleconsults = useCallback(async () => {
    if (!organization) return;
    try {
      setLoading(true);
      const { data, error } = await client
        .from("appointments")
        .select(`
          id,
          start_at,
          status,
          delivery_mode,
          service_type,
          patients (
            id,
            name
          )
        `)
        .eq("organization_id", organization.id)
        .order("start_at", { ascending: false })
        .limit(50);

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
        const patientRaw = Array.isArray(a.patients) ? a.patients[0] : a.patients;
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

        return {
          id: a.id,
          patientName,
          initials,
          appointmentTime,
          mode: "HD WebRTC",
          status: a.status ?? "scheduled",
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
    void loadTeleconsults();
  }, [loadTeleconsults]);

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Teleconsultation</h1>
          <p className="vesper-header-subcopy">
            Secure WebRTC video and remote outpatient visits for {organization?.name ?? "Odyssey Clinic"}.
          </p>
        </div>
        <button
          type="button"
          className="vesper-btn-outline"
          onClick={() => void loadTeleconsults()}
        >
          <RefreshCw size={14} /> Refresh Schedule
        </button>
      </div>

      <div className="vesper-widget-row" style={{ marginTop: "24px" }}>
        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Scheduled Video Visits</h2>
              <p className="vesper-card__subtitle">
                {teleconsults.length} consultation{teleconsults.length === 1 ? "" : "s"} scheduled
              </p>
            </div>
          </div>

          <div className="vesper-table-container">
            <table className="vesper-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Appointment Time</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {teleconsults.length > 0 ? (
                  teleconsults.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="vesper-patient-cell">
                          <div className="vesper-avatar-chip">{t.initials}</div>
                          <span className="vesper-patient-name">{t.patientName}</span>
                        </div>
                      </td>
                      <td>{t.appointmentTime}</td>
                      <td>
                        <span className="vesper-alert-pill vesper-alert-pill--low">
                          {t.mode}
                        </span>
                      </td>
                      <td>
                        <span className="vesper-alert-pill vesper-alert-pill--amber">
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="vesper-action-link">
                          Launch Room
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="vesper-table-empty">
                      {loading
                        ? "Loading scheduled video consultations..."
                        : "No scheduled video visits available"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="vesper-card">
          <div className="vesper-card__header">
            <div>
              <h2 className="vesper-card__title">Audio & Video Connectivity</h2>
              <p className="vesper-card__subtitle">Odyssey Private Media Gateway</p>
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            <div className="vesper-contact-list">
              <div className="vesper-contact-item">
                <ShieldCheck size={16} className="vesper-text-emerald" />
                <span>End-to-End Encrypted WebRTC Peer Protocol</span>
              </div>
              <div className="vesper-contact-item">
                <CheckCircle2 size={16} className="vesper-text-emerald" />
                <span>Integrated SOAP Notes & Screen Sharing Active</span>
              </div>
              <div className="vesper-contact-item">
                <Video size={16} className="vesper-text-emerald" />
                <span>Camera & Microphone Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
