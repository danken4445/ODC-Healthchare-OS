"use client";

import {
  createBrowserSupabaseClient,
  getPortalAccess,
  getTeleconsultAppointments,
  resolvePatientTeleconsultClinic,
  setPatientClinicContext,
  signOut,
} from "@odyssey/supabase-client";
import type { TeleconsultAppointment } from "@odyssey/types";
import { Badge, Button, Card, TeleconsultWebRtcRoom } from "@odyssey/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PatientTeleconsultRoomPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(null);
  const [status, setStatus] = useState("Connecting to your medical room…");
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(true);

  useEffect(() => {
    async function loadRoom() {
      setIsAuthorizing(true);
      const client = createBrowserSupabaseClient();
      // On mobile, Supabase restores a persisted session asynchronously. Do not
      // issue authorization RPCs until that restore has completed.
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) {
        setStatus("Your sign-in session is unavailable. Please sign in again to access this room.");
        setIsAuthorizing(false);
        return;
      }
      const access = await getPortalAccess(client, "patient");
      if (access.error || !access.data.allowed) {
        await signOut(client);
        setStatus("Sign in through the patient portal to access this room.");
        setIsAuthorizing(false);
        return;
      }
      let clinicId = window.localStorage.getItem("odyssey.patient.clinic");
      if (!clinicId) {
        const resolvedClinic = await resolvePatientTeleconsultClinic(client, appointmentId);
        if (resolvedClinic.error || !resolvedClinic.data) {
          setStatus("This teleconsultation room is not assigned to your account.");
          setIsAuthorizing(false);
          return;
        }
        clinicId = resolvedClinic.data;
        window.localStorage.setItem("odyssey.patient.clinic", clinicId);
      }
      const context = await setPatientClinicContext(client, clinicId);
      if (context.error) {
        setStatus("This clinic is not available to your patient account.");
        setIsAuthorizing(false);
        return;
      }
      let result = await getTeleconsultAppointments(client, clinicId);
      let room = result.data?.find((item) => item.appointment_id === appointmentId);
      // The saved clinic can be stale when a patient belongs to more than one
      // clinic. Resolve only this assigned appointment and switch context.
      if (!room) {
        const resolvedClinic = await resolvePatientTeleconsultClinic(client, appointmentId);
        if (!resolvedClinic.error && resolvedClinic.data && resolvedClinic.data !== clinicId) {
          clinicId = resolvedClinic.data;
          window.localStorage.setItem("odyssey.patient.clinic", clinicId);
          const refreshedContext = await setPatientClinicContext(client, clinicId);
          if (!refreshedContext.error) {
            result = await getTeleconsultAppointments(client, clinicId);
            room = result.data?.find((item) => item.appointment_id === appointmentId);
          }
        }
      }
      if (result.error || !room) {
        setStatus("This teleconsultation room is not assigned to your account.");
        setIsAuthorizing(false);
        return;
      }
      setAppointment(room);
      setStatus(room.can_join ? "Room access granted." : "The room is outside its join window.");
      setIsAuthorizing(false);
    }
    void loadRoom();
  }, [appointmentId]);

  return (
    <div className="teleconsult-mobile-screen">
      {/* Top Mobile Bar */}
      <header className="teleconsult-top-bar">
        <Link href="/" className="teleconsult-back-link" aria-label="Back to appointments">
          <span className="teleconsult-back-arrow">←</span>
          <span className="teleconsult-back-text">Appointments</span>
        </Link>

        <div className="teleconsult-header-center">
          <h1 className="teleconsult-room-heading">
            {appointment?.practitioner_name ? `Dr. ${appointment.practitioner_name}` : "Teleconsultation"}
          </h1>
          <span className="teleconsult-sub-heading">
            {appointment?.service_type ?? "Remote Care Consultation"}
          </span>
        </div>

        <div className="teleconsult-header-actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {appointment && (
            <button
              type="button"
              className="teleconsult-info-btn"
              onClick={() => setShowInfoSheet(true)}
              aria-label="View appointment details"
              title="Appointment info"
            >
              ℹ️ Details
            </button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await signOut(createBrowserSupabaseClient());
              router.push("/");
            }}
            aria-label="Log out"
            title="Log out"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="teleconsult-stage-container">
        {isAuthorizing ? (
          <div className="teleconsult-loading-box">
            <div className="teleconsult-spinner" />
            <p role="status">{status}</p>
          </div>
        ) : appointment ? (
          appointment.can_join && appointment.room_name ? (
            <div className="teleconsult-video-wrapper">
              <TeleconsultWebRtcRoom
                client={createBrowserSupabaseClient()}
                displayLabel="Patient"
                roomName={appointment.room_name}
                remoteParticipantName={appointment.practitioner_name}
                appointmentTime={formatTime(appointment.start_at)}
                serviceName={appointment.service_type ?? "Virtual Doctor Consultation"}
                onLeave={() => router.push("/")}
              />
            </div>
          ) : (
            <div className="teleconsult-waiting-card">
              <div className="waiting-card-icon">🕒</div>
              <Badge variant="warning">{appointment.room_status}</Badge>
              <h2>Room not open yet</h2>
              <p className="waiting-time-highlight">
                Scheduled for: <strong>{formatTime(appointment.start_at)}</strong>
              </p>
              <p className="waiting-instructions">
                Room access opens 30 minutes before your scheduled appointment and closes two hours after.
                Please check back near the appointment time.
              </p>
              <div className="waiting-card-actions">
                <Button onClick={() => window.location.reload()} variant="default" size="default">
                  🔄 Check room again
                </Button>
                <Link href="/">
                  <Button variant="outline" size="default">
                    ← Back to My Appointments
                  </Button>
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="teleconsult-error-card">
            <div className="waiting-card-icon">⚠️</div>
            <h2>Unable to access room</h2>
            <p role="status">{status}</p>
            <Link href="/">
              <Button variant="default">Return to Patient Portal</Button>
            </Link>
          </div>
        )}
      </main>

      {/* Slide-Up Bottom Sheet Drawer for Appointment Details */}
      {showInfoSheet && appointment && (
        <div className="teleconsult-drawer-backdrop" onClick={() => setShowInfoSheet(false)}>
          <div
            className="teleconsult-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="drawer-handle" />
            <div className="drawer-header">
              <h3 id="drawer-title">Consultation Details</h3>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setShowInfoSheet(false)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-info-row">
                <span className="drawer-label">Clinician</span>
                <span className="drawer-value">🩺 {appointment.practitioner_name}</span>
              </div>
              <div className="drawer-info-row">
                <span className="drawer-label">Service</span>
                <span className="drawer-value">{appointment.service_type ?? "Virtual consultation"}</span>
              </div>
              <div className="drawer-info-row">
                <span className="drawer-label">Scheduled Time</span>
                <span className="drawer-value">🗓️ {formatTime(appointment.start_at)}</span>
              </div>
              <div className="drawer-info-row">
                <span className="drawer-label">Room Status</span>
                <Badge variant={appointment.can_join ? "success" : "warning"}>
                  {appointment.room_status}
                </Badge>
              </div>
              <div className="drawer-info-row">
                <span className="drawer-label">Security</span>
                <span className="drawer-value">🔒 WebRTC Peer-to-Peer Encrypted</span>
              </div>

              <div className="drawer-notice">
                <p>
                  💡 Tip: For the best video quality, make sure you have a steady internet connection
                  and use headphones to reduce microphone echo.
                </p>
              </div>

              <div className="drawer-actions">
                <Button
                  onClick={() => {
                    setShowInfoSheet(false);
                    window.location.reload();
                  }}
                  variant="outline"
                  style={{ width: "100%" }}
                >
                  🔄 Refresh Room Connection
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
