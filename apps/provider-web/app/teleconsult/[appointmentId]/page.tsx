"use client";

import {
  closeTeleconsultRoom,
  createBrowserSupabaseClient,
  getOrganizationClinicalRecords,
  getPortalAccess,
  getTeleconsultAppointments,
  saveSoapNote,
  signOut,
  startAppointmentEncounter,
} from "@odyssey/supabase-client";
import type {
  ObservationSummary,
  OrganizationClinicalRecords,
  TeleconsultAppointment,
} from "@odyssey/types";
import { Badge, Button, TeleconsultWebRtcRoom } from "@odyssey/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

function clinicalText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const text = (value as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function triageValue(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number"
    ? String(item)
    : "";
}

function bloodPressure(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const reading = (value as Record<string, unknown>).blood_pressure;
  if (!reading || typeof reading !== "object" || Array.isArray(reading))
    return "—";
  const bp = reading as Record<string, unknown>;
  return bp.systolic && bp.diastolic ? `${bp.systolic}/${bp.diastolic}` : "—";
}

function ChartIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 5h6M9 3h6v4H9zM7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17M8 12h8M8 16h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export default function ProviderTeleconsultRoomPage() {
  const router = useRouter();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<TeleconsultAppointment | null>(
    null,
  );
  const [clinicalRecords, setClinicalRecords] =
    useState<OrganizationClinicalRecords | null>(null);
  const [status, setStatus] = useState("Authorizing the assigned room…");
  const [busy, setBusy] = useState(false);
  const [chartOpen, setChartOpen] = useState(true);

  async function handleSignOut() {
    await signOut(createBrowserSupabaseClient());
    router.push("/");
  }

  const loadClinicalRecords = useCallback(async (clinicId: string) => {
    const result = await getOrganizationClinicalRecords(
      createBrowserSupabaseClient(),
      clinicId,
    );
    if (result.error) {
      setStatus(`Unable to load the patient chart: ${result.error.message}`);
      return;
    }
    setClinicalRecords(result.data);
  }, []);

  const loadRoom = useCallback(async () => {
    const client = createBrowserSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      setStatus(
        "Your sign-in session is unavailable. Please sign in again to access this room.",
      );
      return;
    }
    const access = await getPortalAccess(client, "provider");
    const clinicId = access.data?.organizationIds[0];
    if (access.error || !access.data?.allowed || !clinicId) {
      await signOut(client);
      setStatus("Sign in through the provider workspace to access this room.");
      return;
    }
    setOrganizationId(clinicId);
    const result = await getTeleconsultAppointments(client, clinicId);
    const room = result.data?.find(
      (item) => item.appointment_id === appointmentId,
    );
    if (result.error || !room) {
      setStatus("This room is not assigned to your provider account.");
      return;
    }
    setAppointment(room);
    setStatus(
      room.can_join
        ? "Secure room ready."
        : "The room is outside its join window.",
    );
    await loadClinicalRecords(clinicId);
  }, [appointmentId, loadClinicalRecords]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  const currentSoapNote = useMemo(
    () =>
      clinicalRecords?.observations.find(
        (item) =>
          item.encounter_id === appointment?.encounter_id &&
          item.code === "SOAP-NOTE",
      ),
    [appointment?.encounter_id, clinicalRecords?.observations],
  );

  const triage = useMemo(
    () =>
      clinicalRecords?.observations.find(
        (item) =>
          item.encounter_id === appointment?.encounter_id &&
          item.code === "TRIAGE-VITALS",
      ),
    [appointment?.encounter_id, clinicalRecords?.observations],
  );

  const noteHistory = useMemo(
    () =>
      (clinicalRecords?.observations ?? []).filter(
        (item) =>
          item.encounter_id === appointment?.encounter_id &&
          item.code.startsWith("SOAP-"),
      ),
    [appointment?.encounter_id, clinicalRecords?.observations],
  );

  async function startVisit() {
    setBusy(true);
    const result = await startAppointmentEncounter(
      createBrowserSupabaseClient(),
      appointmentId,
    );
    if (result.error) {
      setStatus(`Unable to start encounter: ${result.error.message}`);
    } else {
      await loadRoom();
      setChartOpen(true);
      setStatus(
        "Encounter started. The patient chart is ready for documentation.",
      );
    }
    setBusy(false);
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appointment?.encounter_id || !organizationId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    const result = await saveSoapNote(createBrowserSupabaseClient(), {
      encounterId: appointment.encounter_id,
      text: String(fields.get("text") ?? "").trim(),
      supersedesId: currentSoapNote?.id,
    });
    if (result.error) {
      setStatus(`Unable to save consultation note: ${result.error.message}`);
    } else {
      await loadClinicalRecords(organizationId);
      setStatus(
        currentSoapNote
          ? "Consultation note revision saved."
          : "Consultation note saved.",
      );
    }
    setBusy(false);
  }

  async function closeRoom() {
    if (!organizationId) return;
    setBusy(true);
    const result = await closeTeleconsultRoom(
      createBrowserSupabaseClient(),
      appointmentId,
    );
    if (result.error)
      setStatus(`Unable to close room: ${result.error.message}`);
    else {
      await loadRoom();
      setStatus("Teleconsult room closed.");
    }
    setBusy(false);
  }

  return (
    <main className="provider-call-shell">
      <header className="provider-call-header">
        <div className="provider-call-heading">
          <Link
            className="provider-call-back"
            href="/teleconsult"
            aria-label="Back to meeting rooms"
          >
            ←
          </Link>
          <div>
            <p className="provider-call-eyebrow">Virtual consultation</p>
            <h1>{appointment?.patient_name ?? "Teleconsult room"}</h1>
            {appointment && (
              <p>
                {appointment.service_type ?? "General consultation"} ·{" "}
                {new Date(appointment.start_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="provider-call-header-actions">
          {appointment && (
            <Badge
              variant={appointment.room_status === "open" ? "success" : "muted"}
            >
              {appointment.room_status}
            </Badge>
          )}
          <Button
            aria-controls="patient-chart-panel"
            aria-expanded={chartOpen}
            className="chart-toggle"
            onClick={() => setChartOpen((open) => !open)}
            variant={chartOpen ? "secondary" : "default"}
          >
            <ChartIcon />{" "}
            {chartOpen ? "Hide patient chart" : "Open patient chart"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleSignOut()}
            aria-label="Log out"
            title="Log out"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </Button>
        </div>
      </header>

      <div className="provider-call-status" role="status" aria-live="polite">
        <span className="provider-call-status-dot" />
        {status}
      </div>

      {appointment && (
        <>
          <div
            className={`provider-call-layout ${chartOpen ? "with-chart" : "video-only"}`}
          >
            <section
              className="provider-call-video"
              aria-label="Video consultation"
            >
              <div className="provider-call-video-actions">
                <div>
                  <strong>Consultation room</strong>
                  <span>Private video session</span>
                </div>
                <div>
                  {!appointment.encounter_id && (
                    <Button disabled={busy} onClick={() => void startVisit()}>
                      Start encounter
                    </Button>
                  )}
                  {appointment.room_status !== "closed" &&
                    appointment.room_status !== "cancelled" && (
                      <Button
                        disabled={busy}
                        variant="destructive"
                        onClick={() => void closeRoom()}
                      >
                        Close room
                      </Button>
                    )}
                </div>
              </div>
              {appointment.can_join && appointment.room_name ? (
                <TeleconsultWebRtcRoom
                  client={createBrowserSupabaseClient()}
                  displayLabel="Clinician"
                  remoteParticipantName={appointment.patient_name}
                  appointmentTime={appointment.start_at}
                  serviceName={appointment.service_type ?? undefined}
                  roomName={appointment.room_name}
                />
              ) : (
                <div className="provider-call-unavailable">
                  <h2>Video unavailable</h2>
                  <p>
                    The secure room becomes available during the appointment
                    join window.
                  </p>
                </div>
              )}
            </section>

            {chartOpen && (
              <aside
                className="patient-chart-panel"
                id="patient-chart-panel"
                aria-label="Patient chart"
              >
                <div className="patient-chart-header">
                  <div>
                    <p className="provider-call-eyebrow">
                      Clinical documentation
                    </p>
                    <h2>Patient chart</h2>
                  </div>
                  <button
                    className="patient-chart-close"
                    type="button"
                    onClick={() => setChartOpen(false)}
                    aria-label="Close patient chart"
                  >
                    ×
                  </button>
                </div>
                <div className="patient-chart-identity">
                  <span aria-hidden="true">
                    {appointment.patient_name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <strong>{appointment.patient_name}</strong>
                    <small>
                      {appointment.service_type ?? "Virtual consultation"}
                    </small>
                  </div>
                </div>

                {!appointment.encounter_id ? (
                  <div className="patient-chart-empty">
                    <ChartIcon />
                    <h3>Start the encounter to document</h3>
                    <p>The chart will stay open alongside the video call.</p>
                    <Button disabled={busy} onClick={() => void startVisit()}>
                      Start encounter
                    </Button>
                  </div>
                ) : (
                  <div className="patient-chart-content">
                    <section className="chart-section">
                      <div className="chart-section-heading">
                        <h3>Visit overview</h3>
                        <Badge variant="success">In progress</Badge>
                      </div>
                      {triage ? (
                        <TriageSummary observation={triage} />
                      ) : (
                        <p className="chart-muted">
                          No triage assessment is recorded for this visit.
                        </p>
                      )}
                    </section>
                    <section className="chart-section chart-note-section">
                      <div className="chart-section-heading">
                        <h3>Consultation note</h3>
                        <span>{currentSoapNote ? "Revision" : "New note"}</span>
                      </div>
                      <form onSubmit={saveNote}>
                        <label htmlFor="consultation-note">
                          SOAP documentation
                        </label>
                        <textarea
                          id="consultation-note"
                          name="text"
                          rows={14}
                          maxLength={20000}
                          key={currentSoapNote?.id ?? appointment.encounter_id}
                          defaultValue={
                            currentSoapNote
                              ? clinicalText(currentSoapNote.value)
                              : ""
                          }
                          placeholder={
                            "Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:"
                          }
                          required
                        />
                        <div className="chart-save-row">
                          <span>
                            Saved notes are versioned in the patient record.
                          </span>
                          <Button disabled={busy} type="submit">
                            {busy ? "Saving…" : "Save note"}
                          </Button>
                        </div>
                      </form>
                    </section>
                    {noteHistory.length > 0 && (
                      <details className="chart-history">
                        <summary>Note history ({noteHistory.length})</summary>
                        {noteHistory.map((note) => (
                          <article key={note.id}>
                            <strong>{note.code_display}</strong>
                            <p>{clinicalText(note.value)}</p>
                            <small>
                              {note.effective_at
                                ? new Date(note.effective_at).toLocaleString()
                                : ""}
                            </small>
                          </article>
                        ))}
                      </details>
                    )}
                    <Link
                      className="full-chart-link"
                      href={`/?encounter=${appointment.encounter_id}`}
                    >
                      Open full clinical workspace →
                    </Link>
                  </div>
                )}
              </aside>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function TriageSummary({ observation }: { observation: ObservationSummary }) {
  return (
    <div className="triage-summary">
      <div>
        <span>Blood pressure</span>
        <strong>
          {bloodPressure(observation.value)} <small>mmHg</small>
        </strong>
      </div>
      <div>
        <span>Pulse</span>
        <strong>
          {triageValue(observation.value, "pulse_bpm") || "—"}{" "}
          <small>bpm</small>
        </strong>
      </div>
      <div>
        <span>Temperature</span>
        <strong>
          {triageValue(observation.value, "temperature_c") || "—"}{" "}
          <small>°C</small>
        </strong>
      </div>
      <div>
        <span>SpO₂</span>
        <strong>
          {triageValue(observation.value, "oxygen_saturation_percent") || "—"}{" "}
          <small>%</small>
        </strong>
      </div>
      {triageValue(observation.value, "chief_complaint") && (
        <p>
          <span>Chief complaint</span>
          <strong>{triageValue(observation.value, "chief_complaint")}</strong>
        </p>
      )}
    </div>
  );
}
